"use client"

import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { createNote } from "@/app/notes/actions"
import type { NoteFormState } from "@/lib/note-form"

const initialState: NoteFormState = { ok: true }

/** Adds a note to `workspaceId`, the workspace the page was rendered for. */
export function NoteForm({ workspaceId }: { workspaceId: number }) {
  const t = useTranslations("app.notes.form")
  const [state, action, pending] = useActionState(createNote, initialState)
  // React resets the form after every action; defaultValue brings the typed values back on error.
  const values = state.ok ? undefined : state.values

  return (
    <form action={action} className="grid gap-4">
      <input type="hidden" name="workspaceId" value={workspaceId} />
      <div className="grid gap-2">
        <Label htmlFor="title">{t("title")}</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={values?.title} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="body">{t("body")}</Label>
        <Textarea id="body" name="body" rows={4} maxLength={10_000} defaultValue={values?.body} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {t(pending ? "saving" : "submit")}
      </Button>
    </form>
  )
}
