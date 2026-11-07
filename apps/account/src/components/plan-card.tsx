import type { Billing } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { useTranslations } from "next-intl"
import type { ReactNode } from "react"
import { formatDate, intervalLabel, seatsLine, statusLabel } from "@/lib/plans"

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[10rem_minmax(0,1fr)] items-center gap-4 px-6 py-3 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{children}</dd>
    </div>
  )
}

/** The workspace's plan as the api reports it: name, state, renewal, interval and seats. */
export function PlanCard({ billing, locale }: { billing: Billing; locale: Locale }) {
  const t = useTranslations("account.payments")
  const tPlans = useTranslations("account.plans")
  const paid = billing.plan !== "free"
  const renews = paid && !billing.cancelAtPeriodEnd ? billing.currentPeriodEnd : null
  return (
    <dl className="flex flex-col divide-y">
      <Detail label={t("plan")}>
        <span className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{billing.planName}</span>
          <Badge variant={billing.status === "past_due" ? "destructive" : "secondary"}>
            {statusLabel(billing, tPlans, locale)}
          </Badge>
        </span>
      </Detail>
      {renews && <Detail label={t("renews")}>{formatDate(renews, locale)}</Detail>}
      {paid && billing.interval && (
        <Detail label={t("billing")}>{intervalLabel(billing.interval, tPlans)}</Detail>
      )}
      <Detail label={t("seats")}>{seatsLine(billing, tPlans)}</Detail>
    </dl>
  )
}
