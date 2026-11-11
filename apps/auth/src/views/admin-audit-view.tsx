import type { AuditEntry, AuditRetention } from "@repo/api-contract"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardHeader, CardTitle } from "@repo/ui/components/card"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { NativeSelect } from "@repo/ui/components/native-select"
import { AdminNav } from "@/components/admin/admin-nav"
import { AuditTable } from "@/components/admin/audit-table"
import { Pager } from "@/components/admin/pager"
import { auditExportDateBounds, auditExportDefaultRange } from "@/lib/admin"
import { auditExportErrorMessage } from "@/lib/audit-export"

export type AuditFilters = { actorId?: string; targetType?: string; targetId?: string }

export function AdminAuditView({
  items,
  nextCursor,
  filters,
  retention,
  exportError,
  now = new Date(),
}: {
  items: AuditEntry[]
  nextCursor: number | null
  filters: AuditFilters
  /** `AUDIT_PII_RETENTION_DAYS` / `AUDIT_RETENTION_DAYS` as `admin.audit.list` reports them. */
  retention: AuditRetention
  /** `?exportError=<code>` from the export route's redirect; unknown codes show nothing. */
  exportError?: string
  /** The server's clock for the Export card's defaults and bounds (tests inject one). */
  now?: Date
}) {
  const { from, to } = auditExportDefaultRange(now)
  const bounds = auditExportDateBounds(now, retention.rowDays)
  const notice = auditExportErrorMessage(exportError)
  return (
    <>
      <h1 className="text-2xl font-semibold">Audit log</h1>
      <AdminNav current="/admin/audit" />
      <p className="text-muted-foreground text-sm">
        Network details (IP, browser) are kept {retention.piiDays} days; entries are kept{" "}
        {retention.rowDays} days.
      </p>
      <form
        action="/admin/audit"
        method="get"
        className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
      >
        <div className="grid gap-1.5">
          <Label htmlFor="actorId">Actor id</Label>
          <Input
            id="actorId"
            name="actorId"
            inputMode="numeric"
            defaultValue={filters.actorId ?? ""}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetType">Target type</Label>
          <Input
            id="targetType"
            name="targetType"
            defaultValue={filters.targetType ?? ""}
            placeholder="user, workspace, note…"
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="targetId">Target id</Label>
          <Input id="targetId" name="targetId" defaultValue={filters.targetId ?? ""} />
        </div>
        <Button type="submit" variant="outline">
          Filter
        </Button>
      </form>
      <Card size="compact">
        <CardHeader>
          <CardTitle>Export</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3">
          <p className="text-muted-foreground text-sm">Uses the filters above.</p>
          {notice ? (
            <Alert variant="destructive">
              <AlertDescription>{notice}</AlertDescription>
            </Alert>
          ) : null}
          {/* A plain POST form: the export works without JavaScript. */}
          <form
            method="post"
            action="/admin/audit/export"
            className="grid gap-3 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="export-from">From</Label>
              <Input
                id="export-from"
                name="from"
                type="date"
                min={bounds.min}
                max={bounds.max}
                defaultValue={from}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="export-to">To</Label>
              <Input
                id="export-to"
                name="to"
                type="date"
                min={bounds.min}
                max={bounds.max}
                defaultValue={to}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="export-format">Format</Label>
              <NativeSelect id="export-format" name="format" defaultValue="csv">
                <option value="csv">CSV</option>
                <option value="jsonl">JSON Lines</option>
              </NativeSelect>
            </div>
            <input type="hidden" name="actorId" value={filters.actorId ?? ""} />
            <input type="hidden" name="targetType" value={filters.targetType ?? ""} />
            <input type="hidden" name="targetId" value={filters.targetId ?? ""} />
            <Button type="submit" variant="outline">
              Export
            </Button>
          </form>
        </CardContent>
      </Card>
      <AuditTable items={items} caption="Audit log, newest first" />
      <Pager href="/admin/audit" nextCursor={nextCursor} params={filters} />
    </>
  )
}
