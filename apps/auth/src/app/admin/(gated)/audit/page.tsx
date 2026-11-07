import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminAuditView } from "@/views/admin-audit-view"

export const metadata: Metadata = { title: "Audit log · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function AuditPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const actorId = parseCursor(params.actorId)
  const targetType = first(params.targetType)?.trim().slice(0, 50) || undefined
  const targetId = first(params.targetId)?.trim().slice(0, 100) || undefined
  const [error, page] = await safe(
    (await getAuth().api()).admin.audit.list({
      actorId,
      targetType,
      targetId,
      cursor: parseCursor(params.cursor),
    })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return (
    <AdminAuditView
      items={page.items}
      nextCursor={page.nextCursor}
      filters={{ actorId: actorId ? String(actorId) : undefined, targetType, targetId }}
      retention={page.retention}
      exportError={first(params.exportError)}
    />
  )
}
