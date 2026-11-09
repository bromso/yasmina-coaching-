import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

/**
 * Only the reference, the offering and the link: this mail goes to whatever address was typed
 * into the booking form, so it carries none of the customer's own text (see `supportReceived`).
 */
export type BookingRequestReceivedProps = {
  reference: string
  offeringLabel: string
  manageUrl: string
  name?: string
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
      <Heading as="h1">{t("bookingRequestReceived.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("bookingRequestReceived.body", { offeringLabel })}</Text>
      <Button href={manageUrl} style={button}>
        {t("bookingRequestReceived.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={manageUrl}>{manageUrl}</Link>
      </Text>
    </Layout>
  )
}
