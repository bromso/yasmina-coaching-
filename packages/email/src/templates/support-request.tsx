import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, Layout } from "./layout"

export type SupportRequestProps = {
  reference: string
  topic: string
  email: string
  name?: string
  page?: string
  /** The submitter's own text. Rendered as plain text, never HTML — React escapes it in `html`; the
   * plain-text render keeps it verbatim (see `index.test.tsx`'s script-escaping test). */
  message: string
  adminUrl: string
  brand?: string
  locale?: Locale
}

export const supportRequestSubject = (reference: string, topic: string) =>
  `New support request ${reference}: ${topic}`

/** Sent to the support team when a visitor submits the help center's contact form. */
export function SupportRequest({
  reference,
  topic,
  email,
  name,
  page,
  message,
  adminUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: SupportRequestProps) {
  const t = translatorFor(locale, "email")
  const from = name ? `${name} (${email})` : email
  return (
    <Layout preview={t("supportRequest.preview", { email })} brand={brand} locale={locale}>
      <Heading as="h1">{t("supportRequest.heading")}</Heading>
      <Text>{t("supportRequest.reference", { reference })}</Text>
      <Text>{t("supportRequest.topic", { topic })}</Text>
      <Text>{t("supportRequest.from", { from })}</Text>
      {page ? <Text>{t("supportRequest.page", { page })}</Text> : null}
      <Text>{t("supportRequest.messageLabel")}</Text>
      <Text style={{ whiteSpace: "pre-wrap" }}>{message}</Text>
      <Button href={adminUrl} style={button}>
        {t("supportRequest.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={adminUrl}>{adminUrl}</Link>
      </Text>
      <Text>{t("supportRequest.footer", { email })}</Text>
    </Layout>
  )
}
