import type { AdminWorkspaceDetail } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { AuditTable } from "@/components/admin/audit-table"
import { formatDateTime } from "@/lib/admin"

export function AdminWorkspaceView({ workspace: w }: { workspace: AdminWorkspaceDetail }) {
  return (
    <>
      <h1 className="text-2xl font-semibold">{w.name}</h1>
      <AdminNav current="/admin/workspaces" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card size="compact">
          <CardHeader>
            <CardTitle>Workspace</CardTitle>
            <CardDescription className="font-mono text-xs">{w.slug}</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
              <dt className="text-muted-foreground">Plan</dt>
              <dd>{w.plan}</dd>
              <dt className="text-muted-foreground">Status</dt>
              <dd>{w.status ?? "—"}</dd>
              <dt className="text-muted-foreground">Members</dt>
              <dd>{w.memberCount}</dd>
              <dt className="text-muted-foreground">Created</dt>
              <dd>
                <time dateTime={w.createdAt}>{formatDateTime(w.createdAt)}</time>
              </dd>
            </dl>
          </CardContent>
        </Card>
        <Card size="compact">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
          </CardHeader>
          <CardContent>
            {w.billing ? (
              <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-6 gap-y-2 break-words text-sm">
                <dt className="text-muted-foreground">Provider</dt>
                <dd>{w.billing.provider}</dd>
                <dt className="text-muted-foreground">Subscription</dt>
                <dd className="font-mono text-xs">{w.billing.subscriptionId}</dd>
                <dt className="text-muted-foreground">Status</dt>
                <dd>{w.billing.status}</dd>
                <dt className="text-muted-foreground">Interval</dt>
                <dd>{w.billing.interval}</dd>
                <dt className="text-muted-foreground">Period ends</dt>
                <dd>
                  {w.billing.currentPeriodEnd ? formatDateTime(w.billing.currentPeriodEnd) : "—"}
                </dd>
              </dl>
            ) : (
              <p className="text-muted-foreground text-sm">No subscription mirrored.</p>
            )}
          </CardContent>
        </Card>
        <Card size="compact" className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Members</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {w.members.map((m) => (
                <li key={m.userId} className="flex items-center justify-between gap-3">
                  <Link
                    href={`/admin/users/${m.userId}`}
                    className="underline-offset-4 hover:underline"
                  >
                    {m.email}
                  </Link>
                  <span className="text-muted-foreground">{m.role}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <section aria-labelledby="ws-audit" className="grid grid-cols-1 gap-3">
        <h2 id="ws-audit" className="text-lg font-medium">
          Recent audit entries
        </h2>
        <AuditTable items={w.audit} caption={`Audit entries for ${w.name}`} />
        <Link
          href={`/admin/audit?targetType=workspace&targetId=${w.id}`}
          className="text-sm underline underline-offset-4"
        >
          All entries for this workspace
        </Link>
      </section>
    </>
  )
}
