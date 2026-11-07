import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, Layout } from "./layout"

export type BookingKind = "instant" | "group" | "request"

/**
 * The internal mail to Yasmina. Every customer-typed value (name, organisation, phone, venue,
 * message, …) is rendered as plain text, never HTML — React escapes it in `html`; the plain-text
 * render keeps it verbatim. Dates (`when`, `extraSessions`, `preferredDates`) arrive
 * pre-formatted from apps/api.
 */
export type BookingNewProps = {
  reference: string
  offeringLabel: string
  kind: BookingKind
  name: string
  email: string
  organisation?: string
  phone?: string
  audience: "private" | "organisation"
  location: string
  when?: string
  extraSessions?: string[]
  preferredDates?: string[]
  attendees?: number
  venue?: string
  message?: string
  adminUrl: string
  brand?: string
  locale?: Locale
}

export const bookingNewSubject = (reference: string, offeringLabel: string, kind: BookingKind) =>
  `${kind === "request" ? "New request" : "New booking"}: ${offeringLabel} (${reference})`

/** Sent to Yasmina when a customer books or requests a session. */
export function BookingNew({
  reference,
  offeringLabel,
  kind,
  name,
  email,
  organisation,
  phone,
  audience,
  location,
  when,
  extraSessions,
  preferredDates,
  attendees,
  venue,
  message,
  adminUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: BookingNewProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("bookingNew.preview", { kind, name })} brand={brand} locale={locale}>
      <Heading as="h1">{t("bookingNew.heading", { kind })}</Heading>
      <Text>{t("bookingNew.reference", { reference })}</Text>
      <Text>{t("bookingNew.offering", { offeringLabel })}</Text>
      <Text>{t("bookingNew.name", { name })}</Text>
      <Text>{t("bookingNew.email", { email })}</Text>
      {organisation ? <Text>{t("bookingNew.organisation", { organisation })}</Text> : null}
      {phone ? <Text>{t("bookingNew.phone", { phone })}</Text> : null}
      <Text>{t("bookingNew.audience", { audience })}</Text>
      <Text>{t("bookingNew.location", { location })}</Text>
      {when ? <Text>{t("bookingNew.when", { when })}</Text> : null}
      {extraSessions && extraSessions.length > 0 ? (
        <>
          <Text>{t("bookingNew.extraSessionsLabel")}</Text>
          {extraSessions.map((session) => (
            <Text key={session}>{session}</Text>
          ))}
        </>
      ) : null}
      {preferredDates && preferredDates.length > 0 ? (
        <>
          <Text>{t("bookingNew.preferredDatesLabel")}</Text>
          {preferredDates.map((date) => (
            <Text key={date}>{date}</Text>
          ))}
        </>
      ) : null}
      {attendees !== undefined ? <Text>{t("bookingNew.attendees", { attendees })}</Text> : null}
      {venue ? <Text>{t("bookingNew.venue", { venue })}</Text> : null}
      {message ? (
        <>
          <Text>{t("bookingNew.messageLabel")}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{message}</Text>
        </>
      ) : null}
      <Button href={adminUrl} style={button}>
        {t("bookingNew.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={adminUrl}>{adminUrl}</Link>
      </Text>
      <Text>{t("bookingNew.footer", { email })}</Text>
    </Layout>
  )
}
