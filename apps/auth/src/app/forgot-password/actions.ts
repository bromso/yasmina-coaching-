"use server"

import { requestInfo } from "@repo/session"
import { headers } from "next/headers"
import { type FormState, forgotPasswordCore } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

/** Never redirects: the same "on its way" state whatever the api says. */
export async function forgotPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  return forgotPasswordCore(
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
