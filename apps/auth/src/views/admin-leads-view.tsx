import type { AdminLead, AdminLeadStatusFilter } from "@repo/api-contract"
import {
  LEAD_AUDIENCE_LABELS,
  LEAD_NEED_LABELS,
  LEAD_STATUS_LABELS,
  LEAD_STATUSES,
  LEAD_TIMELINE_LABELS,
  type LeadStatus,
} from "@repo/api-contract/leads"
import { Badge } from "@repo/ui/components/badge"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { Pager } from "@/components/admin/pager"
import { formatDateTime } from "@/lib/admin"

const statusHref = (status: AdminLeadStatusFilter) =>
  status === "all" ? "/admin/leads" : `/admin/leads?status=${status}`

/** `/admin/leads`: the pipeline, newest first, with a tab (and its count) per status. */
export function AdminLeadsView({
  items,
  nextCursor,
  counts,
  status,
}: {
  items: AdminLead[]
  nextCursor: number | null
  counts: Record<LeadStatus, number>
  status: AdminLeadStatusFilter
}) {
  const total = LEAD_STATUSES.reduce((sum, s) => sum + counts[s], 0)
  const tabs: { value: AdminLeadStatusFilter; label: string; count: number }[] = [
    { value: "all", label: "All", count: total },
    ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABELS[s], count: counts[s] })),
  ]
  return (
    <>
      <h1 className="text-2xl font-semibold">Leads</h1>
      <AdminNav current="/admin/leads" />
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b pb-3">
        {tabs.map((tab) => (
          <Link
            key={tab.value}
            href={statusHref(tab.value)}
            aria-current={tab.value === status ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted",
              tab.value === status && "bg-muted"
            )}
          >
            {tab.label} <span className="text-muted-foreground tabular-nums">({tab.count})</span>
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No leads match.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((lead) => (
            <li key={lead.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/admin/leads/${lead.id}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {lead.name}
                    {lead.organisation && (
                      <span className="text-muted-foreground"> · {lead.organisation}</span>
                    )}
                  </Link>
                  <span className="font-mono text-xs text-muted-foreground">{lead.reference}</span>
                  <Badge variant={lead.status === "new" ? "default" : "secondary"}>
                    {LEAD_STATUS_LABELS[lead.status]}
                  </Badge>
                </div>
                <time dateTime={lead.createdAt} className="text-muted-foreground text-xs">
                  {formatDateTime(lead.createdAt)}
                </time>
              </div>
              <p className="mt-2 text-sm">
                {LEAD_NEED_LABELS[lead.need]}
                <span className="text-muted-foreground">
                  {" "}
                  · {LEAD_TIMELINE_LABELS[lead.timeline]} · {LEAD_AUDIENCE_LABELS[lead.audience]}
                </span>
              </p>
            </li>
          ))}
        </ul>
      )}
      <Pager href="/admin/leads" nextCursor={nextCursor} params={{ status }} />
    </>
  )
}
