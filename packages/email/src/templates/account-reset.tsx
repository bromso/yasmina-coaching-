import { Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

export type AccountResetProps = {
  name?: string
  /** Base URL of the account app; the mail links to its `/security` page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const accountResetSubject = "Your account was reset"

/**
 * Sent after the pre-account-hijack purge: an unverified account's password was removed and every
 * device signed out because someone proved they own the address another way.
 */
export function AccountReset({
  name,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: AccountResetProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("accountReset.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("accountReset.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("accountReset.body")}</Text>
      <Text>
        {t("accountReset.footer")}
        <Link href={security}>{security}</Link>.
      </Text>
    </Layout>
  )
}
