"use server"

import { requestInfo } from "@repo/session"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { type FormState, resetPasswordCore } from "@/lib/actions"
import { getAuth } from "@/lib/auth"

export async function resetPassword(_prev: FormState, fd: FormData): Promise<FormState> {
  const auth = getAuth()
  const client = requestInfo(await headers())
  const out = await resetPasswordCore(
    {
      api: (await auth.anonymousApi({ ip: client.ip })).auth,
      setSession: auth.setSession,
      safeNextUrl: auth.safeNextUrl,
      client,
      locale: await auth.getLocale(),
    },
    fd
  )
  if ("redirectTo" in out) redirect(out.redirectTo)
  return out
}
