import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { parseDays } from "@/lib/admin"
import { getAuth } from "@/lib/auth"
import { AdminAnalyticsView } from "@/views/admin-analytics-view"

export const metadata: Metadata = { title: "Analytics · Admin" }
type Search = Promise<Record<string, string | string[] | undefined>>

export default async function AnalyticsPage({ searchParams }: { searchParams: Search }) {
  const params = await searchParams
  const days = parseDays(params.days)
  const [error, summary] = await safe((await getAuth().api()).admin.analytics.summary({ days }))
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminAnalyticsView summary={summary} days={days} />
}
