import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, EmailLink, greeting, Layout } from "./layout"

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
      <EmailHeading as="h1">{t("twoFactorEnabled.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("twoFactorEnabled.body")}</Text>
      <Text>
        {t("twoFactorEnabled.footer")}
        <EmailLink href={security}>{security}</EmailLink>.
      </Text>
    </Layout>
  )
}
