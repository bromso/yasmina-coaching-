"use server"

import { requestInfo, SESSION_COOKIE } from "@repo/session"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { type FormState, signUpCore } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

export async function signUp(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  const out = await signUpCore(
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
  if ("redirectTo" in out) redirect(out.redirectTo)
  return out
}
