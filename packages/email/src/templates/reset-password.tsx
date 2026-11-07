import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

export type ResetPasswordProps = { name?: string; link: string; brand?: string; locale?: Locale }

export const resetPasswordSubject = "Reset your password"

export function ResetPassword({ name, link, brand, locale = DEFAULT_LOCALE }: ResetPasswordProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("resetPassword.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("resetPassword.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("resetPassword.body")}</Text>
      <Button href={link} style={button}>
        {t("resetPassword.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={link}>{link}</Link>
      </Text>
      <Text>{t("resetPassword.footer")}</Text>
    </Layout>
  )
}
