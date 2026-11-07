import { Button } from "@repo/ui/components/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card"
import type { Metadata } from "next"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AuthLayout } from "@/components/auth-layout"
import { ResetPasswordView } from "@/views/reset-password-view"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("auth.pages")
  return { title: t("resetPassword") }
}

type Search = Promise<Record<string, string | string[] | undefined>>
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

export default async function ResetPasswordPage({ searchParams }: { searchParams: Search }) {
  const token = first((await searchParams).token)
  if (token) return <ResetPasswordView token={token} />
  const t = await getTranslations("auth.resetPassword")
  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-xl">{t("incompleteTitle")}</CardTitle>
          <CardDescription>{t("incompleteDescription")}</CardDescription>
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            <Link href="/forgot-password">{t("requestNewLink")}</Link>
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
