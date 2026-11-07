import { Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

export type TwoFactorEnabledProps = {
  name?: string
  /** The account's security page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const twoFactorEnabledSubject = "Two-step verification turned on"

/** Sent once a confirmed code turns two-step verification on (the end of `account.twoFactor.enable`). */
export function TwoFactorEnabled({
  name,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: TwoFactorEnabledProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("twoFactorEnabled.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("twoFactorEnabled.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("twoFactorEnabled.body")}</Text>
      <Text>
        {t("twoFactorEnabled.footer")}
        <Link href={security}>{security}</Link>.
      </Text>
    </Layout>
  )
}
