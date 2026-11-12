import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type PasskeyAddedProps = {
  name?: string
  /** The new passkey's own name (never key material) — "This device", "Security key", or
   * whatever the user chose. */
  passkeyName: string
  /** The account's security page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const passkeyAddedSubject = "A new passkey was added to your account"

/** Sent after `account.passkeys.register` adds a passkey that can now sign the account in. */
export function PasskeyAdded({
  name,
  passkeyName,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: PasskeyAddedProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("passkeyAdded.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("passkeyAdded.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("passkeyAdded.body", { passkeyName })}</Text>
      <Text>
        {t("passkeyAdded.footer")}
        <EmailLink href={security}>{security}</EmailLink>.
      </Text>
    </Layout>
  )
}
