"use client"

import {
  BOOKING_HORIZON_DAYS,
  type BookingAudience,
  type BookingLocation,
  type OfferingKey,
} from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { Calendar } from "@repo/ui/components/calendar"
import { FieldError, FormMessage } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { useActionState, useEffect, useRef, useState } from "react"
import { book } from "@/app/actions"
import {
  AudienceField,
  CustomerFields,
  LocationField,
  NotesField,
  value,
} from "@/components/booking/details-fields"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { StepIndicator } from "@/components/booking/step-indicator"
import type { BookingFormState } from "@/lib/booking"
import {
  bookableRange,
  formatDateKey,
  formatRange,
  formatTime,
  gridDay,
  monthKey,
  shiftDay,
  zonedDay,
} from "@/lib/booking-dates"
import { INTL_LOCALE } from "@/lib/site-locale"
import { cn } from "@/lib/utils"

type InstantBookingProps = {
  offering: OfferingKey
  audiences: readonly BookingAudience[]
  locations: readonly BookingLocation[]
  /** How many sessions the offering covers; a package lets the visitor place up to this many now. */
  sessions: number
  initialAudience: BookingAudience
  /** `?package=<id>` from a manage page: one extra session on an existing programme. */
  packageId?: string
}

/** One free slot as `/api/booking/availability` hands it back: ISO UTC instants. */
type BookingSlot = { startsAt: string; endsAt: string }

type MonthState =
  | { status: "loading"; days: Record<string, BookingSlot[]> }
  | { status: "ready"; days: Record<string, BookingSlot[]> }
  | { status: "error"; days: Record<string, BookingSlot[]> }

type AvailabilityBody = { days: Array<{ date: string; slots: BookingSlot[] }> }

const initialState: BookingFormState = { ok: false }

const firstOfMonth = (day: string) => {
  const [y, m] = day.split("-").map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, 1)
}
const gridDate = (day: string) => {
  const [y, m, d] = day.split("-").map(Number)
  return new Date(y ?? 1970, (m ?? 1) - 1, d ?? 1)
}

/**
 * Pick a time (step 1), then your details (step 2); `/book/done` is step 3. Free slots come from
 * this origin's `/api/booking/availability`, one month at a time, and show in Swedish time (named
 * in the page's language). The
 * calendar needs JavaScript, so the server-rendered HTML is the loading note plus a `<noscript>`
 * pointing at the contact form; the details form itself is a plain `<form action>`.
 */
