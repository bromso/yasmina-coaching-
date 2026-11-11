import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type TwoFactorDisabledProps = {
  name?: string
  /** The account's security page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const twoFactorDisabledSubject = "Two-step verification turned off"

/** Sent once a confirmed code turns two-step verification off. */
export function TwoFactorDisabled({
  name,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: TwoFactorDisabledProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("twoFactorDisabled.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("twoFactorDisabled.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("twoFactorDisabled.body")}</Text>
      <Text>
        {t("twoFactorDisabled.footer")}
        <EmailLink href={security}>{security}</EmailLink>.
      </Text>
    </Layout>
  )
}
