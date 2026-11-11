"use client"

import {
  BOOKING_ATTENDEES_MAX,
  BOOKING_DAY_PARTS,
  BOOKING_MAX_PREFERRED_DATES,
  type BookingDayPart,
  type BookingLocation,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState, useState } from "react"
import { requestBooking } from "@/app/actions"
import { CustomerFields, Fieldset, LocationField, value } from "@/components/booking/details-fields"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { StepIndicator } from "@/components/booking/step-indicator"
import {
  checkDetails,
  fieldText,
  primaryClass,
  StepNav,
  StepPanel,
} from "@/components/booking/step-panel"
import { useBookingSteps } from "@/components/booking/use-booking-steps"
import type { BookingFormState } from "@/lib/booking"
import { formatDateKey } from "@/lib/booking-dates"

type RequestFormProps = {
  offering: OfferingKey
  locations: readonly BookingLocation[]
  /** Tomorrow in the booking zone (`YYYY-MM-DD`), the earliest date to propose. */
  minDate: string
}

const initialState: BookingFormState = { ok: false }
/** `date_1`…`date_3`, as `requestBookingCore` reads them. */
const DATE_SLOTS = Array.from({ length: BOOKING_MAX_PREFERRED_DATES }, (_, i) => i + 1)

/** Each step's fields, so a refusal from the server reopens the step that holds the field. */
const STEP_FIELDS = [
  [
    "location",
    "attendees",
    "venue",
    "message",
    "preferredDates",
    ...DATE_SLOTS.flatMap((n) => [`date_${n}`, `part_${n}`]),
  ],
  ["name", "email", "organisation", "phone"],
]

/**
 * Without JavaScript every step shows at once, as one long form with its submit button at the end,
 * and the stepper and Back / Continue rows (which need JavaScript) are left out.
 */
const NO_SCRIPT_CSS =
  ".step-panel{display:grid!important}.step-nav,.step-indicator{display:none!important}"

type Review = {
  message: string
  dates: string[]
  location: string
  attendees: string
  venue: string
  contact: string[]
}

const selectClass =
  "border-input h-11 w-full rounded-md border bg-transparent px-3 text-base shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm"

/**
 * A request for a workshop, enterprise programme or keynote, in three steps: what and when
 * (where, up to three preferred dates with a part of day each, attendees, venue and a message),
 * who (organisation and contact), then a review before sending; `/book/done` is the fourth. No
 * payment: the visitor gets a quote and pays by invoice after confirming. Still a plain
 * `<form action>` that works without JavaScript (every step then shows at once); the server
 * re-checks every date is tomorrow or later, the browser's `min` being only a hint.
 */
