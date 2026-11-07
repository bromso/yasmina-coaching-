"use server"

import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { acceptInvitationCore, type CreateResult } from "@/lib/workspace-actions"

/** Accepts the invitation link's token; a mismatch or unverified email renders in place. */
export async function acceptInvitation(_prev: CreateResult, fd: FormData): Promise<CreateResult> {
  const auth = getAuth()
  await auth.requireUser()
  const byToken = new FormData()
  const token = fd.get("token")
  byToken.set("token", typeof token === "string" ? token : "")
  const deps = { api: await auth.api(), locale: await auth.getLocale() }
  const result = await acceptInvitationCore(deps, byToken)
  if (!result.ok || !result.workspaceId) return result
  // The cookie first: redirect() throws, and /notes reads it to pick the joined workspace.
  await auth.setCurrentWorkspace(result.workspaceId)
  redirect("/notes")
}
