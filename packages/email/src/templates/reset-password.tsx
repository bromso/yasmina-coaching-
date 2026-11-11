import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type ResetPasswordProps = { name?: string; link: string; brand?: string; locale?: Locale }

export const resetPasswordSubject = "Reset your password"

export function ResetPassword({ name, link, brand, locale = DEFAULT_LOCALE }: ResetPasswordProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("resetPassword.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("resetPassword.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("resetPassword.body")}</Text>
      <Button href={link} style={button}>
        {t("resetPassword.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("resetPassword.footer")}</Text>
    </Layout>
  )
}
