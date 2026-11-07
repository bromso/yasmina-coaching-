"use server"

import { redirect } from "next/navigation"
import { shouldStop, stopImpersonationCore } from "@/lib/admin-actions"
import { getAuth } from "@/lib/auth"

/**
 * Anyone impersonating may stop; the api refuses every other session with NOT_FOUND. A failed `me`
 * lookup with a parked admin token still stops: an outage must not leave the browser signed in as
 * the user.
 */
export async function stopImpersonation() {
  const auth = getAuth()
  const me = await auth.getMe()
  const parked = me ? null : await auth.readAdminSession()
  if (!shouldStop(me, parked)) redirect("/admin")
  const out = await stopImpersonationCore({
    api: (await auth.api()).admin,
    endImpersonation: auth.endImpersonation,
    impersonatedUserId: me?.user.id ?? null,
  })
  redirect(out.redirectTo)
}
