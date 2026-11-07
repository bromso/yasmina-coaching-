import type {
  Identity,
  Passkey,
  ProviderId,
  SessionSummary,
  TwoFactorStatus,
  User,
} from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { siteUrl } from "@repo/sites"
import { useTranslations } from "next-intl"
import { ConnectedAccounts } from "@/components/connected-accounts"
import { PasskeysCard } from "@/components/passkeys-card"
import { PasswordForm } from "@/components/password-form"
import { SessionsList } from "@/components/sessions-list"
import { SetPasswordForm } from "@/components/set-password-form"
import { SettingsCard } from "@/components/settings-card"
import { TwoFactorCard } from "@/components/two-factor-card"
import { PASSKEYS_HEADING_ID } from "@/lib/passkey"
import type { RequirementWarnings } from "@/lib/two-factor-requirement"

export function SecurityView({
  items,
  email,
  user,
  identities,
  providers,
  twoFactor,
  passkeys,
  isImpersonating,
  connectError,
  locale,
  warnings = { twoFactorOff: [], lastPasskey: [] },
}: {
  items: SessionSummary[]
  email: string
  user: User
  identities: Identity[]
  providers: ProviderId[]
  twoFactor: TwoFactorStatus
  passkeys: Passkey[]
  isImpersonating: boolean
  /** A failed connect, from the auth app's `?error=…&provider=…` redirect. */
  connectError?: string
  /** The page's language, for the dates in the lists (always printed in UTC). */
  locale: Locale
  /** Workspaces that turning two-step off, or removing the last passkey, would block this account
   * from — computed by `page.tsx` with `requirementWarnings`. */
  warnings?: RequirementWarnings
}) {
  const t = useTranslations("account.security")
  const securityUrl = `${siteUrl("account")}/security`

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro")}</p>
      </div>

      <SettingsCard
        title={t("password")}
        description={t(user.hasPassword ? "passwordDescription" : "passwordDescriptionNone")}
      >
        {user.hasPassword ? <PasswordForm email={email} /> : <SetPasswordForm email={email} />}
      </SettingsCard>

      <SettingsCard
        title={t("twoFactor")}
        description={
          // The card body says "Not available while impersonating." — once is enough.
          t(twoFactor.enabled ? "twoFactorOnDescription" : "twoFactorOffDescription")
        }
      >
        <TwoFactorCard
          enabled={twoFactor.enabled}
          recoveryCodesLeft={twoFactor.recoveryCodesLeft}
          isImpersonating={isImpersonating}
          emailVerified={user.emailVerified}
          hasPassword={user.hasPassword}
          requiredBy={warnings.twoFactorOff}
        />
      </SettingsCard>

      <SettingsCard
        title={t("passkeys")}
        titleId={PASSKEYS_HEADING_ID}
        description={t("passkeysDescription")}
      >
        <PasskeysCard
          passkeys={passkeys}
          hasPassword={user.hasPassword}
          isImpersonating={isImpersonating}
          locale={locale}
          requiredBy={warnings.lastPasskey}
        />
      </SettingsCard>

      <SettingsCard title={t("connected")} description={t("connectedDescription")}>
        <ConnectedAccounts
          providers={providers}
          identities={identities}
          hasPassword={user.hasPassword}
          hasPasskeys={passkeys.length > 0}
          authUrl={siteUrl("auth")}
          securityUrl={securityUrl}
          connectError={connectError}
          locale={locale}
        />
      </SettingsCard>

      <SettingsCard title={t("devices")} description={t("devicesDescription")}>
        <SessionsList items={items} locale={locale} />
      </SettingsCard>
    </div>
  )
}
