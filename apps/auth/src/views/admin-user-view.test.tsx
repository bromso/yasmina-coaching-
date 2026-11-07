import { describe, expect, mock, test } from "bun:test"
import type { AdminUserDetail } from "@repo/api-contract"
import { renderToStaticMarkup } from "react-dom/server"

// The admin forms import their server actions, which reach @repo/session: `server-only` throws
// outside a react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { AdminUserView } = await import("./admin-user-view")
const { actorFallback } = await import("@/components/admin/audit-table")

const user = (over: Partial<AdminUserDetail> = {}): AdminUserDetail => ({
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
  twoFactorEnabled: false,
  deletionScheduledAt: null,
  memberships: [],
  sessions: { count: 0, lastSeenAt: null, impersonations: 0 },
  audit: [],
  suspended: null,
  ...over,
})

/** The Suspension card's markup: from its title to the next card's title. */
const suspensionCard = (html: string) => {
  const start = html.indexOf(">Suspension<")
  expect(start).toBeGreaterThan(-1)
  const next = html.indexOf('data-slot="card-title"', start + 1)
  return html.slice(start, next === -1 ? undefined : next)
}

describe("AdminUserView", () => {
  test("shows the scheduled deletion date when one is set", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({ deletionScheduledAt: "2026-10-17T12:00:00.000Z" })}
        isSelf={false}
      />
    )
    expect(html).toContain("Scheduled for deletion on")
    expect(html).toContain('dateTime="2026-10-17T12:00:00.000Z"')
  })

  test("says nothing about deletion when none is scheduled", () => {
    const html = renderToStaticMarkup(<AdminUserView user={user()} isSelf={false} />)
    expect(html).not.toContain("Scheduled for deletion")
  })

  test("no passkeys: the count reads zero and no removal form is shown", () => {
    const html = renderToStaticMarkup(<AdminUserView user={user({ passkeys: 0 })} isSelf={false} />)
    expect(html).toContain("0 passkeys registered")
    expect(html).toContain("No passkeys.")
    expect(html).not.toContain("Remove passkeys")
  })

  test("one passkey: singular count and the removal form, with its reason field", () => {
    const html = renderToStaticMarkup(<AdminUserView user={user({ passkeys: 1 })} isSelf={false} />)
    expect(html).toContain("1 passkey registered")
    expect(html).toContain("Remove passkeys")
    expect(html).toContain("Reason")
  })

  test("several passkeys: the plural count", () => {
    const html = renderToStaticMarkup(<AdminUserView user={user({ passkeys: 3 })} isSelf={false} />)
    expect(html).toContain("3 passkeys registered")
  })

  test("a superadmin target's passkeys cannot be removed either", () => {
    const html = renderToStaticMarkup(
      <AdminUserView user={user({ passkeys: 1, superadmin: true })} isSelf={false} />
    )
    expect(html).toContain("A superadmin")
    expect(html).toContain("passkeys cannot be removed")
  })

  test("not suspended: the status reads so, and the Suspend form (not Unsuspend) is shown", () => {
    const html = renderToStaticMarkup(
      <AdminUserView user={user({ suspended: null })} isSelf={false} />
    )
    expect(html).toContain("Not suspended")
    expect(html).toContain("Suspend account")
    expect(html).not.toContain("Lift suspension")
    expect(html).toContain("Reason for suspending")
    // The Suspension card's own markup (Impersonate, beside it, rightly says its reason *is*
    // shown to the user): its hint never claims the reason reaches the user.
    const card = suspensionCard(html)
    expect(card).toContain(
      'id="suspend-reason-hint" class="text-muted-foreground text-xs">Internal: kept in the audit log, never shown to the user<'
    )
    expect(card).not.toContain("Shown to the user")
  })

  test("an active suspension shows its reason, end date and admin, and the Unsuspend form", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({
          suspended: {
            at: "2026-10-01T00:00:00.000Z",
            until: "2026-11-02T00:00:00.000Z",
            active: true,
            reason: "abuse report #42",
            by: { id: 2, email: "root@example.com" },
          },
        })}
        isSelf={false}
      />
    )
    expect(html).toContain("Active")
    expect(html).toContain("abuse report #42")
    expect(html).toContain("root@example.com")
    expect(html).toContain('dateTime="2026-11-02T00:00:00.000Z"')
    expect(html).toContain("Lift suspension")
    expect(html).not.toContain("Suspend account")
    expect(html).toContain("Reason for lifting")
    expect(html).toContain('value="unsuspend"')
  })

  test("an indefinite suspension's end date reads Indefinite", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({
          suspended: {
            at: "2026-10-01T00:00:00.000Z",
            until: null,
            active: true,
            reason: "abuse report",
            by: { id: 2, email: "root@example.com" },
          },
        })}
        isSelf={false}
      />
    )
    expect(html).toContain("Indefinite")
  })

  test("an expired, uncleared suspension reads Expired and offers Lift suspension, not Suspend", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({
          suspended: {
            at: "2026-01-01T00:00:00.000Z",
            until: "2026-02-01T00:00:00.000Z",
            active: false,
            reason: "old report",
            by: { id: 2, email: "root@example.com" },
          },
        })}
        isSelf={false}
      />
    )
    expect(html).toContain("Expired")
    expect(html).toContain("old report")
    expect(html).toContain("Lift suspension")
    expect(html).not.toContain("Suspend account")
    expect(html).toContain('value="unsuspend"')
    expect(html).toContain("Lift it to clear the record before suspending the account again")
    // No end-date field: lifting takes only a reason.
    expect(html).not.toContain('name="until"')
  })

  test("a purged admin's suspension reads 'Unknown (account purged)'", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({
          suspended: {
            at: "2026-10-01T00:00:00.000Z",
            until: null,
            active: true,
            reason: "abuse report",
            by: null,
          },
        })}
        isSelf={false}
      />
    )
    expect(html).toContain("Unknown (account purged)")
  })

  test("yourself: the suspension forms are disabled with 'This is you'", () => {
    const html = renderToStaticMarkup(
      <AdminUserView user={user({ suspended: null })} isSelf={true} />
    )
    expect(html).toContain("Suspend account")
    expect(html).toContain("This is you")
  })

  test("a superadmin target's suspension cannot be changed either", () => {
    const html = renderToStaticMarkup(
      <AdminUserView user={user({ suspended: null, superadmin: true })} isSelf={false} />
    )
    expect(html).toContain("A superadmin")
    expect(html).toContain("suspension status cannot be changed")
  })

  test("an audit row whose actor is gone reads Deleted user; the purge's own row, System", () => {
    const html = renderToStaticMarkup(
      <AdminUserView
        user={user({
          audit: [
            {
              id: 1,
              at: "2026-10-10T00:00:00.000Z",
              actor: null,
              impersonated: null,
              action: "note.created",
              targetType: null,
              targetId: null,
              reason: null,
              metadata: null,
            },
          ],
        })}
        isSelf={false}
      />
    )
    expect(html).toContain("Deleted user")
    expect(actorFallback("user.deleted")).toBe("System")
  })
})
