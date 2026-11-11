import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type EmailChangeConfirmProps = {
  name?: string
  /** The account app's `/email/confirm?token=…`. */
  link: string
  brand?: string
  locale?: Locale
}

export const emailChangeConfirmSubject = "Confirm your new email address"

/**
 * Sent to the *new* address by `account.email.requestChange`: the confirm link, usable within 24
 * hours. This confirmation is itself the new address's verification — see `apps/api/README.md`'s
 * Email section.
 */
export function EmailChangeConfirm({
  name,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: EmailChangeConfirmProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("emailChangeConfirm.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("emailChangeConfirm.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("emailChangeConfirm.body")}</Text>
      <Button href={link} style={button}>
        {t("emailChangeConfirm.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("emailChangeConfirm.footer")}</Text>
    </Layout>
  )
}
