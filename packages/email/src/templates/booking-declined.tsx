import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"

export type BookingDeclinedProps = {
  reference: string
  offeringLabel: string
  /** Written by the admin, never by the customer. Rendered as plain text — React escapes it in
   * `html`; the plain-text render keeps it verbatim. */
  note?: string
  name?: string
  brand?: string
  locale?: Locale
}

export const bookingDeclinedSubject = (reference: string) => `About your request (${reference})`

/** Sent to the customer when a booking request is declined. */
export function BookingDeclined({
  reference,
  offeringLabel,
  note,
  name,
  brand,
  locale = DEFAULT_LOCALE,
}: BookingDeclinedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("bookingDeclined.preview", { reference })} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("bookingDeclined.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("bookingDeclined.body", { offeringLabel })}</Text>
      {note ? <Text style={{ whiteSpace: "pre-wrap" }}>{note}</Text> : null}
      <Text>{t("bookingDeclined.footer")}</Text>
    </Layout>
  )
}
