import type { DataExport } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import type { Consent } from "@repo/ui/lib/consent"
import { useTranslations } from "next-intl"
import { ConsentForm, DeleteAccountForm, ExportForm } from "@/components/privacy-forms"
import { SettingsCard } from "@/components/settings-card"

export function DataPrivacyView({
  latestExport,
  consent,
  locale,
}: {
  latestExport: DataExport | null
  consent: Consent | null
  locale: Locale
}) {
  const t = useTranslations("account")
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">{t("dataPrivacy.title")}</h1>
        <p className="text-muted-foreground text-sm">{t("dataPrivacy.intro")}</p>
      </div>

      <SettingsCard title={t("privacy.yourData")}>
        <ExportForm latest={latestExport} locale={locale} />
      </SettingsCard>

      <SettingsCard title={t("privacy.cookies")}>
        <ConsentForm current={consent} />
      </SettingsCard>

      <SettingsCard title={t("privacy.deleteAccount")}>
        <DeleteAccountForm />
      </SettingsCard>
    </div>
  )
}
