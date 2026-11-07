import { type NotePage, type Role, roleAtLeast } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { LiveNotes } from "@/components/live-notes"
import { NoteForm } from "@/components/note-form"

/**
 * Who is looking, and where: decides which controls the page offers (the api enforces them).
 * `locale` reaches the note dates, which render under a client component (`LiveNotes`).
 */
type Viewer = {
  workspace: { id: number; name: string }
  role: Role
  userId: number
  locale: Locale
}

type NotesViewProps = Viewer & {
  firstPage: boolean
  renderedAt: number
  /** Origin of the auth app, for `LiveNotes`' sign-in link after a 401 ends the stream for good. */
  authUrl: string
  /** Where that link should return to — the same URL the header's own `SignInLink` carries. */
  signInNext: string
} & ({ page: NotePage; cursor?: number } | { error: string })

/** Plain links: paging works without client JavaScript. */
function Pager({ page, cursor }: { page: NotePage; cursor?: number }) {
  const t = useTranslations("app.notes")
  if (cursor === undefined && page.nextCursor === null) return null
  return (
    <nav aria-label={t("pages")} className="flex justify-between gap-4">
      {cursor !== undefined ? (
        <Button asChild variant="outline">
          <Link href="/notes">{t("newest")}</Link>
        </Button>
      ) : (
        <span />
      )}
      {page.nextCursor !== null && (
        <Button asChild variant="outline">
          <Link href={`/notes?cursor=${page.nextCursor}`}>{t("older")}</Link>
        </Button>
      )}
    </nav>
  )
}

export function NotesView(props: NotesViewProps) {
  const { workspace, role, userId, locale, firstPage, renderedAt, authUrl, signInNext } = props
  const t = useTranslations("app")
  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-8 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">
          {t("notes.title", { workspace: workspace.name })}
        </h1>
        <p className="text-muted-foreground">{t("notes.role", { role: t("role", { role }) })}</p>
        <p className="text-muted-foreground">{t("notes.intro")}</p>
      </header>
      {roleAtLeast(role, "member") ? (
        <NoteForm workspaceId={workspace.id} />
      ) : (
        <p className="text-muted-foreground">{t("notes.viewerHint")}</p>
      )}
      {"error" in props ? (
        <Alert variant="destructive">
          <AlertTitle>{t("notes.unavailable")}</AlertTitle>
          <AlertDescription>{props.error}</AlertDescription>
        </Alert>
      ) : (
        <>
          <LiveNotes
            notes={props.page.items}
            firstPage={firstPage}
            older={!firstPage}
            renderedAt={renderedAt}
            locale={locale}
            authUrl={authUrl}
            signInNext={signInNext}
            viewer={{
              userId,
              workspaceId: workspace.id,
              canDeleteOthers: roleAtLeast(role, "admin"),
            }}
          />
          <Pager page={props.page} cursor={props.cursor} />
        </>
      )}
    </main>
  )
}
