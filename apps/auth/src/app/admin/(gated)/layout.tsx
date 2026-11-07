import { notFound } from "next/navigation"
import { connection } from "next/server"
import type { ReactNode } from "react"
import { canUseAdmin } from "@/lib/admin"
import { getAuth } from "@/lib/auth"

// Signed out → sign in; signed in but not a superadmin (or impersonating) → the app's 404, with a
// real 404 status: nothing under /admin exists for them. /admin/stop sits outside this group.
export default async function AdminLayout({ children }: { children: ReactNode }) {
  await connection()
  const auth = getAuth()
  await auth.requireUser()
  if (!canUseAdmin(await auth.getMe())) notFound()
  return (
    <main id="main" className="container mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8">
      {children}
    </main>
  )
}
