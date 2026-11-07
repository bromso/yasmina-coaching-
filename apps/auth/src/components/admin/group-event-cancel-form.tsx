"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { cancelGroupEvent } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"

/** Cancels one group event (its seat holders are told by the api); folded away until opened. */
export function GroupEventCancelForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(cancelGroupEvent, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const idPrefix = `event-${id}-`
  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-muted-foreground hover:text-foreground">
        Cancel…
      </summary>
      <form action={action} className="mt-2 grid gap-3">
        <input type="hidden" name="id" value={id} />
        <div className="grid gap-1.5">
          <Label htmlFor={`${idPrefix}note`}>Note to the seat holders (optional)</Label>
          <Textarea
            id={`${idPrefix}note`}
            name="note"
            rows={2}
            maxLength={2000}
            defaultValue={values?.note ?? ""}
            {...fieldAria("note", state, undefined, { idPrefix })}
          />
          <FieldError name="note" state={state} idPrefix={idPrefix} />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id={`${idPrefix}confirm`}
            name="confirm"
            value="yes"
            className="size-4 accent-primary"
          />
          <Label htmlFor={`${idPrefix}confirm`}>Yes, cancel this event</Label>
        </div>
        <FormMessage state={state} />
        <div>
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            {pending ? "Cancelling…" : "Cancel event"}
          </Button>
        </div>
      </form>
    </details>
  )
}
