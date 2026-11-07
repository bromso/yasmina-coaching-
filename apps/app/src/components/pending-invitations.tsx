"use client"

import type { PendingInvitation } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { FormMessage } from "@repo/ui/components/form-feedback"
import { useTranslations } from "next-intl"
import { useActionState } from "react"
import { acceptPending } from "@/app/workspaces/new/actions"
import type { CreateResult } from "@/lib/workspace-actions"

// The page's locale (passed down from the server view) and UTC, so the server render and the
// hydrated client agree on the date (see `@repo/i18n/dates`).
function InvitationRow({ invitation, locale }: { invitation: PendingInvitation; locale: Locale }) {
  const t = useTranslations("app")
  const [state, action, pending] = useActionState(acceptPending, { ok: false } as CreateResult)
  const { invitedBy, workspace, role, expiresAt } = invitation
  return (
    <li className="grid gap-3 rounded-lg border p-4">
      <div className="grid gap-1">
        <p id={`invitation-${invitation.id}-summary`}>
          {t("invitations.summary", {
            inviter: invitedBy.name || t("someone"),
            workspace: workspace.name,
            role: t("role", { role }),
          })}
        </p>
        <p className="text-muted-foreground text-sm">
          {t.rich("invitations.expires", {
            date: formatUtcDate(expiresAt, locale),
            time: (chunks) => <time dateTime={expiresAt}>{chunks}</time>,
          })}
        </p>
      </div>
      <form action={action} className="grid gap-3">
        <FormMessage state={state} />
        <input type="hidden" name="id" value={invitation.id} />
        <div>
          <Button
            type="submit"
            size="sm"
            disabled={pending}
            aria-describedby={`invitation-${invitation.id}-summary`}
          >
            {t(pending ? "invitations.accepting" : "invitations.accept")}
          </Button>
        </div>
      </form>
    </li>
  )
}

/** The signed-in user's open invitations, each with its own Accept; `locale` dates them. */
export function PendingInvitations({
  items,
  locale,
}: {
  items: PendingInvitation[]
  locale: Locale
}) {
  const t = useTranslations("app.invitations")
  if (items.length === 0) return null
  return (
    <section aria-labelledby="pending-invitations" className="grid gap-4">
      <h2 id="pending-invitations" className="text-xl font-semibold tracking-tight">
        {t("heading")}
      </h2>
      <ul className="grid gap-3">
        {items.map((invitation) => (
          <InvitationRow key={invitation.id} invitation={invitation} locale={locale} />
        ))}
      </ul>
    </section>
  )
}
