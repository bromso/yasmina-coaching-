import { describe, expect, test } from "bun:test"
import type { AuditRetention } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"
import { AdminAuditView } from "./admin-audit-view"

const retention: AuditRetention = { piiDays: 90, rowDays: 365 }

describe("AdminAuditView", () => {
  test("the limits line reads the retention prop", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).toContain(
      "Network details (IP, browser) are kept 90 days; entries are kept 365 days."
    )
  })

  test("a different retention renders its own numbers", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={{ piiDays: 30, rowDays: 180 }}
      />
    )
    expect(html).toContain(
      "Network details (IP, browser) are kept 30 days; entries are kept 180 days."
    )
  })

  test("the Export card posts to /admin/audit/export with From, To and Format fields", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).toContain('action="/admin/audit/export"')
    expect(html).toContain('method="post"')
    expect(html).toContain(">From<")
    expect(html).toContain(">To<")
    expect(html).toContain(">Format<")
    expect(html).toContain(">Export<")
    expect(html).toContain(">CSV</option>")
    expect(html).toContain('<option value="jsonl">JSON Lines</option>')
  })

  test("From/To default to the last 30 UTC days", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).toMatch(/name="from"[^>]*value="\d{4}-\d{2}-\d{2}"/)
    expect(html).toMatch(/name="to"[^>]*value="\d{4}-\d{2}-\d{2}"/)
  })

  test("the current actorId/targetType/targetId filters ride along as hidden fields", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{ actorId: "12", targetType: "workspace", targetId: "3" }}
        retention={retention}
      />
    )
    expect(html).toContain('<input type="hidden" name="actorId" value="12"')
    expect(html).toContain('<input type="hidden" name="targetType" value="workspace"')
    expect(html).toContain('<input type="hidden" name="targetId" value="3"')
  })

  test("no current filters: the hidden fields are still present, empty", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).toContain('<input type="hidden" name="actorId" value=""')
    expect(html).toContain('<input type="hidden" name="targetType" value=""')
    expect(html).toContain('<input type="hidden" name="targetId" value=""')
  })

  test("no exportError: no notice is shown", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).not.toContain('role="alert"')
  })

  test("exportError=bad_request shows the contract's date-range message", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="bad_request"
      />
    )
    expect(html).toContain('role="alert"')
    expect(html).toContain(
      "from and to must be valid YYYY-MM-DD dates, from on or before to, at most 366 days apart, and to no later than tomorrow (UTC)."
    )
  })

  test("exportError=conflict shows the contract's default cap message", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="conflict"
      />
    )
    expect(html).toContain("Narrow the date range: more than 100 000 entries match.")
  })

  test("exportError=too_many_requests shows the rate-limit message", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="too_many_requests"
      />
    )
    expect(html).toContain("Too many exports, try again later")
  })

  test("an unknown exportError shows no notice", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="nope"
      />
    )
    expect(html).not.toContain('role="alert"')
  })

  test("exportError=unavailable shows the outage message", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="unavailable"
      />
    )
    expect(html).toContain("The export is unavailable right now. Try again shortly.")
  })

  test("the notice and the Export card sit above the table, so a refused export is seen at once", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        exportError="conflict"
      />
    )
    const notice = html.indexOf('role="alert"')
    const card = html.indexOf(">Export<")
    // The list (a table, or its empty state) comes after both.
    const table = html.search(/<table|No audit entries yet/)
    expect(notice).toBeGreaterThan(-1)
    expect(table).toBeGreaterThan(-1)
    expect(notice).toBeLessThan(table)
    expect(card).toBeLessThan(table)
  })

  test("the Export card says it uses the filters above", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView items={[]} nextCursor={null} filters={{}} retention={retention} />
    )
    expect(html).toContain("Uses the filters above.")
  })

  test("From/To carry the server-computed min (oldest kept entry) and max (tomorrow, UTC)", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{}}
        retention={retention}
        now={new Date("2026-10-18T13:00:00.000Z")}
      />
    )
    expect(html).toMatch(/id="export-from" min="2025-10-18" max="2026-10-19"/)
    expect(html).toMatch(/id="export-to" min="2025-10-18" max="2026-10-19"/)
    expect(html).toMatch(/name="from"[^>]*value="2026-09-19"/)
    expect(html).toMatch(/name="to"[^>]*value="2026-10-18"/)
  })

  test("every label on the page is unique", () => {
    const html = renderToStaticMarkup(
      <AdminAuditView
        items={[]}
        nextCursor={null}
        filters={{ actorId: "12", targetType: "workspace", targetId: "3" }}
        retention={retention}
      />
    )
    const labels = [...html.matchAll(/<label[^>]*>([^<]*)<\/label>/g)].map((m) => m[1])
    expect(labels.length).toBeGreaterThan(0)
    expect(new Set(labels).size).toBe(labels.length)
  })
})
