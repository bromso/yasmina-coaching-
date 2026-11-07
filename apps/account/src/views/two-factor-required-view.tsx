import { TwoFactorRequiredNotice } from "@repo/ui/blocks/two-factor-required-notice"
import { Button } from "@repo/ui/components/button"
import { useTranslations } from "next-intl"
import { switchWorkspace } from "@/app/actions"
import { LeaveWorkspaceForm } from "@/components/leave-workspace-form"

type Workspace = { id: number; name: string }

type TwoFactorRequiredViewProps = {
  /** The current workspace, which requires two-step verification the user has not turned on. */
  workspace: Workspace
  /** The user's other workspaces, one **Switch to** form each. */
  others: Workspace[]
  /** This app's Security page, computed server-side. */
  setupUrl: string
  /** `${APP_URL}/workspaces/new`, offered when there is no other workspace to switch to. */
  newWorkspaceUrl: string
}

/**
 * `/workspace` and `/payments` for a member the current workspace blocks (it requires two-step
 * verification; they have neither it nor a passkey): the notice instead of the page, rendered
 * server-side and never a redirect. Switching uses the user menu's own `switchWorkspace` action,
 * leaving the Workspace page's `leave` — both exempt from the requirement on the api.
 */
export function TwoFactorRequiredView({
  workspace,
  others,
  setupUrl,
  newWorkspaceUrl,
}: TwoFactorRequiredViewProps) {
  const t = useTranslations("ui.twoFactorRequired")
  return (
    <TwoFactorRequiredNotice
      className="py-8"
      title={t("title")}
      body={t("body", { workspace: workspace.name })}
      setupHref={setupUrl}
      setupLabel={t("setup")}
      switchSlot={
        others.length > 0 ? (
          <>
            <p className="text-muted-foreground text-sm">{t("otherWorkspaces")}</p>
            <ul className="flex flex-wrap gap-2">
              {others.map((other) => (
                <li key={other.id} className="max-w-full">
                  <form action={switchWorkspace}>
                    <input type="hidden" name="workspaceId" value={other.id} />
                    <Button
                      type="submit"
                      variant="outline"
                      size="sm"
                      className="h-auto min-h-8 py-1.5 text-left whitespace-normal wrap-anywhere"
                    >
                      {t("switchTo", { workspace: other.name })}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm">
            <a className="underline underline-offset-4" href={newWorkspaceUrl}>
              {t("createWorkspace")}
            </a>
          </p>
        )
      }
      leaveSlot={
        <div className="grid gap-2">
          <p className="text-muted-foreground text-sm">{t("leaveHint")}</p>
          <LeaveWorkspaceForm
            workspaceId={workspace.id}
            label={t("leave", { workspace: workspace.name })}
            pendingLabel={t("leaving")}
          />
        </div>
      }
    />
  )
}
