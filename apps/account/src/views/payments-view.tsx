import type { Billing, Role, WorkspaceSummary } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { ManageBillingButton } from "@/components/manage-billing-button"
import { MockBillingForm } from "@/components/mock-billing-form"
import { PlanCard } from "@/components/plan-card"
import { PlanPicker } from "@/components/plan-picker"
import { SettingsCard } from "@/components/settings-card"

export type CheckoutReturn = "success" | "cancelled"

/** The `account.payments` keys `checkoutMessage` reads. */
type CheckoutT = (
  key: "checkoutCancelled" | "checkoutComplete" | "onPlan",
  values?: Record<string, string>
) => string

/** What `?checkout=` says when the provider sends the owner back, in `t`'s language. */
export function checkoutMessage(
  checkout: CheckoutReturn | undefined,
  billing: Billing,
  t: CheckoutT
) {
  if (checkout === "cancelled") return t("checkoutCancelled")
  if (checkout === "success")
    return billing.plan !== "free" ? t("onPlan", { plan: billing.planName }) : t("checkoutComplete")
  return undefined
}

function ChangePlan({
  billing,
  role,
  workspaceId,
  checkout,
  locale,
}: {
  billing: Billing
  role: Role
  workspaceId: number
  checkout?: CheckoutReturn
  locale: Locale
}) {
  const t = useTranslations("account.payments")
  if (role !== "owner")
    return <p className="px-6 py-5 text-sm">{t("notOwner", { plan: billing.planName })}</p>
  // Keyed on the checkout return, so a result from before checkout never sits beside its outcome.
  if (billing.provider === "mock")
    return (
      <MockBillingForm key={checkout} billing={billing} workspaceId={workspaceId} locale={locale} />
    )
  if (billing.plan === "free")
    return (
      <>
        <PlanPicker workspaceId={workspaceId} submitLabel={t("continueCheckout")} locale={locale} />
        {/* A former subscriber (Stripe, after a cancellation) keeps its invoices and card. */}
        {billing.portalAvailable && (
          <ManageBillingButton workspaceId={workspaceId} description={t("portalFormer")} />
        )}
      </>
    )
  return <ManageBillingButton workspaceId={workspaceId} />
}

export function PaymentsView({
  workspace,
  role,
  billing,
  checkout,
  locale,
}: {
  workspace: WorkspaceSummary
  role: Role
  billing: Billing
  checkout?: CheckoutReturn
  /** The page's language, for prices and dates (the picker is a client component). */
  locale: Locale
}) {
  const t = useTranslations("account.payments")
  const message = checkoutMessage(checkout, billing, t)
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro", { name: workspace.name })}</p>
      </div>

      <FormMessage state={{ ok: true, message }} />

      <SettingsCard title={t("plan")}>
        <PlanCard billing={billing} locale={locale} />
      </SettingsCard>

      <SettingsCard title={t("changePlan")}>
        <ChangePlan
          billing={billing}
          role={role}
          workspaceId={workspace.id}
          checkout={checkout}
          locale={locale}
        />
      </SettingsCard>
    </div>
  )
}
