import { describe, expect, mock, test } from "bun:test"
import type { SupportRequest } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"

// The resolve/reopen forms import their server actions, which reach @repo/session: `server-only`
// throws outside a react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { AdminSupportView } = await import("./admin-support-view")

const request = (over: Partial<SupportRequest> = {}): SupportRequest => ({
  id: 1,
  reference: "HELP-1",
  email: "visitor@example.com",
  name: "Vic",
  topic: "billing",
  message: "My invoice looks wrong, please help.",
  page: "/billing/invoices",
  userId: null,
  status: "open",
  createdAt: "2026-10-10T00:00:00.000Z",
  resolvedAt: null,
  resolvedBy: null,
  ...over,
})

describe("AdminSupportView", () => {
  test("renders the message as plain text in a white-space: pre-wrap <pre>, not HTML", () => {
    const html = renderToStaticMarkup(
      <AdminSupportView
        items={[request({ message: "<script>alert(1)</script>\nLine two." })]}
        nextCursor={null}
        status="open"
      />
    )
    // Tailwind's `whitespace-pre-wrap` compiles to `white-space: pre-wrap` in the app's CSS; the
    // markup here just carries the class on a <pre>.
    expect(html).toMatch(/<pre class="[^"]*whitespace-pre-wrap[^"]*">/)
    // Rendered as text: the angle brackets are escaped, never a live <script> element.
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  test("an open request shows Mark resolved, not Reopen", () => {
    const html = renderToStaticMarkup(
      <AdminSupportView items={[request({ status: "open" })]} nextCursor={null} status="open" />
    )
    expect(html).toContain("Mark resolved")
    expect(html).not.toContain(">Reopen<")
  })

  test("a resolved request shows Reopen and who resolved it", () => {
    const html = renderToStaticMarkup(
      <AdminSupportView
        items={[
          request({
            status: "resolved",
            resolvedAt: "2026-10-10T12:00:00.000Z",
            resolvedBy: { id: 9, email: "root@example.com" },
          }),
        ]}
        nextCursor={null}
        status="resolved"
      />
    )
    expect(html).toContain("Reopen")
    expect(html).toContain("Resolved by root@example.com")
    expect(html).not.toContain("Mark resolved")
  })

  test("the current status tab carries aria-current", () => {
    const html = renderToStaticMarkup(
      <AdminSupportView items={[]} nextCursor={null} status="resolved" />
    )
    expect(html).toContain(
      '<a aria-current="page" class="rounded-md px-3 py-1.5 text-sm font-medium hover:bg-muted bg-muted" href="/admin/support?status=resolved">Resolved</a>'
    )
  })

  test("no requests shows an empty-state message", () => {
    const html = renderToStaticMarkup(
      <AdminSupportView items={[]} nextCursor={null} status="open" />
    )
    expect(html).toContain("No support requests.")
  })
})
