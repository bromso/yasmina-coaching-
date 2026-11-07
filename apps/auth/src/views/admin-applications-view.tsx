import type { AdminApplication, AdminApplicationStatusFilter } from "@repo/api-contract"
import { Badge } from "@repo/ui/components/badge"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { cn } from "@repo/ui/lib/utils"
import Link from "next/link"
import { AdminNav } from "@/components/admin/admin-nav"
import { ApplicationStatusForm } from "@/components/admin/application-status-form"
import { DeleteApplicationForm } from "@/components/admin/delete-application-form"
import { Pager } from "@/components/admin/pager"
import { formatDateTime } from "@/lib/admin"

const STATUS_TABS: { value: AdminApplicationStatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "reviewing", label: "Reviewing" },
  { value: "rejected", label: "Rejected" },
  { value: "hired", label: "Hired" },
]

/** `/admin/applications`, carrying `job` along whenever a status tab is picked. */
function statusHref(status: AdminApplicationStatusFilter, job: string | undefined) {
  const params = new URLSearchParams()
  if (status !== "all") params.set("status", status)
  if (job) params.set("job", job)
  const qs = params.toString()
  return qs ? `/admin/applications?${qs}` : "/admin/applications"
}

export function AdminApplicationsView({
  items,
  nextCursor,
  status,
  job,
}: {
  items: AdminApplication[]
  nextCursor: number | null
  status: AdminApplicationStatusFilter
  job?: string
}) {
  return (
    <>
      <h1 className="text-2xl font-semibold">Job applications</h1>
      <AdminNav current="/admin/applications" />
      <nav aria-label="Status" className="flex flex-wrap gap-1 border-b pb-3">
        {STATUS_TABS.map((tab) => (
          <Link
            key={tab.value}
            href={statusHref(tab.value, job)}
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
      {/* A GET form: the filter lives in the URL, so it is a link and works without JS. */}
      <form action="/admin/applications" method="get" className="flex items-end gap-2">
        {status !== "all" && <input type="hidden" name="status" value={status} />}
        <div className="grid gap-1.5">
          <Label htmlFor="job">Role</Label>
          <Input
            id="job"
            name="job"
            type="text"
            defaultValue={job ?? ""}
            placeholder="Role slug, e.g. senior-engineer"
            maxLength={100}
          />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
        {job && (
          <Button asChild variant="ghost">
            <Link href={statusHref(status, undefined)}>Clear</Link>
          </Button>
        )}
      </form>
      {items.length === 0 ? (
        <p className="text-muted-foreground text-sm">No applications match.</p>
      ) : (
        <ul className="flex flex-col gap-4">
          {items.map((a) => (
            <li key={a.id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{a.reference}</span>
                  <Badge variant={a.status === "new" ? "default" : "secondary"}>{a.status}</Badge>
                </div>
                <time dateTime={a.createdAt} className="text-muted-foreground text-xs">
                  {formatDateTime(a.createdAt)}
                </time>
              </div>
              <dl className="mt-2 grid gap-1 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">From</dt>
                  <dd>
                    {a.name} &lt;{a.email}&gt;
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Role</dt>
                  <dd>
                    {a.job.title}{" "}
                    <span className="font-mono text-xs text-muted-foreground">({a.job.slug})</span>
                  </dd>
                </div>
                {a.link?.startsWith("https://") && (
                  <div>
                    <dt className="text-muted-foreground">Link</dt>
                    <dd>
                      <a
                        href={a.link}
                        target="_blank"
                        rel="noopener noreferrer nofollow"
                        className="break-all underline-offset-4 hover:underline"
                      >
                        {a.link}
                      </a>
                    </dd>
                  </div>
                )}
              </dl>
              {a.note && (
                <pre className="mt-3 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">
                  {a.note}
                </pre>
              )}
              {a.statusChangedBy && (
                <p className="mt-2 text-muted-foreground text-xs">
                  Status set by {a.statusChangedBy.email}
                  {a.statusChangedAt && (
                    <>
                      {" "}
                      on{" "}
                      <time dateTime={a.statusChangedAt}>{formatDateTime(a.statusChangedAt)}</time>
                    </>
                  )}
                </p>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <ApplicationStatusForm id={a.id} status={a.status} />
                <Button asChild size="sm" variant="outline">
                  <a href={`/admin/applications/${a.id}/cv`}>Download CV</a>
                </Button>
                <DeleteApplicationForm id={a.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
      <Pager href="/admin/applications" nextCursor={nextCursor} params={{ status, job }} />
    </>
  )
}
