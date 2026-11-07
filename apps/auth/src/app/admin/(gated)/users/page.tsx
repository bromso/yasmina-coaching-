import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor, parseSuspended } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminUsersView } from "@/views/admin-users-view"

export const metadata: Metadata = { title: "Users · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function UsersPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const q = first(params.q)?.trim().slice(0, 100) || undefined
  const suspended = parseSuspended(params.suspended)
  const [error, page] = await safe(
    (await getAuth().api()).admin.users.list({
      q,
      cursor: parseCursor(params.cursor),
      suspended: suspended ? "true" : undefined,
    })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return (
    <AdminUsersView items={page.items} nextCursor={page.nextCursor} q={q} suspended={suspended} />
  )
}
