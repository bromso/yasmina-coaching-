"use client"

import type { GroupEvent } from "@repo/api-contract"
import type { BookingAudience, OfferingKey } from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
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
  TermsField,
  type TermsLinks,
  value,
} from "@/components/booking/details-fields"
import { LazyPaymentStep } from "@/components/booking/lazy-payment-step"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { StepIndicator } from "@/components/booking/step-indicator"
import {
  checkDetails,
  checkTerms,
  fieldText,
  PAYMENT_FIELDS,
  primaryClass,
  StepNav,
  StepPanel,
  useMounted,
} from "@/components/booking/step-panel"
import { useBookingSteps } from "@/components/booking/use-booking-steps"
import type { OfferingAmount } from "@/content/booking"
import type { BookingFormState } from "@/lib/booking"
import { formatDay, formatTime } from "@/lib/booking-dates"
import { groupBySeries, monthsSpanned } from "@/lib/group-events"

type GroupBookingProps = {
  /** Which group offering's events to list (`group` or `inner_group`). */
  offering: OfferingKey
  audiences: readonly BookingAudience[]
  initialAudience: BookingAudience
  /** The offering's name, for the payment step's summary. */
  title: string
  /** Its fixed price (the Inifrån group, per month), or `null` when priced in writing. */
  price: OfferingAmount | null
  /** The terms and privacy pages the terms box links, from the server. */
  legalLinks: TermsLinks
}

type Events =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; events: GroupEvent[] }

const initialState: BookingFormState = { ok: false }

/** Each step's fields, so a refusal from the server reopens the step that holds the field. */
const STEP_FIELDS = [
  ["eventIds"],
  ["audience", "name", "email", "organisation", "phone", "notes", "terms"],
  PAYMENT_FIELDS,
]

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
  legalLinks,
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
  const [chosen, setChosen] = useState<{ when: string[]; months: number; email: string }>({
    when: [],
    months: 1,
    email: "",
  })
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
  // and the dates are picked again.
  const { step, goTo, formRef, shown, fail, submit, onSubmit, setLocked, stepClick } =
    useBookingSteps({ state, pending, fields: STEP_FIELDS, onConflict: load })
  const mountPayment = useMounted(step >= 2)

  const series = events.status === "ready" ? groupBySeries(events.events) : []
  const ticked = () =>
    formRef.current ? new FormData(formRef.current).getAll("eventIds").map((id) => String(id)) : []
  const toDetails = () => {
    if (!fail(ticked().length === 0 ? { eventIds: copy.check.eventIds } : {})) goTo(2)
  }
  const toPayment = () => {
    const errors = {
      ...checkDetails(formRef.current, copy.check),
      ...checkTerms(formRef.current, copy.check),
    }
    if (fail(errors)) return
    const ids = new Set(ticked())
    const list = (events.status === "ready" ? events.events : []).filter((event) =>
      ids.has(String(event.id))
    )
    setChosen({
      // The Inifrån group is priced per month: dates in two months are two months' fees.
      months: Math.max(1, monthsSpanned(list.map((event) => event.startsAt))),
      when: list.map(
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
      // Only the payment step books, once the payment is authorised.
      onSubmit={onSubmit}
    >
      <StepIndicator
        steps={steps}
        current={step}
        stepOf={copy.stepOf}
        doneLabel={copy.stepper.done}
        onStepClick={stepClick}
      />
      <noscript>
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {text.noScript}{" "}
          <a href={copy.noScriptLink.href} className="font-medium underline underline-offset-4">
            {copy.noScriptLink.label}
          </a>
        </p>
      </noscript>
      {/* On the payment step the error shows beside the pay button instead. */}
      {step !== 3 && <FormMessage state={state} />}
      <input type="hidden" name="offering" value={offering} />

      <StepPanel n={1} active={step === 1} heading={steps[0] ?? ""}>
        <Fieldset
          legend={text.heading}
          hint={text.seriesHint}
          field={{ name: "eventIds", state: shown }}
        >
          <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
            {events.status === "loading" && text.loading}
            {events.status === "error" && text.loadFailed}
            {events.status === "ready" && events.events.length === 0 && text.none}
          </p>
          {events.status === "error" && (
            <Button type="button" variant="outline" className="min-h-11 w-fit" onClick={load}>
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
        <TermsField state={shown} links={legalLinks} />
        <p className="text-muted-foreground text-xs">{copy.instant.legal}</p>
        <StepNav backLabel={copy.stepper.back} onBack={() => goTo(1)}>
          <Button type="button" size="lg" className={primaryClass} onClick={toPayment}>
            {copy.instant.toPayment}
            <Icon icon="lucide:arrow-right" aria-hidden="true" />
          </Button>
        </StepNav>
      </StepPanel>

      <StepPanel n={3} active={step === 3} heading={steps[2] ?? ""}>
        {mountPayment && (
          <LazyPaymentStep
            active={step === 3}
            price={price}
            quantity={price?.per === "month" ? chosen.months : 1}
            audience={audience}
            offering={title}
            when={chosen.when}
            email={chosen.email}
            state={state}
            pending={pending}
            submit={submit}
            onLockChange={setLocked}
          />
        )}
        <StepNav backLabel={copy.stepper.back} onBack={stepClick && (() => goTo(2))}>
          <span />
        </StepNav>
      </StepPanel>
    </form>
  )
}
