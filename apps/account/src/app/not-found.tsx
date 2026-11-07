import { StatusPage } from "@repo/ui/blocks/status-page"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"
import { getTranslations } from "next-intl/server"

export default async function NotFound() {
  const t = await getTranslations("account.status")
  return (
    <StatusPage code="404" title={t("notFoundTitle")} description={t("notFoundDescription")}>
      <Button asChild size="lg">
        <Link href="/">{t("backHome")}</Link>
      </Button>
    </StatusPage>
  )
}
