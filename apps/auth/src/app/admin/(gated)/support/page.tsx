import { ORPCError, safe } from "@orpc/client"
import type { AdminSupportStatusFilter } from "@repo/api-contract"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { first, parseCursor } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminSupportView } from "@/views/admin-support-view"

export const metadata: Metadata = { title: "Support requests · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

/** `?status=` on the page: `resolved` or `all`; anything else (missing, malformed) is `open`. */
function parseStatus(value: string | string[] | undefined): AdminSupportStatusFilter {
  const v = first(value)
  return v === "resolved" || v === "all" ? v : "open"
}

export default async function SupportPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const status = parseStatus(params.status)
  const [error, page] = await safe(
    (await getAuth().api()).admin.support.list({ status, cursor: parseCursor(params.cursor) })
  )
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminSupportView items={page.items} nextCursor={page.nextCursor} status={status} />
}
