import { Text } from "@react-email/components"
import { formatUtcDate } from "@repo/i18n/dates"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"

export type AccountSuspendedProps = {
  name?: string
  /** ISO timestamp the suspension lifts itself; null = indefinite. Never the admin's own reason
   * or identity — this mail carries neither. */
  until: string | null
  brand?: string
  locale?: Locale
}

export const accountSuspendedSubject = "Your account has been suspended"

/**
 * Sent by `admin.users.suspend`, once per suspension and again only when the end date changes on
 * an already-suspended account (never for a reason-only edit). Deliberately says nothing about
 * why — only that it happened, when (if ever) it lifts, and how to reach support.
 */
export function AccountSuspended({
  name,
  until,
  brand,
  locale = DEFAULT_LOCALE,
}: AccountSuspendedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("accountSuspended.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("accountSuspended.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>
        {until === null
          ? t("accountSuspended.bodyIndefinite")
          : t("accountSuspended.bodyUntil", { date: formatUtcDate(until, locale) })}
      </Text>
      <Text>{t("accountSuspended.support")}</Text>
    </Layout>
  )
}
