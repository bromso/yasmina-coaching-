"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { deleteLead } from "@/app/admin/(gated)/leads/actions"
import type { FormState } from "@/lib/admin-actions"

/**
 * Delete on request, in two steps on the page itself: **Delete lead…** opens the form, and the
 * delete button needs its "Yes, delete" box ticked (checked again on the server). No browser
 * dialog, and it works without JavaScript.
 */
export function DeleteLeadForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(deleteLead, { ok: false } as FormState)
  return (
    <details className="text-sm" open={!state.ok && Boolean(state.fieldErrors || state.message)}>
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Delete lead…
      </summary>
      <form action={action} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={id} />
        <p className="text-muted-foreground">
          Deletes the answers, the contact details and your notes now, for a visitor who asked to be
          forgotten. The audit log keeps only the lead's id.
        </p>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            name="confirm"
            value="yes"
            className="size-4"
            {...fieldAria("confirm", state)}
          />
          Yes, delete this lead permanently
        </label>
        <FieldError name="confirm" state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            Delete permanently
          </Button>
          <FormMessage state={state} />
        </div>
      </form>
    </details>
  )
}