export function InstantBooking({
  offering,
  audiences,
  locations,
  sessions,
  initialAudience,
  packageId,
}: InstantBookingProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.instant
  const intl = INTL_LOCALE[locale]
  const maxSlots = packageId ? 1 : sessions
  const [state, action, pending] = useActionState(book, initialState)
  const [today, setToday] = useState<string | null>(null)
  const [month, setMonth] = useState<Date>(() => new Date())
  const [months, setMonths] = useState<Record<string, MonthState>>({})
  // Months already asked for, kept out of React state on purpose: an effect that read `months`
  // would re-run on its own "loading" write and cancel the fetch it had just started.
  const requested = useRef(new Set<string>())
  const [selectedDay, setSelectedDay] = useState<string | null>(null)
  const [picked, setPicked] = useState<BookingSlot[]>([])
  const [step, setStep] = useState<1 | 2>(1)
  const [audience, setAudience] = useState<BookingAudience>(
    (value(state, "audience") as BookingAudience) || initialAudience
  )

  // The calendar mounts client-side only: "today" is the booking zone's, read in the browser, so
  // the server and the browser never disagree about the first month.
  useEffect(() => {
    const now = zonedDay(new Date())
    setToday(now)
    setMonth(firstOfMonth(now))
  }, [])

  // After a slot conflict the api's message shows and the times are picked again from fresh data.
  useEffect(() => {
    if (!state.ok && state.code === "CONFLICT") {
      requested.current.clear()
      setMonths({})
      setPicked([])
      setStep(1)
    }
  }, [state])

  const key = monthKey(month)
  const current = months[key]

  useEffect(() => {
    if (!today || requested.current.has(key)) return
    requested.current.add(key)
    const range = bookableRange(month, today, BOOKING_HORIZON_DAYS)
    if (!range) {
      setMonths((m) => ({ ...m, [key]: { status: "ready", days: {} } }))
      return
    }
    setMonths((m) => ({ ...m, [key]: { status: "loading", days: {} } }))
    const params = new URLSearchParams({ offering, from: range.from, to: range.to })
    fetch(`/api/booking/availability?${params.toString()}`, {
      headers: { accept: "application/json" },
    })
      .then((res) =>
        res.ok ? (res.json() as Promise<AvailabilityBody>) : Promise.reject(res.status)
      )
      .then((body) => {
        const days: Record<string, BookingSlot[]> = {}
        for (const day of body.days) days[day.date] = day.slots
        setMonths((m) => ({ ...m, [key]: { status: "ready", days } }))
      })
      .catch(() => {
        setMonths((m) => ({ ...m, [key]: { status: "error", days: {} } }))
      })
  }, [today, month, key, offering])

  const daySlots = selectedDay ? (current?.days[selectedDay] ?? []) : []
  const monthHasSlots = Object.values(current?.days ?? {}).some((slots) => slots.length > 0)
  const isPicked = (slot: BookingSlot) => picked.some((p) => p.startsAt === slot.startsAt)
  const full = picked.length >= maxSlots

  const toggleSlot = (slot: BookingSlot) => {
    setPicked((list) =>
      list.some((p) => p.startsAt === slot.startsAt)
        ? list.filter((p) => p.startsAt !== slot.startsAt)
        : list.length >= maxSlots
          ? maxSlots === 1
            ? [slot]
            : list
          : [...list, slot].sort((a, b) => a.startsAt.localeCompare(b.startsAt))
    )
  }

  const status =
    !today || !current || current.status === "loading"
      ? text.loading
      : current.status === "error"
        ? text.loadFailed
        : !monthHasSlots
          ? text.noSlotsThisMonth
          : !selectedDay
            ? text.pickDay
            : daySlots.length === 0
              ? text.noSlotsThisDay
              : ""

  return (
    <form action={action} noValidate className="grid grid-cols-1 gap-8">
      <StepIndicator steps={copy.steps} current={step} stepOf={copy.stepOf} />
      <noscript>
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {text.noScript}{" "}
          <a href={copy.noScriptLink.href} className="font-medium underline underline-offset-4">
            {copy.noScriptLink.label}
          </a>
        </p>
      </noscript>
      <FormMessage state={state} />
      {packageId && (
        <p className="rounded-2xl border border-border bg-background/70 px-4 py-3 text-sm">
          {text.packageExtraNote}
        </p>
      )}
      {!packageId && sessions > 1 && (
        <p className="text-muted-foreground text-sm">{text.packageHint(sessions)}</p>
      )}

      <input type="hidden" name="offering" value={offering} />
      {packageId && <input type="hidden" name="packageId" value={packageId} />}
      {picked.map((slot) => (
        <input key={slot.startsAt} type="hidden" name="slots" value={slot.startsAt} />
      ))}

      <div className="grid grid-cols-1 gap-8" hidden={step === 2}>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[auto_1fr]">
          <div className="rounded-3xl bg-background w-fit p-1 sm:p-2 shadow-xs">
            {today ? (
              <Calendar
                mode="single"
                month={month}
                onMonthChange={setMonth}
                selected={selectedDay ? gridDate(selectedDay) : undefined}
                onSelect={(date) => setSelectedDay(date ? gridDay(date) : null)}
                startMonth={firstOfMonth(today)}
                endMonth={firstOfMonth(shiftDay(today, BOOKING_HORIZON_DAYS))}
                disabled={(date) => (current?.days[gridDay(date)]?.length ?? 0) === 0}
                weekStartsOn={1}
                formatters={{
                  formatCaption: (date) =>
                    date.toLocaleString(intl, { month: "long", year: "numeric" }),
                  formatWeekdayName: (date) => date.toLocaleString(intl, { weekday: "short" }),
                }}
                labels={{
                  labelPrevious: () => copy.calendar.previous,
                  labelNext: () => copy.calendar.next,
                  labelGrid: (date) =>
                    date.toLocaleString(intl, { month: "long", year: "numeric" }),
                  // Starts with the number the button shows (WCAG 2.5.3), like the shared default.
                  labelDayButton: (date, modifiers) =>
                    [
                      modifiers.today && copy.calendar.today,
                      modifiers.selected && copy.calendar.selected,
                      date.getDate(),
                      date.toLocaleString(intl, { weekday: "long" }),
                      date.toLocaleString(intl, { month: "long", year: "numeric" }),
                    ]
                      .filter(Boolean)
                      .join(", "),
                }}
                className="[--cell-size:--spacing(8)] max-sm:p-1 sm:[--cell-size:--spacing(10)]"
              />
            ) : (
              <div className="h-80 w-72" aria-hidden="true" />
            )}
          </div>
          <div className="grid content-start gap-4">
            <p role="status" aria-live="polite" className="text-muted-foreground text-sm">
              {status}
            </p>
            {current?.status === "error" && (
              <Button
                type="button"
                variant="outline"
                className="w-fit rounded-full"
                onClick={() => {
                  requested.current.delete(key)
                  setMonths((m) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== key)))
                }}
              >
                {copy.retry}
              </Button>
            )}
            {selectedDay && daySlots.length > 0 && (
              <div className="grid gap-3">
                <h3 className="font-display text-xl">{formatDateKey(selectedDay, locale)}</h3>
                <ul className="flex flex-wrap gap-2">
                  {daySlots.map((slot) => {
                    const on = isPicked(slot)
                    return (
                      <li key={slot.startsAt}>
                        <button
                          type="button"
                          aria-pressed={on}
                          disabled={!on && full && maxSlots > 1}
                          onClick={() => toggleSlot(slot)}
                          className={cn(
                            "min-h-11 min-w-20 rounded-full border border-border bg-background px-4 font-medium text-sm transition-[border-color,background-color,color,transform] duration-200 ease-out",
                            "hover:border-foreground focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                            "disabled:cursor-not-allowed disabled:opacity-50",
                            "motion-safe:active:scale-95",
                            on &&
                              "border-primary bg-primary text-primary-foreground hover:border-primary motion-safe:scale-[1.04]"
                          )}
                        >
                          {formatTime(slot.startsAt, locale)}
                        </button>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )}
            <p className="text-muted-foreground text-xs">{copy.timezoneNote}</p>
          </div>
        </div>

        {picked.length > 0 && (
          <div className="grid gap-3 rounded-3xl bg-background p-5 shadow-xs">
            <h3 className="font-display text-xl">
              {text.selectedHeading}
              {maxSlots > 1 && (
                <span className="ml-2 text-muted-foreground text-sm">
                  {text.pickedCount(picked.length, maxSlots)}
                </span>
              )}
            </h3>
            <ul className="grid gap-2">
              {picked.map((slot) => (
                <li
                  key={slot.startsAt}
                  className="flex flex-wrap items-center justify-between gap-2 text-sm"
                >
                  <span>{formatRange(slot.startsAt, slot.endsAt, locale)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="min-h-11 rounded-full"
                    onClick={() => toggleSlot(slot)}
                  >
                    <Icon icon="lucide:x" aria-hidden="true" />
                    {text.removeSlot}
                    <span className="sr-only">
                      {" "}
                      {formatRange(slot.startsAt, slot.endsAt, locale)}
                    </span>
                  </Button>
                </li>
              ))}
            </ul>
            <FieldError name="slots" state={state} />
            <Button
              type="button"
              size="lg"
              className="w-fit rounded-full px-6"
              onClick={() => setStep(2)}
            >
              {text.continueLabel}
              <Icon icon="lucide:arrow-right" aria-hidden="true" />
            </Button>
          </div>
        )}
        {picked.length === 0 && <FieldError name="slots" state={state} />}
      </div>

      {step === 2 && (
        <div className="grid gap-6">
          <div className="grid gap-2 rounded-3xl bg-background p-5 shadow-xs">
            <h3 className="font-display text-xl">{text.selectedHeading}</h3>
            <ul className="grid gap-1 text-sm">
              {picked.map((slot) => (
                <li key={slot.startsAt}>{formatRange(slot.startsAt, slot.endsAt, locale)}</li>
              ))}
            </ul>
            <Button type="button" variant="link" className="w-fit px-0" onClick={() => setStep(1)}>
              {text.changeTimes}
            </Button>
          </div>
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
          <LocationField locations={locations} state={state} />
          <NotesField state={state} />
          <p className="text-muted-foreground text-xs">{text.legal}</p>
          <Button
            type="submit"
            size="lg"
            disabled={pending || picked.length === 0}
            className="w-fit rounded-full px-6"
          >
            {pending ? text.submitting : text.submit}
          </Button>
        </div>
      )}
    </form>
  )
}
