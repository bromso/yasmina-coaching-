import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type PasswordChangedProps = {
  name?: string
  /** ISO timestamp of the change; rendered as a UTC date string. */
  at: string
  /** The account's signed-in devices page. */
  accountUrl: string
  /** Where to request a reset — the only page a user locked out by the change can still use. */
  resetUrl: string
  brand?: string
  locale?: Locale
}

export const passwordChangedSubject = "Your password was changed"

/**
 * `at`, formatted for display. English keeps today's exact `toUTCString()` output
 * (`Thu, 01 Oct 2026 18:00:00 GMT`), byte-identical to before this template took a locale.
 * Swedish uses a localized long date and a 24-hour time, with an explicit `UTC` suffix.
 */
function formatChangedAt(locale: Locale, at: string): string {
  const date = new Date(at)
  if (locale === "sv") {
    // Date and time are formatted apart and joined by hand: the combined `dateStyle`/`timeStyle`
    // pattern differs between ICU versions ("1 oktober 2026 18:00" vs "… kl. 18:00").
    const day = new Intl.DateTimeFormat("sv-SE", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(date)
    const hh = String(date.getUTCHours()).padStart(2, "0")
    const mm = String(date.getUTCMinutes()).padStart(2, "0")
    return `${day} ${hh}:${mm} UTC`
  }
  return date.toUTCString()
}

export function PasswordChanged({
  name,
  at,
  accountUrl,
  resetUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: PasswordChangedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("passwordChanged.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("passwordChanged.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      {
        // `bodyBefore` stops right before the date value rather than being one
        // "...changed on {date}." message, only so the original text/expression/text JSX
        // structure — and therefore React Email's SSR hydration comments around the date — stays
        // byte-identical to before this template took a locale. Safe to merge into one message
        // (with `t.rich` or an ICU date argument) once English is re-baselined.
      }
      <Text>
        {t("passwordChanged.bodyBefore")}
        {formatChangedAt(locale, at)}.
      </Text>
      <Text>{t("passwordChanged.okNotice")}</Text>
      {
        // Likewise `resetNotice.before` / `.between`: split around the two <EmailLink>s only to keep
        // the original JSX child structure (and hence the hydration-comment placement, or its
        // absence) byte-identical to today's English. Safe to merge once re-baselined.
      }
      <Text>
        {t("passwordChanged.resetNotice.before")}
        <EmailLink href={resetUrl}>{resetUrl}</EmailLink>
        {t("passwordChanged.resetNotice.between")}
        <EmailLink href={accountUrl}>{accountUrl}</EmailLink>.
      </Text>
    </Layout>
  )
}
