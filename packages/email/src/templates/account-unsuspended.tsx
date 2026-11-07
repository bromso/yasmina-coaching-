import { Heading, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

export type AccountUnsuspendedProps = {
  name?: string
  brand?: string
  locale?: Locale
}

export const accountUnsuspendedSubject = "Your account is no longer suspended"

/** Sent by `admin.users.unsuspend`, once the suspension's columns are cleared. Never the admin's
 * reason or identity, and never sent for a no-op unsuspend of an account that was not suspended. */
export function AccountUnsuspended({
  name,
  brand,
  locale = DEFAULT_LOCALE,
}: AccountUnsuspendedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("accountUnsuspended.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("accountUnsuspended.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("accountUnsuspended.body")}</Text>
    </Layout>
  )
}
