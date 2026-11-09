import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, greeting, Layout } from "./layout"

/**
 * Every date and time arrives pre-formatted from apps/api (`when`, `extraSessions`), so this
 * template never formats one. The customer's own free text is never echoed here: the recipient is
 * whatever address was typed into the booking form (see `supportReceived`).
 */
export type BookingConfirmedProps = {
  reference: string
  offeringLabel: string
  when: string
  where: string
  manageUrl: string
  name?: string
  extraSessions?: string[]
  cancelCutoffHours: number
  /** Where a member books their sessions after a start call (`/book/inner_session`, …). */
  memberBookingUrl?: string
  brand?: string
  locale?: Locale
}

export const bookingConfirmedSubject = (reference: string) =>
  `Your booking is confirmed (${reference})`

/** Sent to the customer when a booking is confirmed, with the link to manage it. */
export function BookingConfirmed({
  reference,
  offeringLabel,
  when,
  where,
  manageUrl,
  name,
  extraSessions,
  cancelCutoffHours,
  memberBookingUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: BookingConfirmedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout
      preview={t("bookingConfirmed.preview", { reference, offeringLabel, when })}
      brand={brand}
      locale={locale}
    >
      <Heading as="h1">{t("bookingConfirmed.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("bookingConfirmed.body", { offeringLabel, when, where })}</Text>
      {extraSessions && extraSessions.length > 0 ? (
        <>
          <Heading as="h2">{t("bookingConfirmed.extraSessionsHeading")}</Heading>
          {extraSessions.map((session) => (
            <Text key={session}>{session}</Text>
          ))}
        </>
      ) : null}
      <Button href={manageUrl} style={button}>
        {t("bookingConfirmed.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={manageUrl}>{manageUrl}</Link>
      </Text>
      {memberBookingUrl ? (
        <Text>
          {t("bookingConfirmed.memberBooking")}
          <Link href={memberBookingUrl}>{memberBookingUrl}</Link>
        </Text>
      ) : null}
      <Text>{t("bookingConfirmed.footer", { hours: cancelCutoffHours })}</Text>
    </Layout>
  )
}
