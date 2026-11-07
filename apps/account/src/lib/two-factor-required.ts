import type { WorkspaceSummary } from "@repo/api-contract"
import { loadEnv } from "@repo/session"
import { siteUrl } from "@repo/sites"
import type { ComponentProps } from "react"
import type { TwoFactorRequiredView } from "@/views/two-factor-required-view"
import { getAuth } from "./auth"

/**
 * What `TwoFactorRequiredView` needs, server-side: the user's other workspaces (from the same
 * per-request `workspaces.list` `requireWorkspace()` already read — the one list call exempt from
 * the requirement), this app's Security page and the app's onboarding page. Never calls a
 * workspace-scoped procedure: the api would refuse it.
 */
export async function twoFactorRequiredProps(
  workspace: WorkspaceSummary
): Promise<ComponentProps<typeof TwoFactorRequiredView>> {
  const { items } = await getAuth().listWorkspaces()
  const { APP_URL } = loadEnv(["APP_URL"])
  return {
    workspace: { id: workspace.id, name: workspace.name },
    others: items.filter((w) => w.id !== workspace.id).map(({ id, name }) => ({ id, name })),
    setupUrl: `${siteUrl("account")}/security`,
    newWorkspaceUrl: `${APP_URL}/workspaces/new`,
  }
}
