import type { EmailChangePending, User } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { BRAND_NAME } from "@repo/sites"
import { initialsOf } from "@repo/ui/lib/initials"
import { useTranslations } from "next-intl"
import { removeAvatar, setAvatar } from "@/app/(account)/personal-info/actions"
import { EmailChangeCard } from "@/components/email-change-card"
import { ImageUploadCard } from "@/components/image-upload-card"
import { LanguageForm } from "@/components/language-form"
import { NameForm } from "@/components/name-form"
import { ProfileBadge } from "@/components/profile-badge"
import { SettingsCard } from "@/components/settings-card"
import { VerifyEmailNotice } from "@/components/verify-email-notice"
import { LOCALE_OPTIONS } from "@/lib/locale"

export function PersonalInfoView({
  user,
  locale,
  pending,
  twoFactorEnabled,
  isImpersonating,
}: {
  user: User
  locale: Locale
  /** The account's pending email change, if any — from `account.email.get`. */
  pending: EmailChangePending | null
  /** Whether the Email address card's form needs a current authenticator or recovery code. */
  twoFactorEnabled: boolean
  isImpersonating: boolean
}) {
  const t = useTranslations("account.personalInfo")
  const tl = useTranslations("account.language")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-muted-foreground text-sm">{t("intro", { brand: BRAND_NAME })}</p>
      </div>

      <SettingsCard title={t("profilePhoto")}>
        <ImageUploadCard
          kind="avatar"
          url={user.avatarUrl}
          fallback={initialsOf(user)}
          setAction={setAvatar}
          removeAction={removeAvatar}
        />
      </SettingsCard>

      <SettingsCard
        title={t("basicInfo")}
        description={t("basicInfoDescription", { brand: BRAND_NAME })}
      >
        <div className="flex items-center gap-4 px-6 py-4">
          <ProfileBadge
            name={user.name || user.email}
            initials={initialsOf(user)}
            className="size-12"
            fallbackClassName="text-base"
          />
          <span className="text-muted-foreground text-sm">{t("initialsNote")}</span>
        </div>
        <NameForm user={user} />
      </SettingsCard>

      <SettingsCard title={tl("title")} description={tl("description", { brand: BRAND_NAME })}>
        <LanguageForm current={locale} options={LOCALE_OPTIONS} />
      </SettingsCard>

      <SettingsCard title={t("emailAddress")}>
        <EmailChangeCard
          email={user.email}
          emailVerified={user.emailVerified}
          pending={pending}
          hasPassword={user.hasPassword}
          twoFactorEnabled={twoFactorEnabled}
          isImpersonating={isImpersonating}
          locale={locale}
        />
        {!user.emailVerified && (
          <div className="px-6 pb-6">
            <VerifyEmailNotice user={user} />
          </div>
        )}
      </SettingsCard>
    </div>
  )
}
