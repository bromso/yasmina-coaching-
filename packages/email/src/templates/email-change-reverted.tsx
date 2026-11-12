import { Text } from "@react-email/components"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import { translatorFor } from "@repo/i18n/translate"
import { EmailHeading, greeting, Layout } from "./layout"

export type EmailChangeRevertedProps = {
  name?: string
  /** Whether the account had a password: only then does a separate `resetPassword` mail follow
   * (whoever changed the email may have known it), since a passwordless account has none to
   * replace. */
  hasPassword?: boolean
  /** How many passkeys the undo removed (every one the account had). */
  passkeysRemoved?: number
  /** How many sign-in providers connected since the change the undo disconnected. */
  identitiesRemoved?: number
  /** Two-step verification was turned on since the change, and the undo turned it off. */
  twoFactorDisabled?: boolean
  /** An account deletion requested since the change, cancelled by the undo. */
  deletionCancelled?: boolean
  brand?: string
  locale?: Locale
}

export const emailChangeRevertedSubject = "Your email change was undone"

/**
 * Sent to the restored address once `auth.emailChange.revert` completes: every session ended, and
 * a line for each other thing the undo rolled back (passkeys, sign-in providers connected since
 * the change, two-step turned on since, a deletion requested since), then a line asking the owner
 * to review their sign-in providers and two-step verification. Carries no link of its own —
 * the password-reset link (when the account had one) arrives as its own `resetPassword` mail.
 */
export function EmailChangeReverted({
  name,
  hasPassword = false,
  passkeysRemoved = 0,
  identitiesRemoved = 0,
  twoFactorDisabled = false,
  deletionCancelled = false,
  brand,
  locale = DEFAULT_LOCALE,
}: EmailChangeRevertedProps) {
  const t = translatorFor(locale, "email")
  return (
    <Layout preview={t("emailChangeReverted.preview")} brand={brand} locale={locale}>
      <EmailHeading as="h1">{t("emailChangeReverted.heading")}</EmailHeading>
      <Text>{greeting(t, name)}</Text>
      <Text>{t("emailChangeReverted.body")}</Text>
      {passkeysRemoved > 0 ? (
        <Text>{t("emailChangeReverted.passkeys", { count: passkeysRemoved })}</Text>
      ) : null}
      {identitiesRemoved > 0 ? (
        <Text>{t("emailChangeReverted.identities", { count: identitiesRemoved })}</Text>
      ) : null}
      {twoFactorDisabled ? <Text>{t("emailChangeReverted.twoFactor")}</Text> : null}
      {deletionCancelled ? <Text>{t("emailChangeReverted.deletion")}</Text> : null}
      {hasPassword ? <Text>{t("emailChangeReverted.passwordNotice")}</Text> : null}
      <Text>{t("emailChangeReverted.review")}</Text>
      <Text>{t("emailChangeReverted.support")}</Text>
      <Text>{t("emailChangeReverted.footer")}</Text>
    </Layout>
  )
}
