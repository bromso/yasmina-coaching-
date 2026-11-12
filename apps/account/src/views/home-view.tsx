import type { User } from "@repo/api-contract"
import { BRAND_NAME } from "@repo/sites"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Icon } from "@repo/ui/components/icon"
import { initialsOf } from "@repo/ui/lib/initials"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { ProfileBadge } from "@/components/profile-badge"
import { VerifyEmailNotice } from "@/components/verify-email-notice"

/** `key` names the card's title and description under `account.home` (`<key>Title`, …). */
const OVERVIEW_CARDS = [
  { key: "privacy", href: "/data-privacy" },
  { key: "security", href: "/security" },
  { key: "personalInfo", href: "/personal-info" },
  { key: "payments", href: "/payments" },
] as const

export function HomeView({ user }: { user: User }) {
  const t = useTranslations("account.home")
  const displayName = user.name || user.email
  return (
    <div className="flex flex-col items-center gap-10">
      <div className="flex flex-col items-center gap-4 pt-4 text-center">
        <ProfileBadge
          name={displayName}
          initials={initialsOf(user)}
          className="size-20"
          fallbackClassName="text-2xl"
        />
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("welcome", { name: displayName })}
          </h1>
          <p className="text-muted-foreground text-sm">{t("intro", { brand: BRAND_NAME })}</p>
        </div>
      </div>

      <VerifyEmailNotice user={user} />

      <div className="grid w-full gap-4 lg:grid-cols-2">
        {OVERVIEW_CARDS.map((card) => (
          <Link
            key={card.href}
            href={card.href}
            className="group focus-visible:ring-ring/50 rounded-4xl outline-none focus-visible:ring-[3px]"
          >
            <Card className="hover:bg-muted/50 h-full gap-4 transition-colors">
              <CardHeader className="gap-2">
                <CardTitle className="text-base">{t(`${card.key}Title`)}</CardTitle>
                <CardDescription className="line-clamp-2">
                  {t(`${card.key}Description`)}
                </CardDescription>
              </CardHeader>
              <CardFooter className="mt-auto">
                <span className="text-primary flex items-center gap-1.5 text-sm font-medium">
                  {t("review")}
                  <Icon
                    icon="lucide:arrow-right"
                    className="transition-transform group-hover:translate-x-0.5"
                    aria-hidden
                  />
                </span>
              </CardFooter>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}
