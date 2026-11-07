"use server"

import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import {
  type FormState,
  passkeyOptionsCore,
  passkeySignInCore,
  requestMagicLinkCore,
  signInCore,
} from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { TWO_FACTOR_COOKIE, twoFactorCookieAttributes } from "@/lib/two-factor"

export async function signIn(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  const out = await signInCore(
    {
      api: (await auth.anonymousApi({ ip: client.ip })).auth,
      setSession: auth.setSession,
      safeNextUrl: auth.safeNextUrl,
      client,
      locale: await auth.getLocale(),
      // Signing in over a live session ends that one api-side rather than orphaning it; the core
      // calls this only after the new session is issued, and logs a failure.
      endCurrentSession: async () => {
        if ((await cookies()).get(SESSION_COOKIE)) await (await auth.api()).auth.signOut()
      },
    },
    fd
  )
  if ("challenge" in out) {
    ;(await cookies()).set(
      TWO_FACTOR_COOKIE,
      out.challenge,
      twoFactorCookieAttributes(process.env.NODE_ENV === "production")
    )
    redirect(`/login/verify?next=${encodeURIComponent(out.next)}`)
  }
  if ("redirectTo" in out) redirect(out.redirectTo)
  return out
}

/** The passkey button's first step: WebAuthn request options plus an opaque challenge id, for
 * `startAuthentication` to run in the browser. No form, no `next` — just data for the client. */
export async function passkeyOptions() {
  const auth = getAuth()
  const client = requestInfo(await headers())
  return passkeyOptionsCore({
    api: (await auth.anonymousApi({ ip: client.ip })).auth,
    locale: await auth.getLocale(),
  })
}

/** The passkey button's second step, once the browser has a signed assertion. Never a two-factor
 * challenge — a passkey counts as both factors — so unlike `signIn` there is only one outcome.
 * Returns `{ redirectTo }` as data rather than calling `redirect()`: this action is invoked
 * directly from client code, not from a `<form action>` submission, so the component itself does
 * the navigation once the cookie this call set has reached the browser. */
export async function passkeySignIn(
  _prev: FormState,
  fd: FormData
): Promise<FormState | { redirectTo: string }> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  return passkeySignInCore(
    {
      api: (await auth.anonymousApi({ ip: client.ip })).auth,
      setSession: auth.setSession,
      safeNextUrl: auth.safeNextUrl,
      client,
      locale: await auth.getLocale(),
      // Signing in over a live session ends that one api-side rather than orphaning it; the core
      // calls this only after the new session is issued, and logs a failure.
      endCurrentSession: async () => {
        if ((await cookies()).get(SESSION_COOKIE)) await (await auth.api()).auth.signOut()
      },
    },
    fd
  )
}

/** Never redirects: the same "check your inbox" state whatever the api says. */
export async function requestMagicLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  return requestMagicLinkCore(
    {
      api: (await auth.anonymousApi({ ip: client.ip })).auth,
      setSession: auth.setSession,
      safeNextUrl: auth.safeNextUrl,
      client,
      locale: await auth.getLocale(),
    },
    fd
  )
}
