import { rateVital, type TelemetryVitals } from "@repo/api-contract"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@repo/ui/components/table"
import { formatVital, ratingClass, ratingLabel, type VitalKey } from "@/lib/vitals"

function Cell({ name, value }: { name: VitalKey; value: number | null }) {
  if (value === null) return <TableCell>—</TableCell>
  const rating = rateVital(name, value)
  return (
    <TableCell className={ratingClass(rating)}>
      <span className="tabular-nums">{formatVital(name, value)}</span>{" "}
      <span className="text-xs">({ratingLabel(rating)})</span>
    </TableCell>
  )
}

export function VitalsCard({ vitals }: { vitals: TelemetryVitals | null }) {
  return (
    <Card size="compact">
      <CardHeader>
        <CardTitle>Web vitals (7 d)</CardTitle>
        <CardDescription>p75 per app · samples of LCP, INP and CLS</CardDescription>
      </CardHeader>
      <CardContent>
        {vitals === null ? (
          <p role="status" className="text-muted-foreground text-sm">
            Could not load web vitals.
          </p>
        ) : vitals.apps.length === 0 ? (
          <p className="text-muted-foreground text-sm">No vitals reported yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <caption className="sr-only">p75 web vitals per app over the last 7 days</caption>
              <TableHeader>
                <TableRow>
                  <TableHead>App</TableHead>
                  <TableHead className="text-right">Samples</TableHead>
                  <TableHead>LCP</TableHead>
                  <TableHead>INP</TableHead>
                  <TableHead>CLS</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vitals.apps.map((a) => (
                  <TableRow key={a.app}>
                    <TableCell>{a.app}</TableCell>
                    <TableCell className="text-right tabular-nums">{a.samples}</TableCell>
                    <Cell name="LCP" value={a.lcp} />
                    <Cell name="INP" value={a.inp} />
                    <Cell name="CLS" value={a.cls} />
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
