"use client"

import type { GroupEvent } from "@repo/api-contract"
import type { BookingAudience, OfferingKey } from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { useActionState, useCallback, useEffect, useRef, useState } from "react"
import { reserveSeats } from "@/app/actions"
import {
  AudienceField,
  CustomerFields,
  choiceClass,
  choiceInputClass,
  Fieldset,
  NotesField,
  value,
} from "@/components/booking/details-fields"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { PaymentStep } from "@/components/booking/payment-step"
import { StepIndicator } from "@/components/booking/step-indicator"
import {
  checkDetails,
  fieldText,
  focusFirstError,
  primaryClass,
  StepNav,
  StepPanel,
  stepWithError,
  withClientErrors,
} from "@/components/booking/step-panel"
import type { OfferingAmount } from "@/content/booking"
import type { BookingFormState } from "@/lib/booking"
import { formatDay, formatTime } from "@/lib/booking-dates"
import { groupBySeries } from "@/lib/group-events"

type GroupBookingProps = {
  /** Which group offering's events to list (`group` or `inner_group`). */
  offering: OfferingKey
  audiences: readonly BookingAudience[]
  initialAudience: BookingAudience
  /** The offering's name, for the payment step's summary. */
  title: string
  /** Its fixed price (the Inifrån group, per month), or `null` when priced in writing. */
  price: OfferingAmount | null
}

type Events =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; events: GroupEvent[] }

const initialState: BookingFormState = { ok: false }

/** Each step's fields, so a refusal from the server reopens the step that holds the field. */
const STEP_FIELDS = [["eventIds"], ["audience", "name", "email", "organisation", "phone", "notes"]]

/**
 * Pick one or more dates (step 1), your details (step 2), pay (step 3, the mock in
 * `src/lib/mock-payment.ts`); `/book/done` is the last. Upcoming dates of one group offering from this origin's `/api/booking/group-events`, grouped by series, with a
 * checkbox each; then the same details form as an instant booking. The list needs JavaScript
 * (a `<noscript>` points at the contact form); the form is a plain `<form action>`.
 */
