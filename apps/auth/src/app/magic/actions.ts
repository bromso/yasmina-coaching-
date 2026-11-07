"use server"

import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { consumeMagicLinkCore, type FormState } from "@/lib/actions"
import { getAuth } from "@/lib/auth"
import { TWO_FACTOR_COOKIE, twoFactorCookieAttributes } from "@/lib/two-factor"

export async function consumeMagicLink(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  const out = await consumeMagicLinkCore(
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
