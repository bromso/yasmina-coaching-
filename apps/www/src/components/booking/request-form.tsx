"use client"

import {
  BOOKING_ATTENDEES_MAX,
  BOOKING_DAY_PARTS,
  BOOKING_MAX_PREFERRED_DATES,
  type BookingLocation,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { requestBooking } from "@/app/actions"
import { CustomerFields, Fieldset, LocationField, value } from "@/components/booking/details-fields"
import { useBookingCopy } from "@/components/booking/locale-provider"
import type { BookingFormState } from "@/lib/booking"

type RequestFormProps = {
  offering: OfferingKey
  locations: readonly BookingLocation[]
  /** Tomorrow in the booking zone (`YYYY-MM-DD`), the earliest date to propose. */
  minDate: string
}

const initialState: BookingFormState = { ok: false }
/** `date_1`…`date_3`, as `requestBookingCore` reads them. */
const DATE_SLOTS = Array.from({ length: BOOKING_MAX_PREFERRED_DATES }, (_, i) => i + 1)

const selectClass =
  "border-input h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm"

/**
 * A request for a workshop, enterprise programme or keynote: organisation and contact, where,
 * up to three preferred dates with a part of day each, attendees, venue and a message. A plain
 * `<form action>`, so it works without JavaScript; the server re-checks every date is tomorrow
 * or later, the browser's `min` being only a hint.
 */
export function RequestForm({ offering, locations, minDate }: RequestFormProps) {
  const copy = useBookingCopy()
  const text = copy.request
  const [state, action, pending] = useActionState(requestBooking, initialState)
  return (
    <form action={action} noValidate className="grid gap-6">
      <FormMessage state={state} />
      <input type="hidden" name="offering" value={offering} />
      <p className="text-muted-foreground text-sm">{text.intro}</p>
      <CustomerFields state={state} organisation="required" />
      <LocationField locations={locations} state={state} />

      <Fieldset legend={text.datesLegend} hint={text.datesHint}>
        {DATE_SLOTS.map((n) => (
          <div key={n} className="grid gap-2 sm:grid-cols-2 sm:gap-3">
            <div className="grid gap-2">
              <Label htmlFor={`date_${n}`}>{text.dateLabel(n)}</Label>
              <Input
                id={`date_${n}`}
                name={`date_${n}`}
                type="date"
                min={minDate}
                required={n === 1}
                className="h-11"
                defaultValue={value(state, `date_${n}`)}
                {...fieldAria(`date_${n}`, state)}
              />
              <FieldError name={`date_${n}`} state={state} />
            </div>
            <div className="grid gap-2">
              <Label htmlFor={`part_${n}`}>{text.partLabel(n)}</Label>
              <select
                id={`part_${n}`}
                name={`part_${n}`}
                defaultValue={value(state, `part_${n}`, "full_day")}
                className={selectClass}
                {...fieldAria(`part_${n}`, state)}
              >
                {BOOKING_DAY_PARTS.map((part) => (
                  <option key={part} value={part}>
                    {copy.dayPartLabels[part]}
                  </option>
                ))}
              </select>
              <FieldError name={`part_${n}`} state={state} />
            </div>
          </div>
        ))}
      </Fieldset>

      <div className="grid gap-2">
        <Label htmlFor="attendees">{text.attendeesLabel}</Label>
        <Input
          id="attendees"
          name="attendees"
          type="number"
          inputMode="numeric"
          min={1}
          max={BOOKING_ATTENDEES_MAX}
          className="h-11 sm:max-w-40"
          defaultValue={value(state, "attendees")}
          {...fieldAria("attendees", state)}
        />
        <FieldError name="attendees" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="venue">{text.venueLabel}</Label>
        <Input
          id="venue"
          name="venue"
          autoComplete="street-address"
          className="h-11"
          defaultValue={value(state, "venue")}
          {...fieldAria("venue", state)}
        />
        <FieldError name="venue" state={state} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="message">{text.messageLabel}</Label>
        <p id="message-hint" className="text-muted-foreground text-sm">
          {text.messageHint}
        </p>
        <Textarea
          id="message"
          name="message"
          rows={6}
          required
          defaultValue={value(state, "message")}
          {...fieldAria("message", state, "message-hint")}
        />
        <FieldError name="message" state={state} />
      </div>
      <p className="text-muted-foreground text-xs">{text.legal}</p>
      <Button type="submit" size="lg" disabled={pending} className="w-fit rounded-full px-6">
        {pending ? text.submitting : text.submit}
      </Button>
    </form>
  )
}
