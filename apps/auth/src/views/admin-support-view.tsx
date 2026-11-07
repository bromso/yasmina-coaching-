import type { AdminSupportStatusFilter, SupportRequest } from "@repo/api-contract"
import { Badge } from "@repo/ui/components/badge"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { Pager } from "@/components/admin/pager"
import { ReopenSupportForm } from "@/components/admin/reopen-support-form"
import { ResolveSupportForm } from "@/components/admin/resolve-support-form"
import { formatDateTime } from "@/lib/admin"

const STATUS_TABS: { value: AdminSupportStatusFilter; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "resolved", label: "Resolved" },
  { value: "all", label: "All" },
]

export function AdminSupportView({
  items,
  nextCursor,
  status,
}: {
  items: SupportRequest[]
  nextCursor: number | null
  status: AdminSupportStatusFilter
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Support requests</h1>
      <AdminNav current="/admin/support" />
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b pb-3">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={tab.value === "open" ? "/admin/support" : `/admin/support?status=${tab.value}`}
            aria-current={tab.value === status ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted",
              tab.value === status && "bg-muted"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No support requests.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((r) => (
            <li key={r.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{r.reference}</span>
                  <Badge variant={r.status === "open" ? "default" : "secondary"}>{r.status}</Badge>
                </div>
                <time dateTime={r.createdAt} className="text-muted-foreground text-xs">
                  {formatDateTime(r.createdAt)}
                </time>
              </div>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">From</dt>
                  <dd>{r.name ? `${r.name} <${r.email}>` : r.email}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Topic</dt>
                  <dd className="capitalize">{r.topic}</dd>
                </div>
                {r.page && (
                  <div>
                    <dt className="text-muted-foreground">Page</dt>
                    <dd>{r.page}</dd>
                  </div>
                )}
                {r.userId && (
                  <div>
                    <dt className="text-muted-foreground">Signed in as</dt>
                    <dd>
                      <Link
                        href={`/admin/users/${r.userId}`}
                        className="underline-offset-4 hover:underline"
                      >
                        User #{r.userId}
                      </Link>
                    </dd>
                  </div>
                )}
              </dl>
              <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                {r.message}
              </pre>
              {r.status === "resolved" && r.resolvedBy && (
                <p className="mt-2 text-muted-foreground text-xs">
                  Resolved by {r.resolvedBy.email}
                  {r.resolvedAt && (
                    <>
                      {" "}
                      on <time dateTime={r.resolvedAt}>{formatDateTime(r.resolvedAt)}</time>
                    </>
                  )}
                </p>
              )}
              <div className="mt-3">
                {r.status === "open" ? (
                  <ResolveSupportForm id={r.id} />
                ) : (
                  <ReopenSupportForm id={r.id} />
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager href="/admin/support" nextCursor={nextCursor} params={{ status }} />
    </>
  )
}
