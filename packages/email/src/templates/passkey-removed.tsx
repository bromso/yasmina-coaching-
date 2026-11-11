import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, EmailLink, greeting, Layout } from "./layout"

export type PasskeyRemovedProps = {
  name?: string
  /** The removed passkey's own name (never key material). */
  passkeyName: string
  /** The account's security page. */
  accountUrl: string
  brand?: string
  locale?: Locale
}

export const passkeyRemovedSubject = "A passkey was removed from your account"

/** Sent after the account owner removes one of their own passkeys (`account.passkeys.delete`).
 * For every passkey being removed by a superadmin instead, see `PasskeysRemoved`. */
export function PasskeyRemoved({
  name,
  passkeyName,
  accountUrl,
  brand,
  locale = DEFAULT_LOCALE,
}: PasskeyRemovedProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("passkeyRemoved.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("passkeyRemoved.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("passkeyRemoved.body", { passkeyName })}</Text>
      <Text>
        {t("passkeyRemoved.footer")}
        <EmailLink href={security}>{security}</EmailLink>.
      </Text>
    </Layout>
  )
}
