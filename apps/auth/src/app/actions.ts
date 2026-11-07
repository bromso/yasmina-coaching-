"use server"

import { isLocale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { loadEnv, SESSION_COOKIE } from "@repo/session"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { localeReturnPath } from "@/lib/locale"

const logger = createLogger({ service: "auth" })

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
  redirect("/login?signedout=1")
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
 * The language switcher's action: saves the submitted `locale` (to the profile when signed in,
 * then the cookie) and goes back to the page it was posted from — this origin only, else `/`. A
 * choice that cannot be saved comes back with `?locale_error=1`, which the layout explains.
 */
export async function setLocale(formData: FormData) {
  const locale = formData.get("locale")
  const { AUTH_URL } = loadEnv(["AUTH_URL"])
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
  redirect(localeReturnPath(referer, AUTH_URL, { failed }))
}
