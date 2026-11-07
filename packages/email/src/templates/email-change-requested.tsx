import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

export type EmailChangeRequestedProps = {
  name?: string
  /** The requested new address, masked (`maskEmail`) — never shown in full. */
  maskedEmail: string
  /** The auth app's `/email/cancel?token=…`. */
  link: string
  brand?: string
  locale?: Locale
}

export const emailChangeRequestedSubject = "Your email address is changing"

/**
 * Sent to the account's *current* address by `account.email.requestChange`, alongside
 * `EmailChangeConfirm` to the new one: tells whoever still reads this mailbox what is happening,
 * and lets them cancel it before the new address ever confirms. The cancel link works for 24
 * hours (`email_change_cancel`, the same lifetime as the pending change itself).
 */
export function EmailChangeRequested({
  name,
  maskedEmail,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: EmailChangeRequestedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("emailChangeRequested.preview", { maskedEmail })}
      brand={brand}
      locale={locale}
    >
      <Heading as="h1">{t("emailChangeRequested.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("emailChangeRequested.body", { maskedEmail })}</Text>
      <Text>{t("emailChangeRequested.cancelNotice")}</Text>
      <Button href={link} style={button}>
        {t("emailChangeRequested.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={link}>{link}</Link>
      </Text>
      <Text>{t("emailChangeRequested.footer")}</Text>
    </Layout>
  )
}
