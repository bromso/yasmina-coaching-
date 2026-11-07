import { Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

export type TwoFactorResetProps = {
  name?: string
  /** The account's security page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const twoFactorResetSubject = "Two-step verification was reset"

/** Sent after an administrator turns two-step verification off on this account (lost-phone recovery). */
export function TwoFactorReset({
  name,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: TwoFactorResetProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("twoFactorReset.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("twoFactorReset.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("twoFactorReset.body")}</Text>
      <Text>
        {t("twoFactorReset.footer")} <Link href={security}>{security}</Link>.
      </Text>
    </Layout>
  )
}
