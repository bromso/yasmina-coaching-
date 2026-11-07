import { ORPCError, safe } from "@orpc/client"
import { type AdminApplicationStatusFilter, APPLICATION_STATUSES } from "@repo/api-contract"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor, parseJob } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminApplicationsView } from "@/views/admin-applications-view"

export const metadata: Metadata = { title: "Job applications · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

const STATUS_FILTERS = [...APPLICATION_STATUSES, "all"] as const

/** `?status=` on the page: a real status, or anything else (missing, malformed) is `all`. */
function parseStatus(value: string | string[] | undefined): AdminApplicationStatusFilter {
  const v = first(value)
  return (STATUS_FILTERS as readonly string[]).includes(v ?? "")
    ? (v as AdminApplicationStatusFilter)
    : "all"
}

export default async function ApplicationsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const status = parseStatus(params.status)
  const job = parseJob(params.job)
  const [error, page] = await safe(
    (await getAuth().api()).admin.applications.list({
      status,
      job,
      cursor: parseCursor(params.cursor),
    })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return (
    <AdminApplicationsView
      items={page.items}
      nextCursor={page.nextCursor}
      status={status}
      job={job}
    />
  )
}
