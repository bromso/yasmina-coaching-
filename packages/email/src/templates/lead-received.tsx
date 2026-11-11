import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

/** The tailored next step's kind (`LeadNextStepKind` in `@repo/api-contract/leads`). */
export type LeadNextStepKind = "inner" | "coaching" | "proposal" | "explore"

/**
 * Only the reference and the next step: this mail goes to whatever address was typed into the
 * contact form, so it carries none of the visitor's own text (no message, no name) — the same
 * reasoning as `supportReceived`. The next step is chosen from the visitor's answers (fixed
 * options, never free text) and links a page on the site.
 */
export type LeadReceivedProps = {
  reference: string
  nextStep: LeadNextStepKind
  nextStepUrl: string
  brand?: string
  locale?: Locale
}

export const leadReceivedSubject = (reference: string) =>
  `Thank you for getting in touch (${reference})`

/** Sent to whoever sent the contact form, in the page's language. */
export function LeadReceived({
  reference,
  nextStep,
  nextStepUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: LeadReceivedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("leadReceived.preview", { reference })} brand={brand} locale={locale}>
      <Heading as="h1">{t("leadReceived.heading")}</Heading>
      <Text>{greeting(t)}</Text>
      <Text>{t("leadReceived.body", { reference })}</Text>
      <Text>{t("leadReceived.next", { kind: nextStep })}</Text>
      <Button href={nextStepUrl} style={button}>
        {t("leadReceived.button", { kind: nextStep })}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={nextStepUrl}>{nextStepUrl}</Link>
      </Text>
      <Text>{t("leadReceived.footer")}</Text>
    </Layout>
  )
}
