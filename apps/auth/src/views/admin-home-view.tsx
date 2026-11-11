import type { AdminJobs, AdminMetrics, TelemetryErrors, TelemetryVitals } from "@repo/api-contract"
import { Card, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { ErrorsCard } from "@/components/admin/errors-card"
import { JobsCard } from "@/components/admin/jobs-card"
import { VitalsCard } from "@/components/admin/vitals-card"

const Stat = ({ label, value, href }: { label: string; value: number | string; href?: string }) => (
  <Card size="compact" className="gap-1 py-4">
    <CardHeader className="px-4">
      <CardDescription>
        {href ? (
          <Link href={href} className="underline-offset-4 hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </CardDescription>
      <CardTitle className="text-2xl tabular-nums">{value}</CardTitle>
    </CardHeader>
  </Card>
)

export function AdminHomeView({
  metrics,
  errors,
  vitals,
  jobs,
}: {
  metrics: AdminMetrics
  /** null when the api could not be asked: the card says so instead of failing the page. */
  errors: TelemetryErrors | null
  vitals: TelemetryVitals | null
  jobs: AdminJobs | null
}) {
  const m = metrics
  return (
    <>
      <h1 className="text-2xl font-semibold">Admin</h1>
      <AdminNav current="/admin" />
      <section aria-labelledby="people" className="grid gap-3">
        <h2 id="people" className="text-lg font-medium">
          People
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Users" value={m.users} href="/admin/users" />
          <Stat label="Verified" value={m.verifiedUsers} />
          <Stat label="Sign-ups, 7 days" value={m.signUps7d} />
          <Stat label="Sign-ups, 30 days" value={m.signUps30d} />
          <Stat label="Active sessions" value={m.activeSessions} />
          <Stat label="Waitlist" value={m.waitlist} />
        </div>
      </section>
      <section aria-labelledby="workspaces" className="grid gap-3">
        <h2 id="workspaces" className="text-lg font-medium">
          Workspaces
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Workspaces" value={m.workspaces} href="/admin/workspaces" />
          <Stat label="Free" value={m.workspacesByPlan.free} />
          <Stat label="Pro" value={m.workspacesByPlan.pro} />
          <Stat label="Team" value={m.workspacesByPlan.team} />
          <Stat label="Past due" value={m.pastDueWorkspaces} />
          <Stat label="Pending invitations" value={m.pendingInvitations} />
        </div>
      </section>
      <section aria-labelledby="health" className="grid gap-3">
        <h2 id="health" className="text-lg font-medium">
          Health
        </h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ErrorsCard errors={errors} />
          <VitalsCard vitals={vitals} />
        </div>
      </section>
      <section aria-labelledby="jobs" className="grid gap-3">
        <h2 id="jobs" className="text-lg font-medium">
          Background jobs
        </h2>
        {jobs === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Could not load the job queue.
          </p>
        ) : (
          <JobsCard counts={jobs.counts} dead={jobs.dead} />
        )}
      </section>
    </>
  )
}
