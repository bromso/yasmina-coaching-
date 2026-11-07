"use server"

import { requestInfo } from "@repo/session"
import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { cancelEmailChangeCore, type EmailCancelState } from "@/lib/email-change"

/**
 * `/email/cancel`'s one action: anonymous, over `anonymousApi` like `/magic`'s — whoever holds
 * the account's old mailbox, signed in on this browser or not.
 */
export async function cancelEmailChange(
  _prev: EmailCancelState,
  fd: FormData
): Promise<EmailCancelState> {
  const auth = getAuth()
  const { ip } = requestInfo(await headers())
  return cancelEmailChangeCore(
    {
      api: (await auth.anonymousApi({ ip })).auth.emailChange,
      clearSession: auth.clearSession,
      locale: await auth.getLocale(),
    },
    fd
  )
}
