import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, Layout } from "./layout"

/**
 * The internal mail to Yasmina about a new contact request from `/kontakt`. The answers arrive as
 * English labels (`LEAD_*_LABELS` in `@repo/api-contract/leads`); every value the visitor typed
 * (name, phone, organisation, role, message) is rendered as plain text, never HTML — React
 * escapes it in `html`, the plain-text render keeps it verbatim.
 */
export type LeadNewProps = {
  reference: string
  audience: string
  need: string
  timeline: string
  contactMethod: string
  name: string
  email: string
  phone?: string
  organisation?: string
  role?: string
  message?: string
  newsletter: boolean
  page?: string
  adminUrl: string
  brand?: string
  locale?: Locale
}

export const leadNewSubject = (reference: string, need: string) =>
  `New contact request ${reference}: ${need}`

/** Sent to Yasmina (BOOKING_EMAIL) when someone sends the contact form; Reply-To the sender. */
export function LeadNew({
  reference,
  audience,
  need,
  timeline,
  contactMethod,
  name,
  email,
  phone,
  organisation,
  role,
  message,
  newsletter,
  page,
  adminUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: LeadNewProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("leadNew.preview", { name })} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("leadNew.heading")}</EmailHeading>
      <Text>{t("leadNew.reference", { reference })}</Text>
      <Text>{t("leadNew.audience", { audience })}</Text>
      <Text>{t("leadNew.need", { need })}</Text>
      <Text>{t("leadNew.timeline", { timeline })}</Text>
      <Text>{t("leadNew.name", { name })}</Text>
      <Text>{t("leadNew.email", { email })}</Text>
      {phone ? <Text>{t("leadNew.phone", { phone })}</Text> : null}
      {organisation ? <Text>{t("leadNew.organisation", { organisation })}</Text> : null}
      {role ? <Text>{t("leadNew.role", { role })}</Text> : null}
      <Text>{t("leadNew.contactMethod", { contactMethod })}</Text>
      <Text>{t("leadNew.newsletter", { newsletter: newsletter ? "yes" : "no" })}</Text>
      {page ? <Text>{t("leadNew.page", { page })}</Text> : null}
      {message ? (
        <>
          <Text>{t("leadNew.messageLabel")}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{message}</Text>
        </>
      ) : null}
      <Button href={adminUrl} style={button}>
        {t("leadNew.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={adminUrl}>{adminUrl}</EmailLink>
      </Text>
      <Text>{t("leadNew.footer", { email })}</Text>
    </Layout>
  )
}
