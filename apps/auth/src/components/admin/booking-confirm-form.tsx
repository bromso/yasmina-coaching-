"use client"

import {
  type BookingLocation,
  OFFERINGS,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { NativeSelect } from "@repo/ui/components/native-select"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { confirmBooking } from "@/app/admin/(gated)/bookings/actions"
import type { FormState } from "@/lib/admin-booking-actions"
import { LOCATION_LABELS } from "@/lib/booking-labels"

/**
 * **Confirm** on a pending request: a Stockholm start time, the duration (the offering's by
 * default), a location the offering is available at, and an optional note to the customer.
 */
export function BookingConfirmForm({
  id,
  offering,
  location,
  defaultStart,
}: {
  id: number
  offering: OfferingKey
  /** What the customer asked for; preselected when the offering allows it. */
  location: BookingLocation
  /** `suggestedStart()` from the first proposed date, as a datetime-local value. */
  defaultStart: string
}) {
  const [state, action, pending] = useActionState(confirmBooking, { ok: false } as FormState)
  const values = !state.ok ? state.values : undefined
  const spec = OFFERINGS[offering]
  const idPrefix = "confirm-"
  return (
    <form action={action} className="grid gap-3">
      <input type="hidden" name="id" value={id} />
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-startsAt">Starts (Stockholm time)</Label>
        <Input
          id="confirm-startsAt"
          name="startsAt"
          type="datetime-local"
          step={900}
          required
          defaultValue={values?.startsAt ?? defaultStart}
          {...fieldAria("startsAt", state, undefined, { idPrefix })}
        />
        <FieldError name="startsAt" state={state} idPrefix={idPrefix} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-durationMinutes">Duration (minutes)</Label>
          <Input
            id="confirm-durationMinutes"
            name="durationMinutes"
            type="number"
            min={15}
            max={600}
            step={15}
            defaultValue={values?.durationMinutes ?? String(spec.durationMinutes)}
            {...fieldAria("durationMinutes", state, undefined, { idPrefix })}
          />
          <FieldError name="durationMinutes" state={state} idPrefix={idPrefix} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="confirm-location">Location</Label>
          <NativeSelect
            id="confirm-location"
            name="location"
            defaultValue={
              values?.location ?? (spec.locations.includes(location) ? location : spec.locations[0])
            }
            {...fieldAria("location", state, undefined, { idPrefix })}
          >
            {spec.locations.map((l) => (
              <option key={l} value={l}>
                {LOCATION_LABELS[l]}
              </option>
            ))}
          </NativeSelect>
          <FieldError name="location" state={state} idPrefix={idPrefix} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="confirm-note">Note to the customer (optional)</Label>
        <Textarea
          id="confirm-note"
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
        <Button type="submit" disabled={pending}>
          {pending ? "Confirming…" : "Confirm booking"}
        </Button>
      </div>
    </form>
  )
}