export function GroupBooking({
  offering,
  audiences,
  initialAudience,
  title,
  price,
}: GroupBookingProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.group
  const [state, action, pending] = useActionState(reserveSeats, initialState)
  const [events, setEvents] = useState<Events>({ status: "loading" })
  const [audience, setAudience] = useState<BookingAudience>(
    (value(state, "audience") as BookingAudience) || initialAudience
  )
  const previouslyTicked = new Set(value(state, "eventIds").split(",").filter(Boolean))
  const [step, setStep] = useState(1)
  const [clientErrors, setClientErrors] = useState<Record<string, string>>({})
  const [chosen, setChosen] = useState<{ when: string[]; email: string }>({ when: [], email: "" })
  const formRef = useRef<HTMLFormElement>(null)
  const allowSubmit = useRef(false)
  const steps = copy.steps.group

  // Each load is numbered: only the latest one may set the list, so a retry never races an
  // earlier, slower answer.
  const seq = useRef(0)
  const load = useCallback(() => {
    const n = ++seq.current
    setEvents({ status: "loading" })
    fetch(`/api/booking/group-events?offering=${encodeURIComponent(offering)}`, {
      headers: { accept: "application/json" },
    })
      .then((res) =>
        res.ok ? (res.json() as Promise<{ events: GroupEvent[] }>) : Promise.reject(res.status)
      )
      .then((body) => {
        if (seq.current === n) setEvents({ status: "ready", events: body.events })
      })
      .catch(() => {
        if (seq.current === n) setEvents({ status: "error" })
      })
  }, [offering])

  useEffect(() => load(), [load])

  // A seats-full refusal shows the api's message, the list is fetched again so counts are fresh,
  // and the dates are picked again; a field the server refused reopens the step that holds it.
  useEffect(() => {
    setClientErrors({})
    if (!state.ok && state.code === "CONFLICT") {
      load()
      setStep(1)
      return
    }
    const errorStep = stepWithError(state, STEP_FIELDS)
    if (errorStep) setStep(errorStep)
  }, [state, load])

  const series = events.status === "ready" ? groupBySeries(events.events) : []
  const shown = withClientErrors(state, clientErrors)
  const goTo = (n: number) => {
    setClientErrors({})
    setStep(n)
  }
  const ticked = () =>
    formRef.current ? new FormData(formRef.current).getAll("eventIds").map((id) => String(id)) : []
  const toDetails = () => {
    if (ticked().length === 0) {
      setClientErrors({ eventIds: copy.check.eventIds })
      formRef.current?.querySelector<HTMLInputElement>('input[name="eventIds"]')?.focus()
      return
    }
    goTo(2)
  }
  const toPayment = () => {
    const errors = checkDetails(formRef.current, copy.check)
    setClientErrors(errors)
    if (Object.keys(errors).length > 0) {
      focusFirstError(formRef.current, Object.keys(errors))
      return
    }
    const ids = new Set(ticked())
    const list = events.status === "ready" ? events.events : []
    setChosen({
      when: list
        .filter((event) => ids.has(String(event.id)))
        .map(
          (event) =>
            `${formatDay(event.startsAt, locale)}, ${formatTime(event.startsAt, locale)}–${formatTime(event.endsAt, locale)} · ${copy.locationLabels[event.location]}`
        ),
      email: fieldText(formRef.current, "email"),
    })
    goTo(3)
  }

  return (
    <form
      ref={formRef}
      action={action}
      noValidate
      className="grid grid-cols-1 gap-8"
      onSubmit={(event) => {
        // Only the payment step books, once its mock has approved.
        const ok = allowSubmit.current
        allowSubmit.current = false
        if (!ok) event.preventDefault()
      }}
    >
      <StepIndicator
        steps={steps}
        current={step}
        stepOf={copy.stepOf}
        doneLabel={copy.stepper.done}
        onStepClick={goTo}
      />
      <noscript>
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {text.noScript}{" "}
          <a href={copy.noScriptLink.href} className="font-medium underline underline-offset-4">
            {copy.noScriptLink.label}
          </a>
        </p>
      </noscript>
      <FormMessage state={state} />
      <input type="hidden" name="offering" value={offering} />

      <StepPanel n={1} active={step === 1} heading={steps[0] ?? ""}>
        <Fieldset
          legend={text.heading}
          hint={text.seriesHint}
          error={<FieldError name="eventIds" state={shown} />}
        >
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
            {events.status === "loading" && text.loading}
            {events.status === "error" && text.loadFailed}
            {events.status === "ready" && events.events.length === 0 && text.none}
          </p>
          {events.status === "error" && (
            <Button
              type="button"
              variant="outline"
              className="min-h-11 w-fit rounded-full"
              onClick={load}
            >
              {copy.retry}
            </Button>
          )}
          {series.map((group) => (
            <div key={group.key} className="grid gap-2 rounded-3xl bg-background p-5 shadow-xs">
              <h3 className="font-display text-xl">{group.title}</h3>
              {group.events[0]?.description && (
                <p className="text-muted-foreground text-sm">{group.events[0].description}</p>
              )}
              <ul className="mt-2 grid gap-2">
                {group.events.map((event) => {
                  const soldOut = event.seatsLeft === 0
                  return (
                    <li key={event.id}>
                      <label className={choiceClass} aria-disabled={soldOut || undefined}>
                        <input
                          type="checkbox"
                          name="eventIds"
                          value={event.id}
                          disabled={soldOut}
                          defaultChecked={previouslyTicked.has(String(event.id))}
                          className={choiceInputClass}
                        />
                        <span className="grid gap-0.5 sm:flex sm:flex-wrap sm:items-baseline sm:gap-x-3">
                          <span className="font-medium">
                            {formatDay(event.startsAt, locale)},{" "}
                            {formatTime(event.startsAt, locale)}–{formatTime(event.endsAt, locale)}
                          </span>
                          <span className="text-muted-foreground text-xs">
                            {copy.locationLabels[event.location]} ·{" "}
                            {soldOut ? text.full : text.seatsLeft(event.seatsLeft)}
                          </span>
                        </span>
                      </label>
                    </li>
                  )
                })}
              </ul>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">{copy.timezoneNote}</p>
        </Fieldset>
        {events.status === "ready" && events.events.length > 0 && (
          <StepNav backLabel={copy.stepper.back}>
            <Button type="button" size="lg" className={primaryClass} onClick={toDetails}>
              {text.continueLabel}
              <Icon icon="lucide:arrow-right" aria-hidden="true" />
            </Button>
          </StepNav>
        )}
      </StepPanel>

      <StepPanel n={2} active={step === 2} heading={steps[1] ?? ""}>
        <AudienceField
          audiences={audiences}
          audience={audience}
          onChange={setAudience}
          state={shown}
        />
        <CustomerFields
          state={shown}
          organisation={audience === "organisation" ? "optional" : "hidden"}
        />
        <NotesField state={shown} />
        <p className="text-muted-foreground text-xs">{copy.instant.legal}</p>
        <StepNav backLabel={copy.stepper.back} onBack={() => goTo(1)}>
          <Button type="button" size="lg" className={primaryClass} onClick={toPayment}>
            {copy.instant.toPayment}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={3} active={step === 3} heading={steps[2] ?? ""}>
        <PaymentStep
          active={step === 3}
          price={price}
          audience={audience}
          offering={title}
          when={chosen.when}
          email={chosen.email}
          state={state}
          pending={pending}
          submit={() => {
            allowSubmit.current = true
            formRef.current?.requestSubmit()
          }}
        />
        <StepNav backLabel={copy.stepper.back} onBack={() => goTo(2)}>
          <span />
        </StepNav>
      </StepPanel>
    </form>
  )
}
