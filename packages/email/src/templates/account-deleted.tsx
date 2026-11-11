import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"

export type AccountDeletedProps = {
  name?: string
  brand?: string
  locale?: Locale
}

export const accountDeletedSubject = "Your account has been deleted"

/** Sent after `users.purge` runs: the account and its data are gone; shared notes stay. */
export function AccountDeleted({ name, brand, locale = DEFAULT_LOCALE }: AccountDeletedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("accountDeleted.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("accountDeleted.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("accountDeleted.body")}</Text>
    </Layout>
  )
}
