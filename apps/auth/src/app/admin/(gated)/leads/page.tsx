import { ORPCError, safe } from "@orpc/client"
import type { AdminLeadStatusFilter } from "@repo/api-contract"
import { LEAD_STATUSES } from "@repo/api-contract/leads"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminLeadsView } from "@/views/admin-leads-view"

export const metadata: Metadata = { title: "Leads · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

const STATUS_FILTERS = [...LEAD_STATUSES, "all"] as const

/** `?status=` on the page: a real status, or anything else (missing, malformed) is `all`. */
function parseStatus(value: string | string[] | undefined): AdminLeadStatusFilter {
  const v = first(value)
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as AdminLeadStatusFilter)
    : "all"
}

export default async function LeadsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const status = parseStatus(params.status)
  const [error, page] = await safe(
    (await getAuth().api()).admin.leads.list({ status, cursor: parseCursor(params.cursor) })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return (
    <AdminLeadsView
      items={page.items}
      nextCursor={page.nextCursor}
      counts={page.counts}
      status={status}
      deleted={first(params.deleted) === "1"}
    />
  )
}
