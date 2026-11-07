import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminUserView } from "@/views/admin-user-view"

export const metadata: Metadata = { title: "User · Admin" }

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,12}$/.test(id)) notFound()
  const auth = getAuth()
  const me = await auth.getMe()
  const [error, user] = await safe((await auth.api()).admin.users.get({ id: Number(id) }))
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminUserView user={user} isSelf={me?.user.id === user.id} />
}
