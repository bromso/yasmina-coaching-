import { Heading, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

/**
 * Only the reference and the job title: this mail goes to whatever address was typed into a
 * public form, so it carries none of the applicant's own text (no name, no note, no link) —
 * otherwise anyone could send branded mail with content of their choosing to any address.
 */
export type JobApplicationReceivedProps = {
  reference: string
  title: string
  brand?: string
  locale?: Locale
}

export const jobApplicationReceivedSubject = (reference: string) =>
  `We've received your application (${reference})`

/** Sent to whoever submitted a job application, confirming receipt. */
export function JobApplicationReceived({
  reference,
  title,
  brand,
  locale = DEFAULT_LOCALE,
}: JobApplicationReceivedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("jobApplicationReceived.preview", { reference })}
      brand={brand}
      locale={locale}
    >
      <Heading as="h1">{t("jobApplicationReceived.heading")}</Heading>
      <Text>{greeting(t)}</Text>
      <Text>{t("jobApplicationReceived.body", { reference, title })}</Text>
      <Text>{t("jobApplicationReceived.footer")}</Text>
    </Layout>
  )
}
