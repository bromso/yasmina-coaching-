import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type EmailChangedProps = {
  name?: string
  /** The address the account was changed to, masked (`maskEmail`) — never shown in full. */
  maskedEmail: string
  /** The auth app's `/email/revert?token=…`, the "This wasn't me" undo link. */
  link: string
  brand?: string
  locale?: Locale
}

export const emailChangedSubject = "Your email address was changed"

/**
 * Sent to the account's *old* address once `account.email.confirmChange` completes — the old
 * mailbox's only remaining way to catch a change it did not make. The undo link
 * (`email_change_revert`) works for 7 days.
 */
export function EmailChanged({
  name,
  maskedEmail,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: EmailChangedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("emailChanged.preview", { maskedEmail })} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("emailChanged.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("emailChanged.body", { maskedEmail })}</Text>
      <Text>{t("emailChanged.undoNotice")}</Text>
      <Button href={link} style={button}>
        {t("emailChanged.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("emailChanged.footer")}</Text>
    </Layout>
  )
}
