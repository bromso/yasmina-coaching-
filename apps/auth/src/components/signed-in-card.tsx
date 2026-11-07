import type { User } from "@repo/session"
import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { useTranslations } from "next-intl"
import { signOut } from "@/app/actions"

/** Shown on /login to a visitor who already has a session and no destination. */
export function SignedInCard({ user, continueHref }: { user: User; continueHref: string }) {
  const t = useTranslations("auth.signedIn")
  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <CardDescription>{t("who", { name: user.name, email: user.email })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <Button asChild className="w-full">
          <a href={continueHref}>{t("continue")}</a>
        </Button>
        <form action={signOut}>
          <Button type="submit" variant="outline" className="w-full">
            {t("signOut")}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
