"use server"

import { loadEnv } from "@repo/session"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { getFormatter } from "next-intl/server"
import type { FormState } from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { conjunction } from "@/lib/invite-domains"
import {
  type CreateApiKeyState,
  type CreateWebhookState,
  createApiKeyCore,
  createWebhookCore,
  deleteWebhookCore,
  deleteWorkspaceCore,
  inviteCore,
  leaveCore,
  type RotateWebhookSecretState,
  removeLogoCore,
  removeMemberCore,
  renameWorkspaceCore,
  revokeApiKeyCore,
  revokeInvitationCore,
  rotateWebhookSecretCore,
  sameWorkspace,
  setInviteDomainsCore,
  setLogoCore,
  setRoleCore,
  setWorkspaceSecurityCore,
  switchedMessage,
  type TestWebhookState,
  testWebhookCore,
  transferOwnershipCore,
  type UpdateWebhookState,
  updateWebhookCore,
  type WorkspaceFormState,
  type WorkspaceSecurityState,
} from "@/lib/workspace-actions"

/**
 * Every action resolves the current workspace first: a server action is a public endpoint of its
 * own, and the workspace it acts on is the one the server resolved, never one named by the form.
 * The form's own `workspaceId` only has to match it (see `sameWorkspace`), or the action refuses.
 * Every message is in the request's language.
 */
async function workspaceDeps() {
  const auth = getAuth()
  const { workspace } = await auth.requireWorkspace()
  const api = (await auth.api()).workspaces
  const locale = await auth.getLocale()
  return {
    auth,
    workspace,
    switched: switchedMessage(locale),
    deps: { api, workspaceId: workspace.id, locale },
  }
}

function revalidateOnSuccess(out: FormState, layout = false) {
  if (out.ok) {
    revalidatePath("/workspace")
    // The header's workspace switcher shows the name and the role.
    if (layout) revalidatePath("/", "layout")
  }
  return out
}

/** The caller is no longer in this workspace: forget it and send them to pick or make another. */
async function goneFromWorkspace(auth: ReturnType<typeof getAuth>): Promise<never> {
  await auth.clearCurrentWorkspace()
  revalidatePath("/", "layout")
  redirect(`${loadEnv(["APP_URL"]).APP_URL}/workspaces/new`)
}

export async function renameWorkspace(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) {
    return { ok: false, message: switched, values: { name: String(fd.get("name") ?? "") } }
  }
  return revalidateOnSuccess(await renameWorkspaceCore(deps, fd), true)
}

export async function setLogo(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  // The logo shows in the shared layout (workspace switcher), so every page under it is refreshed.
  return revalidateOnSuccess(await setLogoCore(deps, fd), true)
}

export async function removeLogo(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await removeLogoCore(deps, fd), true)
}

export async function invite(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) {
    const values = { email: String(fd.get("email") ?? ""), role: String(fd.get("role") ?? "") }
    return { ok: false, message: switched, values }
  }
  return revalidateOnSuccess(await inviteCore(deps, fd))
}

export async function revokeInvitation(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await revokeInvitationCore(deps, fd))
}

export async function setRole(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await setRoleCore(deps, fd), true)
}

export async function removeMember(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await removeMemberCore(deps, fd))
}

export async function transferOwnership(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await transferOwnershipCore(deps, fd), true)
}

export async function leave(_prev: FormState, fd: FormData): Promise<WorkspaceFormState> {
  const { auth, workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  const out = await leaveCore(deps)
  if (out.ok) await goneFromWorkspace(auth)
  return out
}

export async function deleteWorkspace(_prev: FormState, fd: FormData): Promise<WorkspaceFormState> {
  const { auth, workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  const out = await deleteWorkspaceCore({ ...deps, workspaceName: workspace.name }, fd)
  if (out.ok) await goneFromWorkspace(auth)
  return out
}

/**
 * Creates a workspace API key: the full key rides back in this response only (never a redirect,
 * a cookie, or anything a later `revalidatePath` could re-expose) — the card holds it in memory
 * until its show-once panel is dismissed or the page reloads. The list underneath is still
 * revalidated, so the new key's summary (name, prefix, never the secret) appears right away.
 */
export async function createApiKey(
  _prev: CreateApiKeyState,
  fd: FormData
): Promise<CreateApiKeyState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) {
    const values = {
      name: String(fd.get("name") ?? ""),
      scopes: fd.getAll("scopes").map(String),
      expiresInDays: String(fd.get("expiresInDays") ?? ""),
    }
    return { ok: false, message: switched, values }
  }
  const out = await createApiKeyCore(deps, fd)
  if (out.ok) revalidatePath("/workspace")
  return out
}

export async function revokeApiKey(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await revokeApiKeyCore(deps, fd))
}

/**
 * Creates a workspace webhook endpoint: the signing secret rides back in this response only
 * (never a redirect, a cookie, or anything a later `revalidatePath` could re-expose) — the card
 * holds it in memory until its show-once panel is dismissed or the page reloads.
 */
export async function createWebhook(
  _prev: CreateWebhookState,
  fd: FormData
): Promise<CreateWebhookState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) {
    const values = {
      url: String(fd.get("url") ?? ""),
      description: String(fd.get("description") ?? ""),
      events: fd.getAll("events").map(String),
    }
    return { ok: false, message: switched, values }
  }
  const out = await createWebhookCore(deps, fd)
  if (out.ok) revalidatePath("/workspace")
  return out
}

export async function updateWebhook(
  _prev: UpdateWebhookState,
  fd: FormData
): Promise<UpdateWebhookState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) {
    const values = {
      url: String(fd.get("url") ?? ""),
      description: String(fd.get("description") ?? ""),
      events: fd.getAll("events").map(String),
      enabled: fd.get("enabled") === "on",
    }
    return { ok: false, message: switched, values }
  }
  const out = await updateWebhookCore(deps, fd)
  if (out.ok) revalidatePath("/workspace")
  return out
}

/** The new secret rides back in this response only, shown once, like `createWebhook`'s. */
export async function rotateWebhookSecret(
  _prev: RotateWebhookSecretState,
  fd: FormData
): Promise<RotateWebhookSecretState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return rotateWebhookSecretCore(deps, fd)
}

export async function testWebhook(
  _prev: TestWebhookState,
  fd: FormData
): Promise<TestWebhookState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return testWebhookCore(deps, fd)
}

export async function deleteWebhook(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  return revalidateOnSuccess(await deleteWebhookCore(deps, fd))
}

/** The Security card: require (or stop requiring) two-step verification of every member. A
 * confirmation round trip changes nothing, so only an applied change revalidates. */
export async function setWorkspaceSecurity(
  _prev: WorkspaceSecurityState,
  fd: FormData
): Promise<WorkspaceSecurityState> {
  const { workspace, switched, deps } = await workspaceDeps()
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched }
  const out = await setWorkspaceSecurityCore(deps, fd)
  // Every page under the layout reads the workspace summary, `requireTwoFactor` included.
  if (out.ok) revalidatePath("/", "layout")
  return out
}

/** The Security card's allowed invitation domains (owner only). The page re-reads the list, the
 * invite form's hint and the pending invitations' badges, so a saved change revalidates it. */
export async function setInviteDomains(_prev: FormState, fd: FormData): Promise<FormState> {
  const { workspace, switched, deps } = await workspaceDeps()
  const values = { domains: String(fd.get("domains") ?? "") }
  if (!sameWorkspace(fd, workspace.id)) return { ok: false, message: switched, values }
  const formatList = conjunction(await getFormatter())
  return revalidateOnSuccess(await setInviteDomainsCore({ ...deps, formatList }, fd))
}
