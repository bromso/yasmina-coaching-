import { Button, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { button, EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type DataExportReadyProps = {
  name?: string
  /** Where to download the export, from the Data & privacy page. */
  link: string
  brand?: string
  locale?: Locale
}

export const dataExportReadySubject = "Your data export is ready"

/** Sent once `privacy.export` finishes writing the archive; the download stays live for 7 days. */
export function DataExportReady({
  name,
  link,
  brand,
  locale = DEFAULT_LOCALE,
}: DataExportReadyProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("dataExportReady.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("dataExportReady.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("dataExportReady.body")}</Text>
      <Button href={link} style={button}>
        {t("dataExportReady.button")}
      </Button>
      <Text>
        {t("layout.orLink")}
        <EmailLink href={link}>{link}</EmailLink>
      </Text>
      <Text>{t("dataExportReady.footer")}</Text>
    </Layout>
  )
}
