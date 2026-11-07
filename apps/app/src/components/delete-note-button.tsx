"use client"

import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"
import { type MouseEvent, useActionState, useRef, useState } from "react"
import { deleteNote } from "@/app/notes/actions"
import { ConfirmDialog } from "@/components/confirm-dialog"
import type { DeleteNoteState } from "@/lib/note-form"

const initialState: DeleteNoteState = { ok: true }

/**
 * Deletes one note after a confirmation. Without JavaScript the button submits the form directly;
 * with it, the click opens the dialog and **Delete** there submits the same form.
 */
export function DeleteNoteButton({
  noteId,
  workspaceId,
  titleId,
}: {
  noteId: number
  workspaceId: number
  /** The id of the note's visible title, so the button reads "Delete, <title>". */
  titleId: string
}) {
  const t = useTranslations("app.notes.delete")
  const [state, action, pending] = useActionState(deleteNote, initialState)
  const [open, setOpen] = useState(false)
  const form = useRef<HTMLFormElement>(null)
  const errorId = `${titleId}-delete-error`

  const ask = (event: MouseEvent) => {
    event.preventDefault()
    setOpen(true)
  }
  const confirm = () => {
    setOpen(false)
    form.current?.requestSubmit()
  }

  return (
    <>
      <form ref={form} action={action} className="grid justify-items-start gap-2">
        <input type="hidden" name="noteId" value={noteId} />
        <input type="hidden" name="workspaceId" value={workspaceId} />
        <Button
          type="submit"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={ask}
          aria-describedby={state.ok ? titleId : `${titleId} ${errorId}`}
        >
          {t(pending ? "deleting" : "button")}
        </Button>
        {!state.ok && (
          <p id={errorId} role="alert" className="text-destructive text-sm">
            {state.message}
          </p>
        )}
      </form>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("confirmTitle")}
        desc={t("confirmDescription")}
        confirmText={t("confirm")}
        destructive
        isLoading={pending}
        handleConfirm={confirm}
      />
    </>
  )
}
