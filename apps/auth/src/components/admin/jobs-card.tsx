import type { AdminJob } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { DiscardJobForm } from "@/components/admin/discard-job-form"
import { RetryJobForm } from "@/components/admin/retry-job-form"
import { formatDateTime } from "@/lib/admin"

const truncate = (s: string, n = 200) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function JobsCard({
  counts,
  dead,
}: {
  counts: { queued: number; running: number; dead: number }
  dead: AdminJob[]
}) {
  return (
    <Card size="compact">
      <CardHeader>
        <CardTitle>Background jobs</CardTitle>
        <CardDescription>
          {counts.queued} queued · {counts.running} running · {counts.dead} dead
        </CardDescription>
      </CardHeader>
      <CardContent>
        {dead.length === 0 ? (
          <p className="text-muted-foreground text-sm">No dead jobs.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">The 20 most recently dead jobs</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead className="text-right">Attempts</TableHead>
                  <TableHead>Last error</TableHead>
                  <TableHead>Finished</TableHead>
                  <TableHead>
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dead.map((job) => (
                  <TableRow key={job.id}>
                    <TableCell className="font-mono text-xs">{job.name}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {job.attempts}/{job.maxAttempts}
                    </TableCell>
                    <TableCell title={job.lastError ?? undefined}>
                      {job.lastError ? truncate(job.lastError) : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {job.finishedAt ? (
                        <time dateTime={job.finishedAt}>{formatDateTime(job.finishedAt)}</time>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-start gap-2">
                        <RetryJobForm id={job.id} />
                        <DiscardJobForm id={job.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
