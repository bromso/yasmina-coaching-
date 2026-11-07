import { Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { BRAND, Layout } from "./layout"

export type WaitlistWelcomeProps = { siteUrl: string; brand?: string; locale?: Locale }

export const waitlistWelcomeSubject = "You're on the list"

export function WaitlistWelcome({ siteUrl, brand, locale = DEFAULT_LOCALE }: WaitlistWelcomeProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("waitlistWelcome.preview", { brand: brand ?? BRAND })}
      brand={brand}
      locale={locale}
    >
      <Heading as="h1">{t("waitlistWelcome.heading")}</Heading>
      <Text>{t("waitlistWelcome.body")}</Text>
      <Text>
        {t("waitlistWelcome.meantime")}
        <Link href={siteUrl}>{siteUrl}</Link>
      </Text>
      <Text>{t("waitlistWelcome.footer")}</Text>
    </Layout>
  )
}
