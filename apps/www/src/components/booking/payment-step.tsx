"use client"

import type { BookingAudience } from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, type FormState, fieldAria } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useEffect, useRef, useState } from "react"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { OrderSummary } from "@/components/booking/order-summary"
import { PAYMENT_MARKS, PaymentMethods } from "@/components/booking/payment-methods"
import { primaryClass } from "@/components/booking/step-panel"
import type { OfferingAmount } from "@/content/booking"
import { formatKr, vatBreakdown } from "@/content/inner-pricing"
import type { BookingFormState } from "@/lib/booking"
import {
  isOrgNumber,
  methodsFor,
  normaliseSwishNumber,
  type PaymentMethod,
  runMockPayment,
} from "@/lib/mock-payment"
import { cn } from "@/lib/utils"

type PaymentStepProps = {
  /** Whether the step shows: leaving it (Back, or the stepper) cancels a mock still waiting. */
  active: boolean
  price: OfferingAmount | null
  audience: BookingAudience
  offering: string
  when: readonly string[]
  location?: string
  /** The address from the details step, for the private invoice's line. */
  email: string
  /** The action's answer: a new one ends any mock still showing its result. */
  state: BookingFormState
  pending: boolean
  /** Submits the booking form (only the method's key rides along, as `paymentMethod`). */
  submit: () => void
}

type Stage = "idle" | "waiting" | "approved" | "cancelled"

/**
 * Step 3, payment: what is being bought, the four methods as radio cards (invoice alone when the
 * offering has no fixed price), the chosen method's own controls, the test-mode line and the pay
 * button. Every payment is the mock in `src/lib/mock-payment.ts`, run here in the browser: the
 * Swish number and invoice details are checked, shown and dropped, never posted. On approval the
 * booking form is submitted as before, with the method's key in a hidden `paymentMethod`.
 */
