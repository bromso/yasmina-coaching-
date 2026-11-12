import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"

/**
 * Only the reference: this mail goes to whatever address was typed into a public form, so it
 * carries none of the submitter's own text (no message, no name) — otherwise anyone could send
 * branded mail with content of their choosing to any address.
 */
export type SupportReceivedProps = {
  reference: string
  brand?: string
  locale?: Locale
}

export const supportReceivedSubject = (reference: string) =>
  `We've received your request (${reference})`

/** Sent to whoever submitted the help center's contact form, confirming receipt. */
export function SupportReceived({
  reference,
  brand,
  locale = DEFAULT_LOCALE,
}: SupportReceivedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("supportReceived.preview", { reference })} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("supportReceived.heading")}</EmailHeading>
      <Text>{greeting(t)}</Text>
      <Text>{t("supportReceived.body", { reference })}</Text>
      <Text>{t("supportReceived.footer")}</Text>
    </Layout>
  )
}
