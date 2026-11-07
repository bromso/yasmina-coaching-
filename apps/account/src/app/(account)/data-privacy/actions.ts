"use server"

import { createLogger } from "@repo/log"
import { loadEnv } from "@repo/session"
import { revalidatePath } from "next/cache"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  cookieParts,
  type DeleteAccountState,
  deleteAccountCore,
  type FormState,
  requestExportCore,
  setConsentCore,
} from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { reauthHref } from "@/lib/reauth"

const logger = createLogger({ service: "account" })

/** Every action re-checks the session first, then answers in the request's language. */
async function privacyApi() {
  const auth = getAuth()
  await auth.requireUser()
  return { api: (await auth.api()).account, locale: await auth.getLocale() }
}

export async function requestExport(_prev: FormState, _fd: FormData): Promise<FormState> {
  const out = await requestExportCore(await privacyApi())
  if (out.ok) revalidatePath("/data-privacy")
  return out
}

/**
 * Writes the `consent` cookie the banner writes, on `COOKIE_DOMAIN`, `Secure` when the page was
 * served over https (the browser's `Origin`, as the banner reads `location.protocol`).
 */
export async function setConsent(_prev: FormState, fd: FormData): Promise<FormState> {
  const { locale } = await privacyApi()
  const { COOKIE_DOMAIN } = loadEnv(["COOKIE_DOMAIN"])
  const origin = (await headers()).get("origin") ?? ""
  const jar = await cookies()
  const out = await setConsentCore(
    {
      domain: COOKIE_DOMAIN,
      secure: origin.startsWith("https:"),
      locale,
      setCookie: (raw) => {
        const { name, value, options } = cookieParts(raw)
        jar.set(name, value, options)
      },
    },
    fd
  )
  // The layout reads the cookie too (the banner's `initial`), so the whole tree re-renders.
  if (out.ok) revalidatePath("/", "layout")
  return out
}

export async function deleteAccount(
  _prev: DeleteAccountState,
  fd: FormData
): Promise<DeleteAccountState> {
  const auth = getAuth()
  const { AUTH_URL } = loadEnv(["AUTH_URL"])
  return deleteAccountCore(
    {
      ...(await privacyApi()),
      reauthHref: reauthHref("/data-privacy"),
      authUrl: AUTH_URL,
      clearSession: async () => {
        await auth.clearSession()
        // The current-workspace cookie goes too, as on sign-out.
        await auth
          .clearCurrentWorkspace()
          .catch((error) => logger.error("clearCurrentWorkspace failed", { error }))
      },
      redirect,
    },
    fd
  )
}
