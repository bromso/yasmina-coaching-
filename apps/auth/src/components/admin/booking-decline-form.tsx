"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { declineBooking } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"

/** **Decline** on a pending request, with an optional note to the customer. */
export function BookingDeclineForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(declineBooking, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const idPrefix = "decline-"
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="decline-note">Note to the customer (optional)</Label>
        <Textarea
          id="decline-note"
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={values?.note ?? ""}
          {...fieldAria("note", state, undefined, { idPrefix })}
        />
        <FieldError name="note" state={state} idPrefix={idPrefix} />
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="outline" disabled={pending}>
          {pending ? "Declining…" : "Decline request"}
        </Button>
      </div>
    </form>
  )
}
