import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

/**
 * Only the reference, the offering, the link and the terms: this mail goes to whatever address was
 * typed into the booking form, so it carries none of the customer's own text (see
 * `supportReceived`).
 */
export type BookingRequestReceivedProps = {
  reference: string
  offeringLabel: string
  manageUrl: string
  name?: string
  /** The terms page on the legal app, in the customer's language. */
  termsUrl: string
  brand?: string
  locale?: Locale
}

export const bookingRequestReceivedSubject = (reference: string) =>
  `We've received your request (${reference})`

/** Sent to the customer when a booking request (no fixed time yet) has been received. */
export function BookingRequestReceived({
  reference,
  offeringLabel,
  manageUrl,
  name,
  termsUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: BookingRequestReceivedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("bookingRequestReceived.preview", { reference })}
      brand={brand}
      locale={locale}
    >
      <EmailHeading as="h1">{t("bookingRequestReceived.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("bookingRequestReceived.body", { offeringLabel })}</Text>
      <Button href={manageUrl} style={button}>
        {t("bookingRequestReceived.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={manageUrl}>{manageUrl}</EmailLink>
      </Text>
      <Text>
        {t("bookingRequestReceived.terms")}
        <EmailLink href={termsUrl}>{termsUrl}</EmailLink>
      </Text>
    </Layout>
  )
}
