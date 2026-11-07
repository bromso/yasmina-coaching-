"use server"

import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { getAuth } from "@/lib/auth"
import {
  type FormState,
  TWO_FACTOR_COOKIE,
  twoFactorCookieAttributes,
  verifyTwoFactorCore,
} from "@/lib/two-factor"

export async function verifyTwoFactor(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  const store = await cookies()
  const out = await verifyTwoFactorCore(
    {
      api: (await auth.anonymousApi({ ip: client.ip })).auth.twoFactor,
      setSession: auth.setSession,
      safeNextUrl: auth.safeNextUrl,
      client,
      locale: await auth.getLocale(),
      challenge: store.get(TWO_FACTOR_COOKIE)?.value ?? null,
      // Signing in over a live session ends that one api-side rather than orphaning it; the core
      // calls this only after the new session is issued, and logs a failure.
      endCurrentSession: async () => {
        if (store.get(SESSION_COOKIE)) await (await auth.api()).auth.signOut()
      },
    },
    fd
  )
  if ("redirectTo" in out) {
    // Every redirect out of here is terminal for the challenge: either it verified (consumed
    // api-side) or it is dead (expired, burnt, unknown). A wrong code (a plain field error) keeps
    // the cookie so a retry still targets the same challenge.
    store.set(TWO_FACTOR_COOKIE, "", {
      ...twoFactorCookieAttributes(process.env.NODE_ENV === "production"),
      maxAge: 0,
    })
    redirect(out.redirectTo)
  }
  return out
}
