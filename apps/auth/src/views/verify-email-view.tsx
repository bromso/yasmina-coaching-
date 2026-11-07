import { siteUrl } from "@repo/sites"
import { Button } from "@repo/ui/components/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { AuthLayout } from "@/components/auth-layout"
import type { VerifyEmailState } from "@/lib/verify-email"

export function VerifyEmailView({
  result,
  signedIn,
  appUrl,
}: {
  result: VerifyEmailState
  signedIn: boolean
  appUrl: string
}) {
  const accountInfo = `${siteUrl("account")}/personal-info`
  const t = useTranslations("auth.verifyEmail")
  return (
    <AuthLayout>
      <Card>
        <CardHeader className="text-center">
          {result === "verified" ? (
            <>
              <CardTitle className="text-xl">{t("verifiedTitle")}</CardTitle>
              <CardDescription>{t("verifiedDescription")}</CardDescription>
            </>
          ) : result === "already-verified" ? (
            <>
              <CardTitle className="text-xl">{t("alreadyTitle")}</CardTitle>
              <CardDescription>{t("alreadyDescription")}</CardDescription>
            </>
          ) : (
            <>
              <CardTitle className="text-xl">{t("invalidTitle")}</CardTitle>
              <CardDescription>{t("invalidDescription")}</CardDescription>
            </>
          )}
        </CardHeader>
        <CardFooter>
          <Button asChild className="w-full">
            {result === "verified" ? (
              signedIn ? (
                <a href={appUrl}>{t("openApp")}</a>
              ) : (
                <Link href="/login">{t("signIn")}</Link>
              )
            ) : result === "already-verified" ? (
              <a href={appUrl}>{t("openApp")}</a>
            ) : (
              <Link href={`/login?next=${encodeURIComponent(accountInfo)}`}>
                {t("signInRequestNew")}
              </Link>
            )}
          </Button>
        </CardFooter>
      </Card>
    </AuthLayout>
  )
}
