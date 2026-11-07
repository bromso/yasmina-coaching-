"use client"

import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { useActionState } from "react"
import { cancelBooking } from "@/app/actions"
import { choiceClass, choiceInputClass } from "@/components/booking/details-fields"
import { useBookingCopy } from "@/components/booking/locale-provider"
import type { BookingFormState } from "@/lib/booking"

type CancelFormProps = {
  token: string
  bookingId: number
  /** What is being cancelled, for the checkbox's accessible name. */
  label: string
}

const initialState: BookingFormState = { ok: false }

/**
 * "Cancel this session": a plain `<form action>` with a "Yes, cancel" checkbox in place of a
 * JavaScript dialog, so the page works without any. Several of these share the page, so every
 * id is prefixed with the booking's own.
 */
export function CancelForm({ token, bookingId, label }: CancelFormProps) {
  const { cancel } = useBookingCopy()
  const [state, action, pending] = useActionState(cancelBooking, initialState)
  const idPrefix = `cancel-${bookingId}-`
  return (
    <form action={action} noValidate className="grid gap-3">
      <input type="hidden" name="token" value={token} />
      <input type="hidden" name="bookingId" value={bookingId} />
      <FormMessage state={state} />
      <label className={choiceClass}>
        <input
          type="checkbox"
          name="confirm"
          value="yes"
          className={choiceInputClass}
          {...fieldAria("confirm", state, undefined, { idPrefix })}
        />
        <span>
          {cancel.confirm}
          <span className="sr-only"> ({label})</span>
        </span>
      </label>
      <FieldError name="confirm" state={state} idPrefix={idPrefix} />
      <Button
        type="submit"
        variant="outline"
        disabled={pending}
        className="min-h-11 w-fit rounded-full px-5"
      >
        {pending ? cancel.cancelling : cancel.submit}
      </Button>
    </form>
  )
}
