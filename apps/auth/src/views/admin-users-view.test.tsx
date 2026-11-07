import { describe, expect, test } from "bun:test"
import type { AdminUser } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"
import { AdminUsersView } from "./admin-users-view"

const item = (over: Partial<AdminUser> = {}): AdminUser => ({
  id: 7,
  email: "ada@example.com",
  name: "Ada",
  emailVerified: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  hasPassword: true,
  providers: [],
  workspaceCount: 0,
  superadmin: false,
  avatarUrl: null,
  passkeys: 0,
  suspended: null,
  ...over,
})

describe("AdminUsersView", () => {
  test("no suspension record: no badge, the filter checkbox is unchecked", () => {
    const html = renderToStaticMarkup(
      <AdminUsersView items={[item()]} nextCursor={null} suspended={false} />
    )
    expect(html).not.toContain("Suspended</span>")
    expect(html).toContain('id="suspended"')
    expect(html).not.toContain('id="suspended" name="suspended" value="true" checked')
  })

  test("an active suspension shows the Suspended badge; an expired one does not", () => {
    const active = renderToStaticMarkup(
      <AdminUsersView
        items={[
          item({
            suspended: {
              at: "2026-01-01T00:00:00.000Z",
              until: null,
              active: true,
              reason: "r",
              by: null,
            },
          }),
        ]}
        nextCursor={null}
      />
    )
    expect(active).toContain("Suspended</span>")

    const expired = renderToStaticMarkup(
      <AdminUsersView
        items={[
          item({
            suspended: {
              at: "2026-01-01T00:00:00.000Z",
              until: "2026-02-01T00:00:00.000Z",
              active: false,
              reason: "r",
              by: null,
            },
          }),
        ]}
        nextCursor={null}
      />
    )
    expect(expired).not.toContain("Suspended</span>")
  })

  test("the 'Suspended only' filter checkbox reflects the current query", () => {
    const html = renderToStaticMarkup(
      <AdminUsersView items={[]} nextCursor={null} suspended={true} />
    )
    expect(html).toContain('id="suspended"')
    expect(html).toMatch(/id="suspended"[^>]*checked/)
  })

  test("the pager carries the suspended filter along", () => {
    const html = renderToStaticMarkup(
      <AdminUsersView items={[item()]} nextCursor={8} suspended={true} />
    )
    expect(html).toContain("suspended=true")
  })
})
