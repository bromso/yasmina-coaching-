"use client"

import type { BookingAudience } from "@repo/api-contract/booking-limits"
import { Button } from "@repo/ui/components/button"
import { FieldError, type FormState, fieldAria } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { useEffect, useRef, useState } from "react"
import { value } from "@/components/booking/details-fields"
import { useBookingCopy, useLocale } from "@/components/booking/locale-provider"
import { OrderSummary } from "@/components/booking/order-summary"
import { PAYMENT_MARKS, PaymentMethods } from "@/components/booking/payment-methods"
import { primaryClass } from "@/components/booking/step-panel"
import type { OfferingAmount } from "@/content/booking"
import type { BookingFormCopy } from "@/content/booking-forms"
import { formatKr, vatBreakdown } from "@/content/inner-pricing"
import type { BookingFormState } from "@/lib/booking"
import {
  authoriseMockPayment,
  isOrgNumber,
  methodsFor,
  mockPaymentsOn,
  normaliseSwishNumber,
  type PaymentMethod,
} from "@/lib/mock-payment"
import { cn } from "@/lib/utils"

export type PaymentStepProps = {
  /** Whether the step shows: leaving it (Back, or the stepper) cancels an authorisation waiting. */
  active: boolean
  price: OfferingAmount | null
  /** How many of `price` (the group's months); 1 otherwise. */
  quantity?: number
  audience: BookingAudience
  offering: string
  when: readonly string[]
  location?: string
  /** The address from the details step, for the private invoice's line. */
  email: string
  /** The action's answer: an error shows beside the pay button and ends the mock's display. */
  state: BookingFormState
  pending: boolean
  /** Submits the booking form. */
  submit: () => void
  /** `true` while an authorisation runs or once one has succeeded, until the action answers. */
  onLockChange?: (locked: boolean) => void
  /** Whether the mock methods are on; `mockPaymentsOn()` (the build's flag) by default. */
  mock?: boolean
}

type Stage = "idle" | "waiting" | "approved" | "cancelled"

/**
 * The action's refusal, shown where the visitor is looking — beside the pay button — and, when the
 * mock had already approved, the reassurance that nothing was charged. (On the other steps the
 * form's own `FormMessage` at the top shows it.)
 */
export function PaymentError({
  state,
  afterApproval,
  copy,
}: {
  state: BookingFormState
  afterApproval: boolean
  copy: BookingFormCopy["payment"]
}) {
  const message = state.ok ? undefined : (state.message ?? state.fieldErrors?.form)
  if (!message) return null
  return (
    <div
      role="alert"
      className="grid gap-1 rounded-2xl border border-destructive/40 bg-background px-4 py-3 text-destructive text-sm"
    >
      <p>{message}</p>
      {afterApproval && <p>{copy.nothingCharged}</p>}
    </div>
  )
}

/**
 * Step 3, payment: what is being bought, the methods as radio cards (invoice alone when the
 * offering has no fixed price or the mock is off), the chosen method's own controls, the
 * test-mode line and the pay button. Every wallet or Swish payment is the mock in
 * `src/lib/mock-payment.ts`, authorised here in the browser before the form is submitted. Posted
 * with the booking: `paymentMethod` and, for an organisation's invoice, its billing details; the
 * Swish number has no `name` and stays in the browser. Loaded lazily (`lazy-payment-step.tsx`).
 */
