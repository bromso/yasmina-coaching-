import { describe, expect, mock, test } from "bun:test"
import type { AdminApplication } from "@repo/api-contract"
import { navPill } from "@repo/ui/components/nav-pill"
import { renderToStaticMarkup } from "react-dom/server"

// The status/delete forms import their server actions, which reach @repo/session: `server-only`
// throws outside a react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { AdminApplicationsView } = await import("./admin-applications-view")

const application = (over: Partial<AdminApplication> = {}): AdminApplication => ({
  id: 1,
  reference: "JOB-1",
  job: { slug: "senior-engineer", title: "Senior Engineer" },
  name: "Ada Lovelace",
  email: "ada@example.com",
  link: "https://ada.example/portfolio",
  note: "I would love to build engines with you.",
  status: "new",
  createdAt: "2026-10-10T00:00:00.000Z",
  statusChangedAt: null,
  statusChangedBy: null,
  ...over,
})

describe("AdminApplicationsView", () => {
  test("renders the note as plain text in a white-space: pre-wrap <pre>, not HTML", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView
        items={[application({ note: "<script>alert(1)</script>\nLine two." })]}
        nextCursor={null}
        status="all"
      />
    )
    expect(html).toMatch(/<pre class="[^"]*whitespace-pre-wrap[^"]*">/)
    expect(html).not.toContain("<script>alert(1)</script>")
    expect(html).toContain("&lt;script&gt;")
  })

  test("an https:// link shows as a link with rel=noopener noreferrer nofollow", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView
        items={[application({ link: "https://ada.example/portfolio" })]}
        nextCursor={null}
        status="all"
      />
    )
    expect(html).toContain('rel="noopener noreferrer nofollow"')
    expect(html).toContain('href="https://ada.example/portfolio"')
  })

  test("a non-https link (or none) shows no link", () => {
    const withHttp = renderToStaticMarkup(
      <AdminApplicationsView
        items={[application({ link: "http://ada.example/portfolio" })]}
        nextCursor={null}
        status="all"
      />
    )
    expect(withHttp).not.toContain("http://ada.example/portfolio")

    const withNull = renderToStaticMarkup(
      <AdminApplicationsView items={[application({ link: null })]} nextCursor={null} status="all" />
    )
    expect(withNull).not.toContain('<dt class="text-muted-foreground">Link</dt>')
  })

  test("shows the reference, the role, and who last changed the status", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView
        items={[
          application({
            status: "reviewing",
            statusChangedAt: "2026-10-10T12:00:00.000Z",
            statusChangedBy: { id: 9, email: "root@example.com" },
          }),
        ]}
        nextCursor={null}
        status="all"
      />
    )
    expect(html).toContain("JOB-1")
    expect(html).toContain("Senior Engineer")
    expect(html).toContain("Status set by root@example.com")
  })

  test("the current status tab carries aria-current", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView items={[]} nextCursor={null} status="reviewing" />
    )
    expect(html).toContain(
      `<a aria-current="page" class="${navPill({ current: true })}" href="/admin/applications?status=reviewing">Reviewing</a>`
    )
  })

  test("no applications shows an empty-state message", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView items={[]} nextCursor={null} status="all" />
    )
    expect(html).toContain("No applications match.")
  })

  test("a Download CV link points at the admin CV route", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView items={[application({ id: 42 })]} nextCursor={null} status="all" />
    )
    expect(html).toContain('href="/admin/applications/42/cv"')
    expect(html).toContain("Download CV")
  })

  test("delete is behind a <details> disclosure, not a one-click button", () => {
    const html = renderToStaticMarkup(
      <AdminApplicationsView items={[application({ id: 42 })]} nextCursor={null} status="all" />
    )
    expect(html).toMatch(/<details[^>]*><summary[^>]*>Delete…<\/summary>/)
    expect(html).toContain("Delete permanently")
  })
})
