import { Hero } from "@repo/ui/blocks/hero"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"
import { useTranslations } from "next-intl"

export function HomeView() {
  const t = useTranslations("app.home")
  return (
    <main id="main">
      <Hero
        eyebrow={t("eyebrow")}
        title={t("title")}
        description={t("description")}
        actions={
          <>
            <Button asChild>
              <Link href="/notes">{t("notes")}</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/chat">{t("chat")}</Link>
            </Button>
          </>
        }
      />
    </main>
  )
}
