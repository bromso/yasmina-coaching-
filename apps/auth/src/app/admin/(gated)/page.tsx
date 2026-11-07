import { ORPCError, safe } from "@orpc/client"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { getAuth } from "@/lib/auth"
import { AdminHomeView } from "@/views/admin-home-view"

export const metadata: Metadata = { title: "Admin" }

const isNotFound = (error: unknown) => error instanceof ORPCError && error.code === "NOT_FOUND"

function failAdminLoad(error: unknown): never {
  if (isNotFound(error)) notFound()
  throw error
}

/** The Health cards degrade on their own: a failure there renders a notice, never a 500 page. */
function healthOrNull<T>(error: unknown, value: T | undefined): T | null {
  if (!error) return value ?? null
  if (isNotFound(error)) notFound()
  return null
}

export default async function AdminPage() {
  const api = await getAuth().api()
  const [[metricsError, metrics], [errorsError, errors], [vitalsError, vitals], [jobsError, jobs]] =
    await Promise.all([
      safe(api.admin.metrics()),
      safe(api.admin.telemetry.errors()),
      safe(api.admin.telemetry.vitals()),
      safe(api.admin.jobs.list()),
    ])
  if (metricsError) failAdminLoad(metricsError)
  return (
    <AdminHomeView
      metrics={metrics}
      errors={healthOrNull(errorsError, errors)}
      vitals={healthOrNull(vitalsError, vitals)}
      jobs={healthOrNull(jobsError, jobs)}
    />
  )
}
