import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminWorkspaceView } from "@/views/admin-workspace-view"

export const metadata: Metadata = { title: "Workspace · Admin" }

export default async function WorkspacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,12}$/.test(id)) notFound()
  const [error, workspace] = await safe(
    (await getAuth().api()).admin.workspaces.get({ id: Number(id) })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminWorkspaceView workspace={workspace} />
}
