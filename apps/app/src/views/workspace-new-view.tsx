import type { User, WorkspaceList } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"
import { openWorkspace } from "@/app/workspaces/new/actions"
import { PendingInvitations } from "@/components/pending-invitations"
import { VerifyEmailNotice } from "@/components/verify-email-notice"
import { WorkspaceForm } from "@/components/workspace-form"

type WorkspaceNewViewProps = {
  user: Pick<User, "email" | "emailVerified">
  list: Pick<WorkspaceList, "items" | "pendingInvitations">
  /** The page's language, for the invitations' dates (they render under a client component). */
  locale: Locale
}

/** The user's workspaces, each a one-click switch: plain forms, so they work without JS. */
function YourWorkspaces({ items }: Pick<WorkspaceList, "items">) {
  const t = useTranslations("app")
  return (
    <section aria-labelledby="your-workspaces" className="grid gap-4">
      <h2 id="your-workspaces" className="text-xl font-semibold tracking-tight">
        {t("workspaceNew.yours")}
      </h2>
      <ul className="grid gap-2">
        {items.map((workspace) => (
          <li key={workspace.id}>
            <form action={openWorkspace}>
              <input type="hidden" name="workspaceId" value={workspace.id} />
              <Button type="submit" variant="outline" className="w-full justify-between">
                <span>{workspace.name}</span>
                <span className="text-muted-foreground text-sm font-normal">
                  {t("role", { role: workspace.role })}
                </span>
              </Button>
            </form>
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * Onboarding: open a workspace you belong to, name a new one (verified email only), or join one
 * you were invited to.
 */
export function WorkspaceNewView({ user, list, locale }: WorkspaceNewViewProps) {
  const t = useTranslations("app.workspaceNew")
  const create = user.emailVerified ? <WorkspaceForm /> : <VerifyEmailNotice user={user} />
  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-8 px-6 py-16">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      {list.items.length > 0 ? (
        <>
          <YourWorkspaces items={list.items} />
          <section aria-labelledby="create-another" className="grid gap-4">
            <h2 id="create-another" className="text-xl font-semibold tracking-tight">
              {t("another")}
            </h2>
            {create}
          </section>
        </>
      ) : (
        create
      )}
      <PendingInvitations items={list.pendingInvitations} locale={locale} />
    </main>
  )
}
