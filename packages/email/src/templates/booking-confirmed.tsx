import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

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
  /** The terms page on the legal app, in the customer's language. */
  termsUrl: string
  /**
   * A private client's new purchase: adds the line on the 14-day right of withdrawal. False for an
   * organisation and for a booking that opens no new contract (a member's session).
   */
  withdrawal: boolean
  /**
   * The client asked for the session to start within the withdrawal period: the line saying the
   * right ends once the service has been fully performed, in place of the generic one. Only with
   * `withdrawal`: a booking that opens no right never says it ends.
   */
  earlyStart?: boolean
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
  termsUrl,
  withdrawal,
  earlyStart = false,
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
      <EmailHeading as="h1">{t("bookingConfirmed.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("bookingConfirmed.body", { offeringLabel, when, where })}</Text>
      {extraSessions && extraSessions.length > 0 ? (
        <>
          <EmailHeading as="h2">{t("bookingConfirmed.extraSessionsHeading")}</EmailHeading>
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
        <EmailLink href={manageUrl}>{manageUrl}</EmailLink>
      </Text>
      {memberBookingUrl ? (
        <Text>
          {t("bookingConfirmed.memberBooking")}
          <EmailLink href={memberBookingUrl}>{memberBookingUrl}</EmailLink>
        </Text>
      ) : null}
      <Text>{t("bookingConfirmed.footer", { hours: cancelCutoffHours })}</Text>
      <Text>
        {t("bookingConfirmed.terms")}
        <EmailLink href={termsUrl}>{termsUrl}</EmailLink>
      </Text>
      {withdrawal ? (
        <Text>{t(earlyStart ? "bookingConfirmed.earlyStart" : "bookingConfirmed.withdrawal")}</Text>
      ) : null}
    </Layout>
  )
}
