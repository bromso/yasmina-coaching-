"use client"

import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { type ReactNode, useEffect, useRef, useState } from "react"
import type { BookingFormCopy } from "@/content/booking-forms"
import type { BookingFormState } from "@/lib/booking"
import { cn } from "@/lib/utils"

/*
 * The pieces every booking journey's steps share. Every step stays mounted and is only hidden, so
 * going back never loses what was typed; the step that becomes current takes focus on its heading.
 */

type StepPanelProps = {
  /** The step's number, for the heading's id. */
  n: number
  active: boolean
  /** The step's name from the stepper, shown as its heading. */
  heading: string
  children: ReactNode
  className?: string
}

/**
 * One step: a heading and its content, hidden unless current. When it becomes current after a
 * step change (never on the first render), its heading takes focus, so a screen reader starts
 * there and the page scrolls to it.
 */
export function StepPanel({ n, active, heading, children, className }: StepPanelProps) {
  const headingRef = useRef<HTMLHeadingElement>(null)
  const wasActive = useRef(active)
  useEffect(() => {
    if (active && !wasActive.current) headingRef.current?.focus()
    wasActive.current = active
  }, [active])
  return (
    <section
      aria-labelledby={`step-${n}-heading`}
      // A class, not the `hidden` attribute: the request form's `<noscript>` style must be able to
      // show every step, and Tailwind's preflight hides `[hidden]` with `!important` in a layer.
      className={cn(
        "step-panel grid grid-cols-1 gap-6 motion-safe:animate-[rise_0.35s_var(--ease-out-soft)_both]",
        !active && "hidden",
        className
      )}
    >
      <h2
        id={`step-${n}-heading`}
        ref={headingRef}
        tabIndex={-1}
        className="scroll-mt-28 font-display text-2xl focus:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
      >
        {heading}
      </h2>
      {children}
    </section>
  )
}

/** The Back / Continue row at the foot of a step; `onBack` is left out on the first one. */
export function StepNav({
  onBack,
  backLabel,
  children,
}: {
  onBack?: () => void
  backLabel: string
  children: ReactNode
}) {
  return (
    <div className="step-nav flex flex-wrap-reverse items-center justify-between gap-3 border-border border-t pt-5">
      {onBack ? (
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 rounded-full px-4"
          onClick={onBack}
        >
          <Icon icon="lucide:arrow-left" aria-hidden="true" />
          {backLabel}
        </Button>
      ) : (
        <span />
      )}
      {children}
    </div>
  )
}

/** The payment step's posted fields, so a refusal of one reopens that step. */
export const PAYMENT_FIELDS = [
  "paymentMethod",
  "invoiceOrgNumber",
  "invoiceReference",
  "invoiceAddress",
] as const

/** `true` from the first render where `when` held, for good: mounts a lazy step once, keeps it. */
export function useMounted(when: boolean): boolean {
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    if (when) setMounted(true)
  }, [when])
  return mounted || when
}

/** The primary button's look in every step. */
export const primaryClass = "min-h-11 w-full rounded-full px-6 sm:w-fit"

/** The server's answer with the browser's own checks laid over it, for `FieldError`. */
export function withClientErrors(
  state: BookingFormState,
  errors: Record<string, string>
): BookingFormState {
  if (Object.keys(errors).length === 0) return state
  return {
    ok: false,
    message: state.ok ? undefined : state.message,
    code: state.code,
    values: state.ok ? undefined : state.values,
    fieldErrors: { ...(state.ok ? {} : state.fieldErrors), ...errors },
  }
}

/** The first step (1-based) holding a field with an error, given each step's field names. */
export function stepWithError(
  state: BookingFormState,
  fields: readonly (readonly string[])[]
): number | null {
  if (state.ok || !state.fieldErrors) return null
  const names = Object.keys(state.fieldErrors)
  const i = fields.findIndex((step) => step.some((name) => names.includes(name)))
  return i === -1 ? null : i + 1
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** A form field's current text, trimmed. */
export const fieldText = (form: HTMLFormElement | null, name: string): string => {
  if (!form) return ""
  const v = new FormData(form).get(name)
  return typeof v === "string" ? v.trim() : ""
}

/**
 * The details step's checks before the next step: a name, an address that looks like one and,
 * when `organisation` is required, the organisation. The server checks all of it again.
 */
export function checkDetails(
  form: HTMLFormElement | null,
  check: BookingFormCopy["check"],
  organisation = false
): Record<string, string> {
  const errors: Record<string, string> = {}
  if (!fieldText(form, "name")) errors.name = check.name
  if (!EMAIL.test(fieldText(form, "email"))) errors.email = check.email
  if (organisation && !fieldText(form, "organisation")) errors.organisation = check.organisation
  return errors
}

/** Moves focus to the first field with an error, the way a server answer would be read. */
export function focusFirstError(form: HTMLFormElement | null, names: string[]) {
  const first = names[0]
  if (!form || !first) return
  const el = form.querySelector<HTMLElement>(`[name="${first}"], #${CSS.escape(first)}`)
  el?.focus()
}
