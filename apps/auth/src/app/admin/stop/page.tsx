import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { connection } from "next/server"
import { shouldStop } from "@/lib/admin-actions"
import { getAuth } from "@/lib/auth"
import { AdminStopView } from "@/views/admin-stop-view"

export const metadata: Metadata = { title: "Stop impersonating" }

// Reachable by anyone who is impersonating — it checks the session, not the superadmin flag. With
// the api unreachable (`me` null) a parked admin token still shows the Stop form, without details.
export default async function StopPage() {
  await connection()
  const auth = getAuth()
  const me = await auth.getMe()
  const parked = me ? null : await auth.readAdminSession()
  if (!shouldStop(me, parked)) redirect("/admin")
  const impersonation = me?.impersonation
  return (
    <AdminStopView
      details={me && impersonation ? { name: me.user.name || me.user.email, impersonation } : null}
    />
  )
}