export function PaymentStep({
  active,
  price,
  quantity = 1,
  audience,
  offering,
  when,
  location,
  email,
  state,
  pending,
  submit,
  onLockChange,
  mock = mockPaymentsOn(),
}: PaymentStepProps) {
  const copy = useBookingCopy()
  const locale = useLocale()
  const text = copy.payment
  const methods = methodsFor(price !== null, mock)
  const offersMock = methods.length > 1
  const [method, setMethod] = useState<PaymentMethod | null>(
    methods.length === 1 ? (methods[0] ?? null) : null
  )
  const [stage, setStage] = useState<Stage>("idle")
  const stageRef = useRef<Stage>("idle")
  stageRef.current = stage
  const [afterApproval, setAfterApproval] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const controller = useRef<AbortController | null>(null)
  const payRef = useRef<HTMLButtonElement>(null)
  const cancelRef = useRef<HTMLButtonElement>(null)
  const sectionRef = useRef<HTMLDivElement>(null)
  const lock = useRef(onLockChange)
  lock.current = onLockChange

  // A new answer from the action (an error: a success leaves the page) ends the mock's display;
  // if the mock had approved, the error says nothing was charged.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs on each new answer only
  useEffect(() => {
    setAfterApproval(stageRef.current === "approved")
    setStage("idle")
    setErrors({})
  }, [state])
  useEffect(() => () => controller.current?.abort(), [])
  useEffect(() => {
    if (!active) controller.current?.abort()
  }, [active])
  useEffect(() => {
    lock.current?.(stage === "waiting" || stage === "approved")
    if (stage === "waiting") cancelRef.current?.focus()
    // Back on the pay button once it is enabled again, so a keyboard user carries on from there.
    if (stage === "cancelled") payRef.current?.focus()
  }, [stage])

  // The browser's checks over the server's answer, for the fields on this step.
  const local: FormState = {
    ok: false,
    fieldErrors: { ...(state.ok ? {} : state.fieldErrors), ...errors },
  }
  const amount = price ? price.amount * quantity : 0
  const total = price ? formatKr(vatBreakdown(amount, audience).total, locale) : ""
  const busy = stage === "waiting" || stage === "approved" || pending
  const brand = method ? text.methods[method].label : ""
  const priced = price ? "priced" : "unpriced"

  const choose = (next: PaymentMethod) => {
    setMethod(next)
    setErrors({})
    setAfterApproval(false)
    if (stage === "cancelled") setStage("idle")
  }

  const check = (): Record<string, string> => {
    const out: Record<string, string> = {}
    const read = (id: string) =>
      (sectionRef.current?.querySelector<HTMLInputElement>(`#${id}`)?.value ?? "").trim()
    if (!method) out.paymentMethod = copy.check.method
    if (method === "swish" && !normaliseSwishNumber(read("swishNumber"))) {
      out.swishNumber = text.swish.invalid
    }
    if (method === "invoice" && audience === "organisation") {
      if (!isOrgNumber(read("invoiceOrgNumber"))) {
        out.invoiceOrgNumber = text.invoice.orgNumberInvalid
      }
      if (!read("invoiceReference")) out.invoiceReference = text.invoice.referenceMissing
      if (!read("invoiceAddress")) out.invoiceAddress = text.invoice.addressMissing
    }
    return out
  }

  const pay = async () => {
    const found = check()
    // An empty object, not none: the server's own field errors for this step clear too.
    setErrors(
      Object.keys(found).length > 0
        ? found
        : {
            paymentMethod: "",
            invoiceOrgNumber: "",
            invoiceReference: "",
            invoiceAddress: "",
          }
    )
    setAfterApproval(false)
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
      await authoriseMockPayment(method, { signal: ctrl.signal })
      setStage("approved")
      submit()
    } catch {
      if (controller.current === ctrl) setStage("cancelled")
    }
  }

  const Mark = method ? PAYMENT_MARKS[method] : null
  const wallet = method === "apple_pay" || method === "google_pay"
  const waitingText = method === "swish" ? text.swish.open : wallet ? text.approve : ""
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
        quantity={quantity}
        locale={locale}
      />

      <PaymentMethods
        copy={text}
        methods={methods}
        value={method}
        onChange={choose}
        disabled={busy}
        describedBy={local.fieldErrors?.paymentMethod ? "paymentMethod-error" : undefined}
      >
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
          {text.invoice.private[priced](email)}
        </p>
      )}
      {method === "invoice" && audience === "organisation" && (
        // Posted with the booking: the server checks them again and adds them to its notes.
        <div className="grid gap-4">
          <p className="rounded-2xl bg-background/70 px-4 py-3 text-sm">
            {text.invoice.organisation[priced]}
          </p>
          <div className="grid gap-2">
            <Label htmlFor="invoiceOrgNumber">{text.invoice.orgNumber}</Label>
            <p id="invoiceOrgNumber-hint" className="text-muted-foreground text-sm">
              {text.invoice.orgNumberHint}
            </p>
            <Input
              id="invoiceOrgNumber"
              name="invoiceOrgNumber"
              inputMode="numeric"
              autoComplete="off"
              disabled={busy}
              className="h-11 sm:max-w-64"
              defaultValue={value(state, "invoiceOrgNumber")}
              {...fieldAria("invoiceOrgNumber", local, "invoiceOrgNumber-hint")}
            />
            <FieldError name="invoiceOrgNumber" state={local} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoiceReference">{text.invoice.reference}</Label>
            <Input
              id="invoiceReference"
              name="invoiceReference"
              autoComplete="off"
              maxLength={100}
              disabled={busy}
              className="h-11"
              defaultValue={value(state, "invoiceReference")}
              {...fieldAria("invoiceReference", local)}
            />
            <FieldError name="invoiceReference" state={local} />
          </div>
          <div className="grid gap-2">
            <Label htmlFor="invoiceAddress">{text.invoice.address}</Label>
            <Input
              id="invoiceAddress"
              name="invoiceAddress"
              autoComplete="off"
              maxLength={300}
              disabled={busy}
              className="h-11"
              defaultValue={value(state, "invoiceAddress")}
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
            onClick={() => controller.current?.abort()}
          >
            {text.cancel}
          </Button>
        )}
      </div>

      <div className="grid gap-3">
        <PaymentError state={state} afterApproval={afterApproval} copy={text} />
        {offersMock && <p className="text-muted-foreground text-xs">{text.testMode}</p>}
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
