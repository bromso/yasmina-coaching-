"use client"

import type { Billing } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { mockBilling } from "@/app/(account)/payments/actions"
import { PlanPicker } from "@/components/plan-picker"
import type { FormState } from "@/lib/actions"

/**
 * An owner's Change-plan card on the mock provider. On Free the picker goes through checkout as
 * with Stripe (the mock activates at once and returns to `?checkout=success`); on a paid plan it
 * switches in place, and the plan can be cancelled. Every form here posts to one action, so the
 * card has one result and one message: a switch and a cancel can never contradict each other.
 */
export function MockBillingForm({
  billing,
  workspaceId,
  locale,
}: {
  billing: Billing
  workspaceId: number
  locale: Locale
}) {
  const t = useTranslations("account.payments")
  const [state, action, pending] = useActionState(mockBilling, { ok: false } as FormState)
  const paid = billing.plan !== "free"
  return (
    <>
      {/* Always mounted, so the live region exists before a result arrives. */}
      <div className={state.message ? "grid gap-2 px-6 pt-5" : undefined}>
        <FormMessage state={state} />
      </div>
      <PlanPicker
        workspaceId={workspaceId}
        form={{ state, action, pending }}
        intent={paid ? "change" : "checkout"}
        submitLabel={paid ? t("switchPlan") : t("continueCheckout")}
        defaultPlan={billing.plan === "team" ? "team" : "pro"}
        defaultInterval={billing.interval ?? "month"}
        note={t("mockNote")}
        locale={locale}
      />
      {paid && (
        <form action={action} className="px-6 py-5">
          <input type="hidden" name="workspaceId" value={workspaceId} />
          <input type="hidden" name="intent" value="change" />
          <input type="hidden" name="plan" value="cancel" />
          <Button type="submit" variant="outline" disabled={pending}>
            {pending ? t("working") : t("cancelSubscription")}
          </Button>
        </form>
      )}
    </>
  )
}
