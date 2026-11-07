import { Button } from "@repo/ui/components/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthLayout } from "@/components/auth-layout"
import { isPlausibleToken } from "@/lib/verify-email"
import { MagicView } from "@/views/magic-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("magic") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

// The link alone never signs anyone in: a mail scanner that prefetches it must not consume a
// one-time token before the user clicks. This page only checks the token's shape; Continue is the
// one api call (via consumeMagicLink), so no api call happens on this GET.
export default async function MagicPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const token = first(params.token) ?? ""
  const next = first(params.next)
  if (!isPlausibleToken(token)) {
    const t = await getTranslations("auth")
    return (
      <AuthLayout>
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-xl">{t("magic.expiredTitle")}</CardTitle>
            <CardDescription>{t("magic.expiredDescription")}</CardDescription>
          </CardHeader>
          <CardFooter>
            <Button asChild className="w-full">
              <Link href="/login">{t("common.requestNewOne")}</Link>
            </Button>
          </CardFooter>
        </Card>
      </AuthLayout>
    )
  }
  return <MagicView token={token} next={next} />
}
