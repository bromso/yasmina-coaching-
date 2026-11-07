import { Heading, Link, Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { greeting, Layout } from "./layout"

export type PasskeysRemovedProps = {
  name?: string
  /** The account's security page. */
  accountUrl: string
  /** Whether the account has a password: only then does the mail reassure that it was not
   * changed (a passwordless account has none to change). */
  hasPassword?: boolean
  brand?: string
  locale?: Locale
}

export const passkeysRemovedSubject = "Your passkeys were removed"

/**
 * Sent after `admin.users.removePasskeys`: every passkey on the account is gone and its sessions
 * are ended, mirroring `TwoFactorReset`'s admin-initiated wording rather than `PasskeyRemoved`'s
 * self-service one (the two end differently: this one also signs the account out everywhere).
 */
export function PasskeysRemoved({
  name,
  accountUrl,
  hasPassword = false,
  brand,
  locale = DEFAULT_LOCALE,
}: PasskeysRemovedProps) {
  const t = translatorFor(locale, "email")
  const security = `${accountUrl}/security`
  return (
    <Layout preview={t("passkeysRemoved.preview")} brand={brand} locale={locale}>
      <Heading as="h1">{t("passkeysRemoved.heading")}</Heading>
      <Text>{greeting(t, name)}</Text>
      <Text>
        {t("passkeysRemoved.body")}
        {hasPassword ? ` ${t("passkeysRemoved.passwordUnchanged")}` : null}
      </Text>
      <Text>
        {t("passkeysRemoved.footer")}
        <Link href={security}>{security}</Link>.
      </Text>
    </Layout>
  )
}
