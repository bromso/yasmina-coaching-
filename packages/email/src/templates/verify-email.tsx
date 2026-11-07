import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

export type VerifyEmailProps = { name?: string; link: string; brand?: string; locale?: Locale }

export const verifyEmailSubject = "Verify your email"

export function VerifyEmail({ name, link, brand, locale = DEFAULT_LOCALE }: VerifyEmailProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("verifyEmail.preview")} brand={brand} locale={locale}>
      {
        // `heading` and `headingNameSuffix` are two separate messages (not one
        // "Welcome{name, select, ...}" message) only so the original two-sibling JSX structure —
        // and therefore React Email's SSR hydration comment between them — stays byte-identical to
        // before this template took a locale. Safe to merge into one message once English is
        // re-baselined and that constraint no longer applies.
      }
      <Heading as="h1">
        {t("verifyEmail.heading")}
        {name ? t("verifyEmail.headingNameSuffix", { name }) : ""}
      </Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("verifyEmail.body")}</Text>
      <Button href={link} style={button}>
        {t("verifyEmail.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={link}>{link}</Link>
      </Text>
      <Text>{t("verifyEmail.footer")}</Text>
    </Layout>
  )
}
