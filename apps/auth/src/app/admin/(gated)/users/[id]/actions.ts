"use server"

import { loadEnv, requestInfo } from "@repo/session"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { notFound, redirect } from "next/navigation"
import { canUseAdmin } from "@/lib/admin"
import {
  type FormState,
  impersonateCore,
  removePasskeysCore,
  resetTwoFactorCore,
  revokeSessionsCore,
  suspendUserCore,
  unsuspendUserCore,
} from "@/lib/admin-actions"
import { getAuth } from "@/lib/auth"

/** The same gate as the pages: anyone else gets the 404 the pages give. */
async function requireAdmin() {
  const auth = getAuth()
  await auth.requireUser()
  if (!canUseAdmin(await auth.getMe())) notFound()
  return auth
}

export async function impersonate(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const { APP_URL } = loadEnv(["APP_URL"])
  const out = await impersonateCore(
    {
      api: (await auth.api()).admin,
      startImpersonation: auth.startImpersonation,
      appUrl: APP_URL,
      client: requestInfo(await headers()),
    },
    fd
  )
  if ("redirectTo" in out) redirect(out.redirectTo)
  return out
}

export async function revokeSessions(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  return revokeSessionsCore({ api: (await auth.api()).admin }, fd)
}

export async function resetTwoFactor(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await resetTwoFactorCore({ api: (await auth.api()).admin }, fd)
  // So the card's "has 2FA" gate (and the rest of the page) reflects the reset immediately,
  // instead of only after the next unrelated navigation.
  if (out.ok) {
    const userId = fd.get("userId")
    if (typeof userId === "string" && userId) revalidatePath(`/admin/users/${userId}`)
  }
  return out
}

export async function removePasskeys(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const out = await removePasskeysCore({ api: (await auth.api()).admin }, fd)
  // So the card's passkey count (and the rest of the page) reflects the removal immediately,
  // instead of only after the next unrelated navigation.
  if (out.ok) {
    const userId = fd.get("userId")
    if (typeof userId === "string" && userId) revalidatePath(`/admin/users/${userId}`)
  }
  return out
}

/**
 * One action for the Suspension card's suspend and lift forms, chosen by the hidden `intent`
 * field: the card keeps a single `useActionState`, so the confirmation survives the swap from one
 * form to the other that the revalidation below causes.
 */
export async function changeSuspension(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = await requireAdmin()
  const api = { api: (await auth.api()).admin }
  const out =
    fd.get("intent") === "unsuspend"
      ? await unsuspendUserCore(api, fd)
      : await suspendUserCore(api, fd)
  if (out.ok) {
    const userId = fd.get("userId")
    if (typeof userId === "string" && userId) revalidatePath(`/admin/users/${userId}`)
  }
  return out
}