export function RequestForm({ offering, locations, minDate }: RequestFormProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.request
  const [state, action, pending] = useActionState(requestBooking, initialState)
  const [review, setReview] = useState<Review | null>(null)
  const steps = copy.steps.request
  const { step, goTo, formRef, shown, fail, onSubmit, stepClick } = useBookingSteps({
    state,
    pending,
    fields: STEP_FIELDS,
    directSubmitStep: 3,
  })

  const toDetails = () => {
    const form = formRef.current
    const errors: Record<string, string> = {}
    for (const n of DATE_SLOTS) {
      const date = fieldText(form, `date_${n}`)
      if ((n === 1 && !date) || (date && date < minDate)) errors[`date_${n}`] = copy.check.date
    }
    if (!fieldText(form, "message")) errors.message = copy.check.message
    if (!fail(errors)) goTo(2)
  }
  const toReview = () => {
    const form = formRef.current
    if (fail(checkDetails(form, copy.check, true))) return
    const location = fieldText(form, "location")
    setReview({
      message: fieldText(form, "message"),
      dates: DATE_SLOTS.flatMap((n) => {
        const date = fieldText(form, `date_${n}`)
        const part = fieldText(form, `part_${n}`) as BookingDayPart
        return date ? [`${formatDateKey(date, locale)}, ${copy.dayPartLabels[part] ?? ""}`] : []
      }),
      location: location ? copy.locationLabels[location as BookingLocation] : "",
      attendees: fieldText(form, "attendees"),
      venue: fieldText(form, "venue"),
      contact: ["organisation", "name", "email", "phone"]
        .map((name) => fieldText(form, name))
        .filter(Boolean),
    })
    goTo(3)
  }

  const rows: Array<[string, string | string[]]> = review
    ? [
        [copy.review.request, review.message],
        [copy.review.dates, review.dates],
        [copy.review.location, review.location],
        [copy.review.attendees, review.attendees || copy.review.notGiven],
        [copy.review.venue, review.venue || copy.review.notGiven],
        [copy.review.contact, review.contact],
      ]
    : []

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      className="grid grid-cols-1 gap-8"
      // Enter in a field of an earlier step never sends the request early.
      onSubmit={onSubmit}
    >
      <noscript>
        <style>{NO_SCRIPT_CSS}</style>
      </noscript>
      <StepIndicator
        steps={steps}
        current={step}
        stepOf={copy.stepOf}
        doneLabel={copy.stepper.done}
        onStepClick={stepClick}
      />
      <FormMessage state={state} />
      <input type="hidden" name="offering" value={offering} />

      <StepPanel n={1} active={step === 1} heading={steps[0] ?? ""}>
        <p className="text-muted-foreground text-sm">{text.intro}</p>
        <LocationField locations={locations} state={shown} />
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
                  {...fieldAria(`date_${n}`, shown)}
                />
                <FieldError name={`date_${n}`} state={shown} />
              </div>
              <div className="grid gap-2">
                <Label htmlFor={`part_${n}`}>{text.partLabel(n)}</Label>
                <select
                  id={`part_${n}`}
                  name={`part_${n}`}
                  defaultValue={value(state, `part_${n}`, "full_day")}
                  className={selectClass}
                  {...fieldAria(`part_${n}`, shown)}
                >
                  {BOOKING_DAY_PARTS.map((part) => (
                    <option key={part} value={part}>
                      {copy.dayPartLabels[part]}
                    </option>
                  ))}
                </select>
                <FieldError name={`part_${n}`} state={shown} />
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
            {...fieldAria("attendees", shown)}
          />
          <FieldError name="attendees" state={shown} />
        </div>
        <div className="grid gap-2">
          <Label htmlFor="venue">{text.venueLabel}</Label>
          <Input
            id="venue"
            name="venue"
            autoComplete="street-address"
            className="h-11"
            defaultValue={value(state, "venue")}
            {...fieldAria("venue", shown)}
          />
          <FieldError name="venue" state={shown} />
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
            {...fieldAria("message", shown, "message-hint")}
          />
          <FieldError name="message" state={shown} />
        </div>
        <StepNav backLabel={copy.stepper.back}>
          <Button type="button" size="lg" className={primaryClass} onClick={toDetails}>
            {text.continueLabel}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={2} active={step === 2} heading={steps[1] ?? ""}>
        <CustomerFields state={shown} organisation="required" />
        <StepNav backLabel={copy.stepper.back} onBack={() => goTo(1)}>
          <Button type="button" size="lg" className={primaryClass} onClick={toReview}>
            {copy.review.toReview}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={3} active={step === 3} heading={steps[2] ?? ""}>
        {review && (
          <dl className="grid gap-3 rounded-3xl bg-background p-5 text-sm shadow-xs">
            {rows.map(([label, content]) => (
              <div key={label} className="grid gap-0.5 sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-4">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="whitespace-pre-line break-words">
                  {Array.isArray(content) ? (
                    <ul className="grid gap-1">
                      {content.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  ) : (
                    content
                  )}
                </dd>
              </div>
            ))}
          </dl>
        )}
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {copy.review.note}
        </p>
        <p className="text-muted-foreground text-xs">{text.legal}</p>
        <div className="flex flex-wrap-reverse items-center justify-between gap-3 border-border border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            className="step-nav min-h-11 px-4"
            onClick={() => goTo(2)}
          >
            <Icon icon="lucide:arrow-left" aria-hidden="true" />
            {copy.stepper.back}
          </Button>
          <Button type="submit" size="lg" disabled={pending} className={primaryClass}>
            {pending ? text.submitting : text.submit}
          </Button>
        </div>
      </StepPanel>
    </form>
  )
}
