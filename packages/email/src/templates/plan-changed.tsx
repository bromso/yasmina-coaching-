import { Heading, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"
import { NotificationFooter, type NotificationLinks } from "./notification-footer"

export type PlanChangedProps = NotificationLinks & {
  name?: string
  workspaceName: string
  /** The workspace's plan now (`free`, `pro` or `team`). */
  plan: string
  brand?: string
  locale?: Locale
}

const PLAN_NAMES: Record<string, string> = { free: "Free", pro: "Pro", team: "Team" }

/** The English subject (tests and e2e match mail by it). */
export const planChangedSubject = (workspaceName: string, plan: string) =>
  `${workspaceName} is now on the ${PLAN_NAMES[plan] ?? plan} plan`

/**
 * An optional notification mail (`plan.changed`), to a workspace owner: the workspace's plan
 * changed. Names the workspace and the plan only — never who changed it, a price or a payment
 * detail.
 */
export function PlanChanged({
  name,
  workspaceName,
  plan,
  inboxUrl,
  unsubscribeUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: PlanChangedProps) {
  const t = translatorFor(locale, "email")
  const values = { workspace: workspaceName, plan }
  return (
    <Layout preview={t("planChanged.preview", values)} brand={brand} locale={locale}>
      <Heading as="h1">{t("planChanged.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("planChanged.body", values)}</Text>
      <NotificationFooter t={t} inboxUrl={inboxUrl} unsubscribeUrl={unsubscribeUrl} />
    </Layout>
  )
}