export function PaymentStep({
  active,
  price,
  audience,
  offering,
  when,
  location,
  email,
  state,
  pending,
  submit,
}: PaymentStepProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.payment
  const methods = methodsFor(price !== null)
  const [method, setMethod] = useState<PaymentMethod | null>(
    methods.length === 1 ? (methods[0] ?? null) : null
  )
  const [stage, setStage] = useState<Stage>("idle")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)
  const payRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)

  // A new answer from the action (an error: a success leaves the page) ends the mock's display.
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset on each new state only
  useEffect(() => {
    setStage("idle")
  }, [state])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!active) controller.current?.abort()
  }, [active])
  useEffect(() => {
    if (stage === "waiting") cancelRef.current?.focus()
    // Back on the pay button once it is enabled again, so a keyboard user carries on from there.
    if (stage === "cancelled") payRef.current?.focus()
  }, [stage])

  const local: FormState = { ok: false, fieldErrors: errors }
  const total = price ? formatKr(vatBreakdown(price.amount, audience).total, locale) : ""
  const busy = stage === "waiting" || stage === "approved" || pending
  const brand = method ? text.methods[method].label : ""

  const choose = (next: PaymentMethod) => {
    setMethod(next)
    setErrors({})
    if (stage === "cancelled") setStage("idle")
  }

  const check = (): Record<string, string> => {
    const out: Record<string, string> = {}
    const value = (id: string) =>
      (sectionRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "").trim()
    if (!method) out.paymentMethod = copy.check.method
    if (method === "swish" && !normaliseSwishNumber(value("swishNumber"))) {
      out.swishNumber = text.swish.invalid
    }
    if (method === "invoice" && audience === "organisation") {
      if (!isOrgNumber(value("invoiceOrgNumber")))
        out.invoiceOrgNumber = text.invoice.orgNumberInvalid
      if (!value("invoiceReference")) out.invoiceReference = text.invoice.referenceMissing
      if (!value("invoiceAddress")) out.invoiceAddress = text.invoice.addressMissing
    }
    return out
  }

  const pay = async () => {
    const found = check()
    setErrors(found)
    const first = Object.keys(found)[0]
    if (first) {
      const target =
        first === "paymentMethod"
          ? sectionRef.current?.querySelector<HTMLInputElement>('input[name="payment-choice"]')
          : sectionRef.current?.querySelector<HTMLInputElement>(`#${first}`)
      target?.focus()
      return
    }
    if (!method) return
    if (method === "invoice") {
      submit()
      return
    }
    controller.current?.abort()
    const ctrl = new AbortController()
    controller.current = ctrl
    setStage("waiting")
    try {
      await runMockPayment(method, { signal: ctrl.signal })
      setStage("approved")
      submit()
    } catch {
      if (controller.current === ctrl) setStage("cancelled")
    }
  }

  const cancel = () => {
    controller.current?.abort()
  }

  const waitingText =
    method === "swish"
      ? text.swish.open
      : method === "apple_pay" || method === "google_pay"
        ? text.approve[method]
        : ""
  const Mark = method ? PAYMENT_MARKS[method] : null
  const wallet = method === "apple_pay" || method === "google_pay"
  const payLabel = pending
    ? text.submitting
    : method === "invoice"
      ? text.invoice.confirm
      : method
        ? text.payWith(total, brand)
        : text.pay(total)

  return (
    <div ref={sectionRef} className="grid gap-6">
      <input type="hidden" name="paymentMethod" value={method ?? ""} />
      <OrderSummary
        copy={text.summary}
        offering={offering}
        when={when}
        location={location}
        bookedAs={copy.audienceLabels[audience]}
        audience={audience}
        price={price}
        locale={locale}
      />

      <PaymentMethods
        copy={text}
        methods={methods}
        value={method}
        onChange={choose}
        disabled={busy}
        describedBy={
          [price ? undefined : "invoice-only-note", errors.paymentMethod && "paymentMethod-error"]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {!price && (
          <p id="invoice-only-note" className="text-muted-foreground text-sm">
            {text.invoiceOnly}
          </p>
        )}
        <FieldError name="paymentMethod" state={local} />
      </PaymentMethods>

      {method === "swish" && (
        <div className="grid gap-2">
          <Label htmlFor="swishNumber">{text.swish.numberLabel}</Label>
          <p id="swishNumber-hint" className="text-muted-foreground text-sm">
            {text.swish.numberHint}
          </p>
          {/* No `name`: the number stays in the browser and is never posted with the booking. */}
          <Input
            id="swishNumber"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            disabled={busy}
            className="h-11 sm:max-w-64"
            {...fieldAria("swishNumber", local, "swishNumber-hint")}
          />
          <FieldError name="swishNumber" state={local} />
        </div>
      )}

      {method === "invoice" && audience === "private" && (
        <p className="rounded-2xl bg-background/70 px-4 py-3 text-sm">
          {text.invoice.private(email)}
        </p>
      )}
      {method === "invoice" && audience === "organisation" && (
        // No `name` on these either: the mock invoice's details are checked, never posted.
        <div className="grid gap-4">
          <div className="grid gap-2">
            <Label htmlFor="invoiceOrgNumber">{text.invoice.orgNumber}</Label>
            <p id="invoiceOrgNumber-hint" className="text-muted-foreground text-sm">
              {text.invoice.orgNumberHint}
            </p>
            <Input
              id="invoiceOrgNumber"
              inputMode="numeric"
              disabled={busy}
              className="h-11 sm:max-w-64"
              {...fieldAria("invoiceOrgNumber", local, "invoiceOrgNumber-hint")}
            />
            <FieldError name="invoiceOrgNumber" state={local} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoiceReference">{text.invoice.reference}</Label>
            <Input
              id="invoiceReference"
              disabled={busy}
              className="h-11"
              {...fieldAria("invoiceReference", local)}
            />
            <FieldError name="invoiceReference" state={local} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoiceAddress">{text.invoice.address}</Label>
            <Input
              id="invoiceAddress"
              autoComplete="email"
              disabled={busy}
              className="h-11"
              {...fieldAria("invoiceAddress", local)}
            />
            <FieldError name="invoiceAddress" state={local} />
          </div>
        </div>
      )}

      <div
        className={cn(
          "grid gap-3",
          stage !== "idle" && "rounded-3xl border border-border bg-background p-5 shadow-md"
        )}
      >
        <p
          role="status"
          aria-live="polite"
          className="flex items-center gap-3 text-sm empty:absolute"
        >
          {stage === "waiting" && (
            <>
              {Mark && <Mark />}
              <Icon
                icon="lucide:loader-circle"
                aria-hidden="true"
                className="size-5 motion-safe:animate-spin"
              />
              <span>{waitingText}</span>
            </>
          )}
          {stage === "approved" && (
            <>
              <Icon icon="lucide:circle-check" aria-hidden="true" className="size-5 text-primary" />
              <span>{text.approved}</span>
            </>
          )}
          {stage === "cancelled" && <span>{text.cancelled}</span>}
        </p>
        {stage === "waiting" && (
          <Button
            ref={cancelRef}
            type="button"
            variant="outline"
            className="min-h-11 w-fit rounded-full px-5"
            onClick={cancel}
          >
            {text.cancel}
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        <p className="text-muted-foreground text-xs">{text.testMode}</p>
        <Button
          ref={payRef}
          type="button"
          size="lg"
          disabled={busy}
          onClick={pay}
          className={cn(
            primaryClass,
            "h-12",
            wallet &&
              "bg-black text-white hover:bg-black/85 dark:bg-white dark:text-black dark:hover:bg-white/85"
          )}
        >
          {payLabel}
        </Button>
      </div>
    </div>
  )
}
