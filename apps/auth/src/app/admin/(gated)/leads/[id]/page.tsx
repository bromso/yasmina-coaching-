import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminLeadView } from "@/views/admin-lead-view"

export const metadata: Metadata = { title: "Lead · Admin" }

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!/^\d{1,12}$/.test(id)) notFound()
  const [error, lead] = await safe((await getAuth().api()).admin.leads.get({ id: Number(id) }))
  if (error) {
    if (error instanceof ORPCError && error.code === "NOT_FOUND") notFound()
    throw error
  }
  return <AdminLeadView lead={lead} />
}
