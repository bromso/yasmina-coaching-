import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminWorkspacesView } from "@/views/admin-workspaces-view"

export const metadata: Metadata = { title: "Workspaces · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function WorkspacesPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const q = first(params.q)?.trim().slice(0, 100) || undefined
  const [error, page] = await safe(
    (await getAuth().api()).admin.workspaces.list({
      q,
      cursor: parseCursor(params.cursor),
    })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminWorkspacesView items={page.items} nextCursor={page.nextCursor} q={q} />
}
