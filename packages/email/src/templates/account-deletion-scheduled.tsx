import { Button, Text } from "@react-email/components"
import { formatUtcDate } from "@repo/i18n/dates"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type AccountDeletionScheduledProps = {
  name?: string
  /** ISO timestamp of the scheduled purge; rendered as a UTC date in the recipient's locale. */
  date: string
  /** Where to sign in to cancel the deletion. */
  link: string
  brand?: string
  locale?: Locale
}

export const accountDeletionScheduledSubject = "Your account will be deleted"

/** Sent when `account.delete` schedules the purge; signing in before `date` cancels it. */
export function AccountDeletionScheduled({
  name,
  date,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: AccountDeletionScheduledProps) {
  const t = translatorFor(locale, "email")
  const formattedDate = formatUtcDate(date, locale)
  return (
    <Layout
      preview={t("accountDeletionScheduled.preview", { date: formattedDate })}
      brand={brand}
      locale={locale}
    >
      <EmailHeading as="h1">{t("accountDeletionScheduled.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("accountDeletionScheduled.body", { date: formattedDate })}</Text>
      <Button href={link} style={button}>
        {t("accountDeletionScheduled.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
    </Layout>
  )
}
