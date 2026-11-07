import { useTranslations } from "next-intl"
import { EmailConfirmForm } from "@/components/email-confirm-form"
import { SettingsCard } from "@/components/settings-card"

export function EmailConfirmView({ token }: { token: string }) {
  const t = useTranslations("account.emailConfirm")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
      </div>
      <SettingsCard>
        <EmailConfirmForm token={token} />
      </SettingsCard>
    </div>
  )
}
