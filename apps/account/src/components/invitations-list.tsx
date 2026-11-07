"use client"

import type { Invitation } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { revokeInvitation } from "@/app/(account)/workspace/actions"
import type { FormState } from "@/lib/actions"

export function InvitationsList({
  items,
  workspaceId,
  locale,
  outside = [],
}: {
  items: Invitation[]
  workspaceId: number
  /** The page's language: the expiry dates print in it, in UTC (server and hydration agree). */
  locale: Locale
  /** Ids of the invitations whose address the workspace's allowed domains no longer admit
   * (computed on the server); each gets an "Outside allowed domains" badge. */
  outside?: number[]
}) {
  const t = useTranslations("account.invitations")
  const tRoles = useTranslations("account.roles")
  const [state, action, pending] = useActionState(revokeInvitation, { ok: false } as FormState)

  return (
    <>
      {/* Always mounted, so the live regions inside it exist before a message arrives. */}
      <div className={state.message ? "grid gap-2 px-6 py-4" : undefined}>
        <FormMessage state={state} />
      </div>
      {items.length === 0 ? (
        <p className="text-muted-foreground px-6 py-4 text-sm">{t("none")}</p>
      ) : (
        <ul className="flex flex-col divide-y">
          {items.map((invitation) => {
            const emailId = `invitation-${invitation.id}-email`
            return (
              <li key={invitation.id} className="flex items-center gap-4 px-6 py-3 text-sm">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                    <span id={emailId} className="truncate font-medium">
                      {invitation.email}
                    </span>
                    {outside.includes(invitation.id) && (
                      <Badge variant="outline">{t("outside")}</Badge>
                    )}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {t("details", {
                      role: tRoles(invitation.role),
                      inviter: invitation.invitedBy.name || t("someone"),
                      date: formatUtcDate(invitation.expiresAt, locale),
                    })}
                  </span>
                </div>
                <form action={action}>
                  <input type="hidden" name="workspaceId" value={workspaceId} />
                  <input type="hidden" name="invitationId" value={invitation.id} />
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    aria-describedby={emailId}
                  >
                    {t("revoke")}
                  </Button>
                </form>
              </li>
            )
          })}
        </ul>
      )}
    </>
  )
}
