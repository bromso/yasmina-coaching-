"use server"

import { requestInfo } from "@repo/session"
import { headers } from "next/headers"
import { getAuth } from "@/lib/auth"
import { type EmailRevertState, revertEmailChangeCore } from "@/lib/email-change"

/**
 * `/email/revert`'s one action: anonymous, over `anonymousApi` like `/email/cancel`'s.
 */
export async function revertEmailChange(
  _prev: EmailRevertState,
  fd: FormData
): Promise<EmailRevertState> {
  const auth = getAuth()
  const { ip } = requestInfo(await headers())
  return revertEmailChangeCore(
    {
      api: (await auth.anonymousApi({ ip })).auth.emailChange,
      clearSession: auth.clearSession,
      locale: await auth.getLocale(),
    },
    fd
  )
}
