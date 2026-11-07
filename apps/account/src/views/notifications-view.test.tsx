import { describe, expect, mock, test } from "bun:test"
import type { Notification, NotificationPage, NotificationPreference } from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import { renderIn } from "@/test-intl"

// The view's forms import their server actions, which reach @repo/session: `server-only` throws
// outside a react-server bundle, so stub it.
mock.module("server-only", () => ({}))
const { NotificationsView } = await import("./notifications-view")

const items: Notification[] = [
  {
    id: 3,
    type: "member.role_changed",
    workspaceId: 7,
    createdAt: "2026-10-21T08:30:00.000Z",
    read: false,
    data: { workspaceName: "Acme", from: "member", to: "admin" },
  },
  {
    id: 2,
    type: "plan.changed",
    workspaceId: 9,
    createdAt: "2026-10-20T08:00:00.000Z",
    read: false,
    data: { workspaceName: "Beta", plan: "pro" },
  },
  {
    id: 1,
    type: "member.removed",
    workspaceId: null,
    createdAt: "2026-10-19T08:00:00.000Z",
    read: true,
    data: { workspaceName: "Gamma" },
  },
]

const DEFAULT_PREFERENCES: NotificationPreference[] = [
  { type: "member.role_changed", email: true, locked: false },
  { type: "member.removed", email: true, locked: false },
  { type: "plan.changed", email: true, locked: false },
  { type: "invitation.received", email: true, locked: true },
  { type: "workspace.two_factor_required", email: true, locked: true },
  { type: "export.ready", email: true, locked: true },
  { type: "webhook.disabled", email: true, locked: true },
]

const view = (
  over: Partial<{
    page: NotificationPage | null
    unreadOnly: boolean
    cursor: string
    impersonating: boolean
    emailVerified: boolean
    locale: "en" | "sv"
    unread: number | null
    openFailed: boolean
    preferences: NotificationPreference[] | null
  }> = {}
) => {
  const locale = over.locale ?? "en"
  return renderIn(
    locale,
    <NotificationsView
      page={
        over.page === undefined ? { items, nextCursor: "2026-10-19T08:00:00.000Z_1" } : over.page
      }
      params={{
        unreadOnly: over.unreadOnly ?? false,
        ...(over.cursor ? { cursor: over.cursor } : {}),
        ...(over.openFailed ? { openFailed: true } : {}),
      }}
      locale={locale}
      currentWorkspaceId={7}
      appUrl="http://app.brand.localhost:3001"
      impersonating={over.impersonating ?? false}
      emailVerified={over.emailVerified ?? true}
      unread={over.unread === undefined ? 2 : over.unread}
      preferences={over.preferences === undefined ? DEFAULT_PREFERENCES : over.preferences}
    />
  )
}

