import { Button, Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, Layout } from "./layout"

export type JobApplicationProps = {
  reference: string
  title: string
  name: string
  email: string
  /** The applicant's own text, shown as plain text only — never a clickable `href` (the admin view
   * is where it is clickable). */
  link?: string
  /** The applicant's own text. Rendered as plain text, never HTML — React escapes it in `html`; the
   * plain-text render keeps it verbatim (see `index.test.tsx`'s script-escaping test). */
  note?: string
  adminUrl: string
  brand?: string
  locale?: Locale
}

export const jobApplicationSubject = (reference: string, title: string) =>
  `New application ${reference}: ${title}`

/** Sent to the hiring inbox when a candidate applies for an open role. */
export function JobApplication({
  reference,
  title,
  name,
  email,
  link,
  note,
  adminUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: JobApplicationProps) {
  const t = translatorFor(locale, "email")
  const from = `${name} (${email})`
  return (
    <Layout preview={t("jobApplication.preview", { title, email })} brand={brand} locale={locale}>
      <Heading as="h1">{t("jobApplication.heading")}</Heading>
      <Text>{t("jobApplication.reference", { reference })}</Text>
      <Text>{t("jobApplication.role", { title })}</Text>
      <Text>{t("jobApplication.from", { from })}</Text>
      {link ? <Text>{t("jobApplication.link", { link })}</Text> : null}
      {note ? (
        <>
          <Text>{t("jobApplication.noteLabel")}</Text>
          <Text style={{ whiteSpace: "pre-wrap" }}>{note}</Text>
        </>
      ) : null}
      <Button href={adminUrl} style={button}>
        {t("jobApplication.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <Link href={adminUrl}>{adminUrl}</Link>
      </Text>
      <Text>{t("jobApplication.footer", { email })}</Text>
    </Layout>
  )
}
