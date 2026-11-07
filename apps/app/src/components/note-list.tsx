import type { Note } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { useTranslations } from "next-intl"
import { DeleteNoteButton } from "@/components/delete-note-button"

// `Note` above is a type-only import (erased at build time): this file is rendered inside
// `LiveNotes`, a client component, and must not pull `@repo/api-contract`'s full index into the
// browser bundle the way importing `roleAtLeast` here would. The caller (notes-view.tsx, server
// only) computes `canDeleteOthers` once and passes it down instead.
export type NoteListViewer = { userId: number; workspaceId: number; canDeleteOthers: boolean }

// The page's locale and a fixed zone (see `@repo/i18n/dates`): the server render and a
// client-rendered live update (this component also renders inside `LiveNotes` after a realtime
// event) must print the same string.
const formatCreatedAt = (iso: string, locale: Locale) =>
  `${formatUtcDate(iso, locale, { time: true })} UTC`

/** `older`: a cursor is set, so an empty list means this page ran past the oldest note. */
export function NoteList({
  notes,
  older,
  viewer,
  locale,
}: {
  notes: Note[]
  older: boolean
  viewer: NoteListViewer
  locale: Locale
}) {
  const t = useTranslations("app.notes")
  if (notes.length === 0) {
    return <p className="text-muted-foreground">{t(older ? "emptyOlder" : "empty")}</p>
  }
  return (
    <ul className="grid gap-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Card>
            <CardHeader>
              <CardTitle id={`note-${note.id}-title`}>{note.title}</CardTitle>
              <CardDescription>
                <time dateTime={note.createdAt}>{formatCreatedAt(note.createdAt, locale)}</time>
                {/* Authorship shows only when it is worth calling out: a note created through an
                    API key names the key (it survives the key's own revocation), otherwise only
                    when it is gone — the author's account was deleted. */}
                {note.apiKey ? (
                  <> · {t("viaApiKey", { name: note.apiKey.name })}</>
                ) : (
                  note.authorId === null && <> · {t("deletedUser")}</>
                )}
              </CardDescription>
            </CardHeader>
            {note.body && (
              <CardContent>
                <p className="whitespace-pre-wrap">{note.body}</p>
              </CardContent>
            )}
            {(note.authorId === viewer.userId || viewer.canDeleteOthers) && (
              <CardContent>
                <DeleteNoteButton
                  noteId={note.id}
                  workspaceId={viewer.workspaceId}
                  titleId={`note-${note.id}-title`}
                />
              </CardContent>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}
