"use client"

import { INTERVALS, type Interval, PAID_PLANS, PLANS } from "@repo/api-contract/billing-plans"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { Card } from "@repo/ui/components/card"
import { FieldError, FormMessage, fieldAria } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { startCheckout } from "@/app/(account)/payments/actions"
import type { FormState } from "@/lib/actions"
import { formatPrice, intervalLabel, seatLimitLabel } from "@/lib/plans"

type PaidPlan = (typeof PAID_PLANS)[number]

const prefix = "plan-"
const radio =
  "accent-primary focus-visible:ring-ring/50 mt-0.5 size-4 shrink-0 outline-none focus-visible:ring-[3px]"
/** A radio's card: the compact Card's shape, a row with the radio first, marked when checked. */
const option =
  "has-[:checked]:border-primary has-[:checked]:bg-muted/50 cursor-pointer flex-row gap-3 p-4 text-sm shadow-none"

/** An action state owned by a parent, which then renders the form's message itself. */
export type SharedForm = {
  state: FormState
  action: (fd: FormData) => void
  pending: boolean
}

/**
 * Plan + interval as native radios, so it submits without JavaScript. On its own it posts to
 * checkout; with `form` it posts to the parent's action (with `intent`), so the parent's forms
 * share one result and one message.
 */
export function PlanPicker({
  workspaceId,
  submitLabel,
  defaultPlan = "pro",
  defaultInterval = "month",
  form,
  intent,
  note,
  locale,
}: {
  workspaceId: number
  submitLabel: string
  defaultPlan?: PaidPlan
  defaultInterval?: Interval
  form?: SharedForm
  intent?: string
  note?: string
  /** The page's language, for the prices. */
  locale: Locale
}) {
  const t = useTranslations("account.payments")
  const tPlans = useTranslations("account.plans")
  // A feature's label is `account.features.<feature>`, never the contract's English `featureCopy`.
  const tFeatures = useTranslations("account.features")
  const [ownState, ownAction, ownPending] = useActionState(startCheckout, {
    ok: false,
  } as FormState)
  const { state, action, pending } = form ?? {
    state: ownState,
    action: ownAction,
    pending: ownPending,
  }
  const values = state.ok ? undefined : state.values
  const plan = values?.plan || defaultPlan
  const interval = values?.interval || defaultInterval

  return (
    <form action={action} className="grid gap-5 px-6 py-5">
      {!form && <FormMessage state={state} />}
      <input type="hidden" name="workspaceId" value={workspaceId} />
      {intent && <input type="hidden" name="intent" value={intent} />}
      <fieldset
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: aria-invalid is not valid on a fieldset's implicit group role; radiogroup supports it, and the fieldset keeps its legend.
        role="radiogroup"
        className="grid gap-3"
        {...fieldAria("plan", state, undefined, { idPrefix: prefix })}
      >
        <legend className="mb-3 text-sm font-medium">{t("plan")}</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          {PAID_PLANS.map((key) => {
            const p = PLANS[key]
            const id = `${prefix}${key}`
            return (
              <Card as="label" size="compact" key={key} htmlFor={id} className={option}>
                <input
                  id={id}
                  type="radio"
                  name="plan"
                  value={key}
                  defaultChecked={plan === key}
                  required
                  className={radio}
                />
                <span className="grid gap-1">
                  <span className="font-medium">{p.name}</span>
                  <span>
                    {tPlans("price", {
                      month: formatPrice(p.price.month, locale),
                      year: formatPrice(p.price.year, locale),
                    })}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {[seatLimitLabel(p, tPlans), ...p.features.map((f) => tFeatures(f))].join(
                      " · "
                    )}
                  </span>
                </span>
              </Card>
            )
          })}
        </div>
        <FieldError name="plan" state={state} idPrefix={prefix} />
      </fieldset>
      <fieldset
        // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: aria-invalid is not valid on a fieldset's implicit group role; radiogroup supports it, and the fieldset keeps its legend.
        role="radiogroup"
        className="grid gap-3"
        {...fieldAria("interval", state, undefined, { idPrefix: prefix })}
      >
        <legend className="mb-3 text-sm font-medium">{t("interval")}</legend>
        <div className="flex flex-wrap gap-3">
          {INTERVALS.map((key) => {
            const id = `${prefix}interval-${key}`
            return (
              <Card as="label" size="compact" key={key} htmlFor={id} className={option}>
                <input
                  id={id}
                  type="radio"
                  name="interval"
                  value={key}
                  defaultChecked={interval === key}
                  required
                  className={radio}
                />
                {intervalLabel(key, tPlans)}
              </Card>
            )
          })}
        </div>
        <FieldError name="interval" state={state} idPrefix={prefix} />
      </fieldset>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? t("working") : submitLabel}
        </Button>
        {note && <p className="text-muted-foreground text-xs">{note}</p>}
      </div>
    </form>
  )
}
