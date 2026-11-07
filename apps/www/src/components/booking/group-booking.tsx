"use client"

import type { GroupEvent } from "@repo/api-contract"
import type { BookingAudience } from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, FormMessage } from "@repo/ui/components/form-feedback"
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
import type { BookingFormState } from "@/lib/booking"
import { formatDay, formatTime } from "@/lib/booking-dates"
import { groupBySeries } from "@/lib/group-events"

type GroupBookingProps = {
  audiences: readonly BookingAudience[]
  initialAudience: BookingAudience
}

type Events =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; events: GroupEvent[] }

const initialState: BookingFormState = { ok: false }

/**
 * Upcoming group dates from this origin's `/api/booking/group-events`, grouped by series, with a
 * checkbox each; then the same details form as an instant booking. The list needs JavaScript
 * (a `<noscript>` points at the contact form); the form is a plain `<form action>`.
 */
export function GroupBooking({ audiences, initialAudience }: GroupBookingProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.group
  const [state, action, pending] = useActionState(reserveSeats, initialState)
  const [events, setEvents] = useState<Events>({ status: "loading" })
  const [audience, setAudience] = useState<BookingAudience>(
    (value(state, "audience") as BookingAudience) || initialAudience
  )
  const previouslyTicked = new Set(value(state, "eventIds").split(",").filter(Boolean))

  // Each load is numbered: only the latest one may set the list, so a retry never races an
  // earlier, slower answer.
  const seq = useRef(0)
  const load = useCallback(() => {
    const n = ++seq.current
    setEvents({ status: "loading" })
    fetch("/api/booking/group-events", { headers: { accept: "application/json" } })
      .then((res) =>
        res.ok ? (res.json() as Promise<{ events: GroupEvent[] }>) : Promise.reject(res.status)
      )
      .then((body) => {
        if (seq.current === n) setEvents({ status: "ready", events: body.events })
      })
      .catch(() => {
        if (seq.current === n) setEvents({ status: "error" })
      })
  }, [])

  useEffect(() => load(), [load])

  // A seats-full refusal shows the api's message; the list is fetched again so counts are fresh.
  useEffect(() => {
    if (!state.ok && state.code === "CONFLICT") load()
  }, [state, load])

  const series = events.status === "ready" ? groupBySeries(events.events) : []

  return (
    <form action={action} noValidate className="grid gap-8">
      <noscript>
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {text.noScript}{" "}
          <a href={copy.noScriptLink.href} className="font-medium underline underline-offset-4">
            {copy.noScriptLink.label}
          </a>
        </p>
      </noscript>
      <FormMessage state={state} />

      <Fieldset
        legend={text.heading}
        hint={text.seriesHint}
        error={<FieldError name="eventIds" state={state} />}
      >
        <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
          {events.status === "loading" && text.loading}
          {events.status === "error" && text.loadFailed}
          {events.status === "ready" && events.events.length === 0 && text.none}
        </p>
        {events.status === "error" && (
          <Button type="button" variant="outline" className="w-fit rounded-full" onClick={load}>
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
                          {formatDay(event.startsAt, locale)}, {formatTime(event.startsAt, locale)}–
                          {formatTime(event.endsAt, locale)}
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

      <AudienceField
        audiences={audiences}
        audience={audience}
        onChange={setAudience}
        state={state}
      />
      <CustomerFields
        state={state}
        organisation={audience === "organisation" ? "optional" : "hidden"}
      />
      <NotesField state={state} />
      <p className="text-muted-foreground text-xs">{copy.instant.legal}</p>
      <Button type="submit" size="lg" disabled={pending} className="w-fit rounded-full px-6">
        {pending ? text.submitting : text.submit}
      </Button>
    </form>
  )
}
