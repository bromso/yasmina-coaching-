"use server"

import { isLocale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { SESSION_COOKIE } from "@repo/session"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { loadEnv } from "@/lib/env"
import { appTranslator } from "@/lib/i18n"
import { localeReturnPath } from "@/lib/locale"
import { type FormState, leaveWorkspaceCore } from "@/lib/workspace-actions"

const logger = createLogger({ service: "app" })

/** Ends this session everywhere our subdomains share the cookie; errors never block the sign-out. */
export async function signOut() {
  const auth = getAuth()
  // No cookie (e.g. already signed out in another tab): nothing to end api-side.
  if ((await cookies()).get(SESSION_COOKIE)) {
    await (await auth.api()).auth
      .signOut()
      .catch((error) => logger.error("signOut failed", { error }))
  }
  await auth.clearSession()
  // The current-workspace cookie goes too, so the next account on this browser starts clean.
  await auth
    .clearCurrentWorkspace()
    .catch((error) => logger.error("clearCurrentWorkspace failed", { error }))
  const { AUTH_URL } = loadEnv(["AUTH_URL"])
  redirect(`${AUTH_URL}/login?signedout=1`)
}

/** Makes the submitted workspace current; an id the user is no member of is ignored. */
export async function switchWorkspace(formData: FormData) {
  const auth = getAuth()
  await auth.requireUser()
  const id = Number(formData.get("workspaceId"))
  if (Number.isInteger(id) && id > 0) await auth.setCurrentWorkspace(id)
  revalidatePath("/", "layout")
}

/**
 * The two-step notice's **Leave**: leaves the current workspace — the one the server resolves,
 * never one the form names (that must only match it, else the user switched in another tab) —
 * then forgets it and sends the user to pick or make another. A refusal (the last owner) is the
 * form's message.
 */
export async function leaveWorkspace(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const { workspace } = await auth.requireWorkspace()
  const locale = await auth.getLocale()
  if (Number(fd.get("workspaceId")) !== workspace.id) {
    return { ok: false, message: appTranslator(locale)("notes.switched") }
  }
  const out = await leaveWorkspaceCore({ api: (await auth.api()).workspaces, locale }, workspace.id)
  if (!out.ok) return out
  await auth.clearCurrentWorkspace()
  revalidatePath("/", "layout")
  redirect("/workspaces/new")
}

/**
 * The language switcher's action: saves the submitted `locale` (to the profile when signed in,
 * then the cookie) and goes back to the page it was posted from — this origin only, else `/`. A
 * choice that cannot be saved comes back with `?locale_error=1`, which the layout explains.
 */
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale")
  const { APP_URL } = loadEnv(["APP_URL"])
  const referer = (await headers()).get("referer")
  let failed = false
  try {
    if (!isLocale(locale)) throw new Error(`unsupported locale ${String(locale)}`)
    await getAuth().setLocale(locale)
  } catch (error) {
    logger.error("setLocale failed", { error })
    failed = true
  }
  // The whole tree, root layout included (`<html lang>`, the header), renders in the new language.
  if (!failed) revalidatePath("/", "layout")
  // Outside the try: redirect() throws to do its work.
  redirect(localeReturnPath(referer, APP_URL, { failed }))
}

/**
 * The deletion banner's **Cancel deletion**: cancels the scheduled deletion, then re-renders
 * every page without the banner. A refusal (an impersonation session) or an outage is logged and
 * leaves the banner up.
 */
export async function cancelDeletion() {
  const auth = getAuth()
  await auth.requireUser()
  try {
    await (await auth.api()).account.cancelDeletion()
  } catch (error) {
    logger.error("cancelDeletion failed", { error })
    return
  }
  revalidatePath("/", "layout")
}
