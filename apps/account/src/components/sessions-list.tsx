"use client"

import type { SessionSummary } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { Icon } from "@repo/ui/components/icon"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { revokeOtherSessions, revokeSession } from "@/app/(account)/security/actions"
import type { FormState } from "@/lib/actions"

/** `locale` is the page's, and the zone UTC (see `@repo/i18n/dates`), so the server render and
 * hydration print the same date. */
export function SessionsList({ items, locale }: { items: SessionSummary[]; locale: Locale }) {
  const t = useTranslations("account.sessions")
  const [revoked, revoke, revoking] = useActionState(revokeSession, { ok: false } as FormState)
  const [others, revokeOthers, revokingOthers] = useActionState(revokeOtherSessions, {
    ok: false,
  } as FormState)
  const busy = revoking || revokingOthers

  return (
    <>
      {/* Always mounted, so the live regions inside it exist before a message arrives. */}
      <div className={revoked.message || others.message ? "grid gap-2 px-6 py-4" : undefined}>
        <FormMessage state={revoked} />
        <FormMessage state={others} />
      </div>
      <ul className="flex flex-col divide-y">
        {items.map((session) => (
          <li key={session.id} className="flex items-center gap-4 px-6 py-3 text-sm">
            <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-full">
              <Icon icon="lucide:monitor-smartphone" className="size-4.5" aria-hidden />
            </span>
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="flex min-w-0 items-center gap-2">
                <span
                  id={`session-${session.id}-device`}
                  className="truncate font-medium"
                  title={session.userAgent ?? undefined}
                >
                  {session.userAgent || t("unknownDevice")}
                </span>
                {session.current && <Badge variant="secondary">{t("thisDevice")}</Badge>}
              </span>
              <span className="text-muted-foreground text-xs">
                {t("seen", {
                  signedIn: formatUtcDate(session.createdAt, locale),
                  lastSeen: formatUtcDate(session.lastSeenAt, locale),
                })}
              </span>
            </div>
            {!session.current && (
              <form action={revoke}>
                <input type="hidden" name="sessionId" value={session.id} />
                <Button
                  type="submit"
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  aria-describedby={`session-${session.id}-device`}
                >
                  {t("signOut")}
                </Button>
              </form>
            )}
          </li>
        ))}
      </ul>
      <form action={revokeOthers} className="border-t px-6 py-4">
        <Button type="submit" variant="outline" disabled={busy || items.length <= 1}>
          {t(revokingOthers ? "signingOut" : "signOutOthers")}
        </Button>
      </form>
    </>
  )
}
