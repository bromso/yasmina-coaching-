"use server"

import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  acceptInvitationCore,
  type CreateResult,
  createWorkspaceCore,
  type FormState,
  resendVerificationCore,
} from "@/lib/workspace-actions"

/**
 * The cores' api (the user's own client) and the request's language. A server action is a public
 * POST — check the session.
 */
async function deps() {
  const auth = getAuth()
  await auth.requireUser()
  const api = await auth.api()
  const locale = await auth.getLocale()
  return { auth, api, locale }
}

export async function createWorkspace(_prev: CreateResult, fd: FormData): Promise<CreateResult> {
  const { auth, api, locale } = await deps()
  const result = await createWorkspaceCore({ api, locale }, fd)
  if (!result.ok || !result.workspaceId) return result
  // The cookie first: redirect() throws, and /notes reads it to pick the new workspace.
  await auth.setCurrentWorkspace(result.workspaceId)
  redirect("/notes")
}

/** Accepts one of the invitations listed on this page, by id only. */
export async function acceptPending(_prev: CreateResult, fd: FormData): Promise<CreateResult> {
  const { auth, api, locale } = await deps()
  const byId = new FormData()
  const id = fd.get("id")
  byId.set("id", typeof id === "string" ? id : "")
  const result = await acceptInvitationCore({ api, locale }, byId)
  if (!result.ok || !result.workspaceId) return result
  await auth.setCurrentWorkspace(result.workspaceId)
  redirect("/notes")
}

/** Opens one of the user's workspaces listed on this page; an id they are no member of stays here. */
export async function openWorkspace(fd: FormData) {
  const auth = getAuth()
  await auth.requireUser()
  const id = Number(fd.get("workspaceId"))
  if (!Number.isInteger(id) || id <= 0) return
  if (await auth.setCurrentWorkspace(id)) redirect("/notes")
}

export async function resendVerification(_prev: FormState): Promise<FormState> {
  const { api, locale } = await deps()
  return resendVerificationCore({ api: api.account, locale })
}