describe("NotificationsView", () => {
  test("each row's sentence and UTC date; unread rows marked visibly and in text", () => {
    const html = view()
    expect(html).toContain("<h1")
    expect(html).toContain("Your role in Acme changed to Admin.")
    expect(html).toContain("Beta is now on the Pro plan.")
    expect(html).toContain("You were removed from Gamma.")
    expect(html).toContain('dateTime="2026-10-21T08:30:00.000Z"')
    expect(html).toMatch(/data-read="false"[\s\S]*?Unread/)
    expect((html.match(/>Unread</g) ?? []).length).toBe(2)
    expect(html).toContain('<span class="sr-only">Read</span>')
  })

  test("Mark all, a uniquely named Mark as read per unread row, none on a read one", () => {
    const html = view()
    expect(html).toContain(">Mark all as read</button>")
    const labels = [...html.matchAll(/aria-label="(Mark as read, [^"]+)"/g)].map((m) => m[1])
    expect(labels).toHaveLength(2)
    expect(new Set(labels).size).toBe(2)
    expect(labels[0]).toContain("Your role in Acme changed to Admin.")
    expect(html).toContain('name="all" value="1"')
    expect(html).toContain('name="id" value="3"')
    expect(html).not.toContain('name="id" value="1"')
  })

  test("Open: a link for the current workspace, a switch form for another, none once left", () => {
    const html = view()
    // The English date-and-time pattern comes from the runtime's ICU ("Oct 21, 2026 at 8:30 AM" in
    // one version, "Oct 21, 2026, 8:30 AM" in another), so build the expected label with the same
    // formatter the view uses rather than hard-coding either.
    const date = formatUtcDate("2026-10-21T08:30:00.000Z", "en", { time: true })
    expect(html).toContain(
      `<a href="/workspace" aria-label="Open, ${date}: Your role in Acme changed to Admin."`
    )
    expect(html).toContain('name="workspaceId" value="9"')
    expect(html).toContain('name="page" value="/payments"')
    expect(html).not.toContain("Open, Oct 19")
  })

  test("the GET filter and paging: Older keeps the filter, Newest only past the first page", () => {
    const first = view({ unreadOnly: true })
    expect(first).toMatch(/<form[^>]*action="\/notifications#notifications-heading" method="get"/)
    expect(first).toMatch(
      /<input type="checkbox" id="notifications-unread-only"[^>]*name="unread"[^>]*checked=""/
    )
    expect(view()).not.toMatch(
      /<input type="checkbox" id="notifications-unread-only"[^>]*checked=""/
    )
    expect(first).toContain(">Unread only</label>")
    expect(first).toContain(
      'href="/notifications?unread=1&amp;cursor=2026-10-19T08%3A00%3A00.000Z_1#notifications-heading"'
    )
    expect(first).toContain(">Older</a>")
    expect(first).not.toContain(">Newest</a>")
    const later = view({ cursor: "2026-10-22T08:00:00.000Z_9" })
    expect(later).toContain('href="/notifications#notifications-heading"')
    expect(later).toContain(">Newest</a>")
  })

  test("Mark all as read follows the user's unread count, not only this page's rows", () => {
    const allRead = { items: items.map((item) => ({ ...item, read: true })), nextCursor: null }
    expect(view({ page: allRead, unread: 4 })).toContain(">Mark all as read</button>")
    expect(view({ unread: 0 })).not.toContain("Mark all as read")
    // The count unknown: this page's own rows decide.
    expect(view({ unread: null })).toContain(">Mark all as read</button>")
    expect(view({ page: allRead, unread: null })).not.toContain("Mark all as read")
  })

  test("a refused Open (?error=open) says so, in either language", () => {
    expect(view({ openFailed: true })).toMatch(
      /role="alert"[\s\S]*Couldn&#x27;t open that workspace/
    )
    expect(view({ openFailed: true, locale: "sv" })).toContain(
      "Det gick inte att öppna arbetsytan. Försök igen."
    )
    expect(view()).not.toContain("Couldn&#x27;t open that workspace")
  })

  test("while impersonating: no mark buttons, and a note saying why", () => {
    const html = view({ impersonating: true })
    expect(html).toContain("Not available while impersonating.")
    expect(html).not.toContain("Mark all as read")
    expect(html).not.toContain("Mark as read")
  })

  test("empty, empty unread-only and unavailable states", () => {
    expect(view({ page: { items: [], nextCursor: null } })).toContain("You have no notifications.")
    expect(view({ page: { items: [], nextCursor: null }, unreadOnly: true })).toContain(
      "You have no unread notifications."
    )
    expect(view({ page: null })).toContain("Your notifications couldn&#x27;t be loaded.")
  })

  test("in Swedish", () => {
    const html = view({ locale: "sv" })
    expect(html).toContain("Aviseringar")
    expect(html).toContain("Din roll i Acme har ändrats till administratör.")
    expect(html).toContain(">Markera alla som lästa</button>")
    expect(html).toContain(">Oläst<")
    expect(html).toContain(">Bara olästa</label>")
    expect(html).toContain(">Äldre</a>")
    expect(view({ locale: "sv", page: { items: [], nextCursor: null } })).toContain(
      "Du har inga aviseringar."
    )
  })

  test("Email section: one checkbox per optional type, checked as the read says", () => {
    const html = view({
      preferences: [
        { type: "member.role_changed", email: false, locked: false },
        { type: "member.removed", email: true, locked: false },
        { type: "plan.changed", email: true, locked: false },
      ],
    })
    expect(html).toContain("When my role in a workspace changes")
    expect(html).toContain("When I&#x27;m removed from a workspace")
    expect(html).toContain("When the plan of a workspace I own changes")
    expect(html).toContain('name="email" value="member.role_changed"')
    expect(html).not.toContain('name="email" checked="" value="member.role_changed"')
    expect(html).toContain('name="email" checked="" value="member.removed"')
    expect(html).toContain('name="email" checked="" value="plan.changed"')
    expect(html).toContain(">Save email settings</button>")
  })

  test("Email section: the locked types are listed read-only, in order", () => {
    const html = view()
    const title = "Always emailed — needed to keep your account and workspaces working."
    expect(html).toContain(title)
    const order = ["invitations", "two-step verification", "export is ready", "webhook"].map(
      (needle) => html.indexOf(needle)
    )
    expect(order.every((index) => index > -1)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
    expect(html).not.toContain('name="type" value="invitation.received"')
  })

  test("Email section: a failed read shows a short message instead of the form", () => {
    const html = view({ preferences: null })
    expect(html).toContain("Your email settings couldn&#x27;t be loaded.")
    expect(html).not.toContain(">Save email settings</button>")
    expect(html).not.toContain("Workspace invitations")
  })

  test("Email section: disabled and a note while impersonating", () => {
    const html = view({ impersonating: true })
    expect(html).toMatch(/<fieldset class="grid gap-3" disabled=""/)
    expect(html).not.toContain(">Save email settings</button>")
    // The page's one impersonation string, reused rather than a second copy.
    expect(html.match(/Not available while impersonating\./g)?.length).toBeGreaterThanOrEqual(1)
  })

  test("Email section: the fieldset's legend names the choice, not the card's title", () => {
    const html = view()
    expect(html).toContain('<legend class="sr-only">Also send me an email</legend>')
    expect(view({ locale: "sv" })).toContain(
      '<legend class="sr-only">Skicka även som e-post</legend>'
    )
  })

  test("Email section: an unverified address is told these emails need verifying", () => {
    const note = "Verify your email address to get these emails."
    expect(view()).not.toContain(note)
    const html = view({ emailVerified: false })
    expect(html).toContain(note)
    expect(html).toMatch(/<a href="\/personal-info"[^>]*>Resend the link<\/a> from Personal info\./)
    // The boxes still show the stored choice, so verifying later needs no second save.
    expect(html).toContain('name="email" checked="" value="member.removed"')
    expect(view({ locale: "sv", emailVerified: false })).toContain(
      "Verifiera din e-postadress för att få de här aviseringarna som e-post."
    )
  })

  test("Email section in Swedish", () => {
    const html = view({ locale: "sv" })
    expect(html).toContain(">E-post<")
    expect(html).toContain("När min roll i en arbetsyta ändras")
    expect(html).toContain("När jag tas bort från en arbetsyta")
    expect(html).toContain("När planen för en arbetsyta jag äger ändras")
    expect(html).toContain(">Spara e-postinställningar</button>")
    expect(html).toContain(
      "Skickas alltid som e-post – behövs för att ditt konto och dina arbetsytor ska fortsätta fungera."
    )
    expect(html).toContain("Inbjudningar till arbetsytor")
  })
})
