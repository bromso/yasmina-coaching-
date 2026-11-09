import { Heading, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

/** `when` arrives pre-formatted from apps/api; this template never formats a date. */
export type BookingCancelledProps = {
  reference: string
  offeringLabel: string
  when: string
  /** `true` when the customer cancelled online, `false` when Yasmina had to. */
  byCustomer: boolean
  /** Written by the admin, never by the customer. Rendered as plain text — React escapes it in
   * `html`; the plain-text render keeps it verbatim. */
  note?: string
  name?: string
  brand?: string
  locale?: Locale
}

export const bookingCancelledSubject = (reference: string) =>
  `Your booking is cancelled (${reference})`

/** Sent to the customer when a booking is cancelled, by them or by Yasmina. */
export function BookingCancelled({
  reference,
  offeringLabel,
  when,
  byCustomer,
  note,
  name,
  brand,
  locale = DEFAULT_LOCALE,
}: BookingCancelledProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("bookingCancelled.preview", { reference, offeringLabel, when })}
      brand={brand}
      locale={locale}
    >
      <Heading as="h1">{t("bookingCancelled.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>
        {byCustomer
          ? t("bookingCancelled.bodyByCustomer", { offeringLabel, when })
          : t("bookingCancelled.bodyByYasmina", { offeringLabel, when })}
      </Text>
      {note ? <Text style={{ whiteSpace: "pre-wrap" }}>{note}</Text> : null}
      <Text>{t("bookingCancelled.footer")}</Text>
    </Layout>
  )
}
