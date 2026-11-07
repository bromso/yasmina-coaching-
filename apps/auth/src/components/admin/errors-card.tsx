import type { TelemetryErrors } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { formatDateTime } from "@/lib/admin"

const truncate = (s: string, n = 80) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function ErrorsCard({ errors }: { errors: TelemetryErrors | null }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Errors (24 h)</CardTitle>
        {errors && (
          <CardDescription>
            {errors.distinct} distinct · {errors.total} events
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>
        {errors === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Could not load errors.
          </p>
        ) : errors.top.length === 0 ? (
          <p className="text-muted-foreground text-sm">No errors in the last 24 hours.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">
                The five most frequent errors in the last 24 hours
              </caption>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Route</TableHead>
                  <TableHead className="text-right">Count</TableHead>
                  <TableHead>Last seen</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {errors.top.map((e) => (
                  <TableRow key={e.fingerprint}>
                    <TableCell>{e.app}</TableCell>
                    <TableCell className="font-mono text-xs">{e.kind}</TableCell>
                    <TableCell title={e.message}>{truncate(e.message)}</TableCell>
                    <TableCell className="font-mono text-xs">{e.route ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{e.count}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      <time dateTime={e.lastSeen}>{formatDateTime(e.lastSeen)}</time>
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
