import type { User, WorkspaceList, WorkspaceSummary } from "@repo/api-contract"

export const WORKSPACE_COOKIE = "workspace"
export const WORKSPACE_MAX_AGE_SECONDS = 365 * 24 * 3600

/** The one definition of the current-workspace cookie: the workspace id, re-checked on every read. */
export function workspaceCookieOptions({
  domain,
  production,
}: {
  domain: string
  production: boolean
}) {
  return {
    name: WORKSPACE_COOKIE,
    httpOnly: true,
    path: "/",
    sameSite: "lax" as const,
    secure: production,
    domain,
    maxAge: WORKSPACE_MAX_AGE_SECONDS,
  }
}

/** A positive integer id, or null — a sibling subdomain can set this cookie, so it is only a hint. */
export function readWorkspaceId(value: string | undefined | null): number | null {
  if (!value || !/^\d{1,12}$/.test(value)) return null
  const id = Number(value)
  return id > 0 ? id : null
}

/**
 * The workspace id from a raw `Cookie` header, for code that holds a `Request` rather than
 * Next's `cookies()`. Mirrors `readSessionCookie`: the last `workspace=` wins, a malformed value
 * reads as none, and it never throws.
 */
export function readWorkspaceCookie(cookieHeader: string | null): number | null {
  if (!cookieHeader) return null
  const prefix = `${WORKSPACE_COOKIE}=`
  const raw = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .filter((part) => part.startsWith(prefix))
    .at(-1)
    ?.slice(prefix.length)
  if (!raw) return null
  try {
    return readWorkspaceId(decodeURIComponent(raw))
  } catch {
    return null
  }
}

/** The one selection rule: the wanted workspace if a member of it, else the only one, else null. */
export function pickWorkspace(
  list: WorkspaceList,
  wantedId: number | null
): WorkspaceSummary | null {
  const chosen = wantedId === null ? undefined : list.items.find((w) => w.id === wantedId)
  if (chosen) return chosen
  return list.items.length === 1 ? (list.items[0] ?? null) : null
}

/**
 * Whether `workspace` blocks `user`: it requires two-step verification and the user has turned on
 * neither it nor a passkey (`User.twoFactorSatisfied`). The api refuses every workspace-scoped
 * call then, so a page checks this before fetching and renders the two-step notice instead.
 */
export function blockedByTwoFactor(
  workspace: Pick<WorkspaceSummary, "requireTwoFactor">,
  user: Pick<User, "twoFactorSatisfied">
): boolean {
  return workspace.requireTwoFactor && !user.twoFactorSatisfied
}
