import { describe, expect, mock, test } from "bun:test"
import type { AdminLead } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"

// The update form imports its server action, which reaches @repo/session: `server-only` throws
// outside a react-server bundle, so stub it before the dynamic imports below.
mock.module("server-only", () => ({}))
const { AdminLeadsView } = await import("./admin-leads-view")
const { AdminLeadView } = await import("./admin-lead-view")

const lead = (over: Partial<AdminLead> = {}): AdminLead => ({
  id: 12,
  reference: "LEAD-12",
  audience: "organisation",
  need: "team",
  timeline: "quarter",
  message: "Our management team needs to work as one again.",
  name: "Ada Lovelace",
  email: "ada@example.com",
  phone: "+46 70-123 45 67",
  organisation: "Analytical Engines AB",
  role: "Head of unit",
  contactMethod: "phone",
  newsletter: false,
  locale: "sv",
  page: "/kontakt",
  status: "new",
  notes: null,
  createdAt: "2026-11-10T08:00:00.000Z",
  consentAt: "2026-11-10T08:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  deleteAfter: "2027-11-10T08:00:00.000Z",
  ...over,
})

const counts = { new: 3, contacted: 1, call_booked: 0, won: 2, lost: 0 }

describe("AdminLeadsView", () => {
  test("a tab per status with its count, All first and summed, the current one marked", () => {
    const html = renderToStaticMarkup(
      <AdminLeadsView items={[lead()]} nextCursor={null} counts={counts} status="won" />
    )
    expect(html).toContain('href="/admin/leads"')
    expect(html).toContain("All <span")
    expect(html).toContain("(6)")
    expect(html).toMatch(
      /aria-current="page"[^>]*href="\/admin\/leads\?status=won"|href="\/admin\/leads\?status=won"[^>]*aria-current="page"/
    )
    expect(html).toContain("Call booked")
    expect(html).toContain('href="/admin/leads/12"')
    expect(html).toContain("Team development or supervision")
  })

  test("an empty list says so; a next page links Older with the status", () => {
    const empty = renderToStaticMarkup(
      <AdminLeadsView items={[]} nextCursor={null} counts={counts} status="all" />
    )
    expect(empty).toContain("No leads match.")
    const paged = renderToStaticMarkup(
      <AdminLeadsView items={[lead()]} nextCursor={12} counts={counts} status="new" />
    )
    expect(paged).toContain("status=new&amp;cursor=12")
  })
})

describe("AdminLeadView", () => {
  test("every answer, mailto and tel links, the shown next step and the form", () => {
    const html = renderToStaticMarkup(<AdminLeadView lead={lead()} />)
    expect(html).toContain('href="mailto:ada@example.com"')
    expect(html).toContain('href="tel:+46701234567"')
    expect(html).toContain("Analytical Engines AB")
    expect(html).toContain("Within three months")
    expect(html).toContain("(/book/workshop)")
    expect(html).toContain('name="status"')
    expect(html).toContain('name="notes"')
  })

  test("the message is plain text in a pre-wrap block, never HTML", () => {
    const html = renderToStaticMarkup(
      <AdminLeadView lead={lead({ message: "<script>alert(1)</script>\nLine two." })} />
    )
    expect(html).toMatch(/<pre class="[^"]*whitespace-pre-wrap[^"]*">/)
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  test("who set the status, and the notes in the form", () => {
    const html = renderToStaticMarkup(
      <AdminLeadView
        lead={lead({
          status: "contacted",
          notes: "Called on Tuesday.",
          statusChangedAt: "2026-11-11T08:00:00.000Z",
          statusChangedBy: { id: 1, email: "root@example.com" },
        })}
      />
    )
    expect(html).toContain("Status set by root@example.com")
    expect(html).toContain("Called on Tuesday.")
  })
})
