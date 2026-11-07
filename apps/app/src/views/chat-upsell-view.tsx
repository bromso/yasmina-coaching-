import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"

/** /chat for a workspace whose plan lacks chat: what it takes, and where to upgrade. */
export function ChatUpsellView({ plansUrl }: { plansUrl: string }) {
  const t = useTranslations("app.upsell")
  return (
    <main id="main">
      <StatusPage title={t("title")} description={t("description")}>
        <Button asChild size="lg">
          <a href={plansUrl}>{t("plans")}</a>
        </Button>
      </StatusPage>
    </main>
  )
}
