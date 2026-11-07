"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { cancelBooking } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"

/** **Cancel** on a confirmed, future booking: a required "Yes, cancel" box instead of a JS confirm. */
export function BookingCancelForm({ id }: { id: number }) {
  const [state, action, pending] = useActionState(cancelBooking, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const idPrefix = "cancel-"
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="cancel-note">Note to the customer (optional)</Label>
        <Textarea
          id="cancel-note"
          name="note"
          rows={3}
          maxLength={2000}
          defaultValue={values?.note ?? ""}
          {...fieldAria("note", state, undefined, { idPrefix })}
        />
        <FieldError name="note" state={state} idPrefix={idPrefix} />
      </div>
      <div className="flex items-center gap-2">
        {/* Native, not the Radix Checkbox: that one submits its value only once hydrated. */}
        <input
          type="checkbox"
          id="cancel-confirm"
          name="confirm"
          value="yes"
          className="size-4 accent-primary"
        />
        <Label htmlFor="cancel-confirm">Yes, cancel this booking</Label>
      </div>
      <FormMessage state={state} />
      <div>
        <Button type="submit" variant="destructive" disabled={pending}>
          {pending ? "Cancelling…" : "Cancel booking"}
        </Button>
      </div>
    </form>
  )
}
