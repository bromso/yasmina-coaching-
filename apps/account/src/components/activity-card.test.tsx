import { describe, expect, mock, test } from "bun:test"
import {
  entitlementsFor,
  type Member,
  type WorkspaceActivityItem,
  type WorkspaceActivityPage,
  type WorkspaceSummary,
} from "@repo/api-contract"
import { formatUtcDate } from "@repo/i18n/dates"
import { renderIn } from "@/test-intl"
import { ActivityCard } from "./activity-card"

// WorkspaceView's other cards import their server actions, which reach @repo/session.
mock.module("server-only", () => ({}))
const { WorkspaceView } = await import("@/views/workspace-view")

const CURSOR = "2026-10-01T12:00:00.000Z_42"

const items: WorkspaceActivityItem[] = [
  {
    id: 3,
    at: "2026-10-03T09:05:00.000Z",
    action: "workspace.renamed",
    actor: {
      kind: "member",
      userId: 1,
      name: "Ada",
      email: "ada@example.com",
      bySupport: true,
    },
    target: { type: "workspace", id: "5", label: null },
    details: { from: "Acme", to: "Acme Inc" },
  },
  {
    id: 2,
    at: "2026-10-02T08:00:00.000Z",
    action: "invitation.accepted",
    actor: { kind: "member", userId: 2, name: "Grace", email: null, bySupport: false },
    target: { type: "user", id: "2", label: "Grace" },
    details: { role: "member" },
  },
  {
    id: 1,
    at: "2026-10-01T07:00:00.000Z",
    action: "workspace.webhook_disabled",
    actor: { kind: "system" },
    target: { type: "webhook", id: "3", label: "hooks.example.com" },
    details: { host: "hooks.example.com", reason: "failures" },
  },
]

const card = (
  locale: "en" | "sv",
  page: WorkspaceActivityPage | null,
  params: { action?: WorkspaceActivityItem["action"]; cursor?: string } = {}
) => renderIn(locale, <ActivityCard page={page} params={params} locale={locale} />)

describe("ActivityCard", () => {
  test("lists each row: actor, address, the by-support badge, the sentence and the UTC time", () => {
    const html = card("en", { items, nextCursor: null })
    for (const text of [
      ">Activity<",
      ">Ada<",
      ">ada@example.com<",
      ">by support<",
      "Renamed the workspace from Acme to Acme Inc.",
      ">Grace<",
      "Joined the workspace as Member.",
      ">System<",
      "Turned off the webhook endpoint hooks.example.com after repeated failed deliveries.",
      '<time dateTime="2026-10-03T09:05:00.000Z"',
      formatUtcDate("2026-10-03T09:05:00.000Z", "en", { time: true }),
    ])
      expect(html).toContain(text)
    // Only the impersonated row carries the badge.
    expect(html.match(/by support/g)?.length).toBe(1)
  })

  test("an API key and a deleted account as actors", () => {
    const html = card("en", {
      items: [
        { ...items[0], id: 9, actor: { kind: "apiKey", id: 4, name: "Deploy bot" } },
        { ...items[0], id: 8, actor: { kind: "deleted" } },
      ] as WorkspaceActivityItem[],
      nextCursor: null,
    })
    expect(html).toContain(">API key Deploy bot<")
    expect(html).toContain(">Deleted user<")
    expect(html).not.toContain("by support")
  })

  test("the filter is a plain GET form with every action and the current one selected", () => {
    const html = card("en", { items, nextCursor: null }, { action: "workspace.renamed" })
    expect(html).toContain('action="/workspace#activity-heading" method="get"')
    expect(html).toContain('name="activityAction"')
    expect(html).toContain('<option value="">All activity</option>')
    expect(html).toContain('<option value="workspace.renamed" selected="">Renames</option>')
    expect(html).toContain('<option value="invitation.accepted">Joins</option>')
    expect(html).toContain('type="submit"')
    expect(html).toContain(">Show activity<")
    expect(html).toContain('for="activity-action"')
  })

  test("Older carries the next cursor and the filter; no Newest on the first page", () => {
    const html = card("en", { items, nextCursor: CURSOR }, { action: "workspace.renamed" })
    const href = `/workspace?activityAction=workspace.renamed&amp;activityCursor=${encodeURIComponent(CURSOR)}#activity-heading`
    expect(html).toContain(`href="${href}"`)
    expect(html).toContain(">Older<")
    expect(html).not.toContain(">Newest<")
    expect(html).not.toContain("Newer")
  })

  test("a later page links back to the newest, filter kept, and the last page has no Older", () => {
    const html = card(
      "en",
      { items, nextCursor: null },
      { action: "workspace.left", cursor: CURSOR }
    )
    expect(html).toContain('href="/workspace?activityAction=workspace.left#activity-heading"')
    expect(html).toContain(">Newest<")
    expect(html).not.toContain(">Older<")
  })

  test("no paging links at all on a single page", () => {
    const html = card("en", { items, nextCursor: null })
    expect(html).not.toContain("<nav")
  })

  test("the empty state and a failed read", () => {
    expect(card("en", { items: [], nextCursor: null })).toContain(
      "No activity in the last 90 days."
    )
    expect(card("sv", { items: [], nextCursor: null })).toContain(
      "Ingen aktivitet de senaste 90 dagarna."
    )
    const failed = card("en", null)
    expect(failed).toContain("Couldn&#x27;t load the activity right now. Try again shortly.")
    expect(failed).not.toContain("No activity")
  })

  test("in Swedish", () => {
    const html = card("sv", { items, nextCursor: CURSOR }, { cursor: CURSOR })
    for (const text of [
      ">Aktivitet<",
      ">av supporten<",
      "Bytte namn på arbetsytan från Acme till Acme Inc.",
      "Gick med i arbetsytan som Medlem.",
      ">Systemet<",
      formatUtcDate("2026-10-03T09:05:00.000Z", "sv", { time: true }),
      ">Äldre<",
      ">Senaste<",
      ">All aktivitet<",
    ])
      expect(html).toContain(text)
  })
})

describe("the Activity card in WorkspaceView", () => {
  const entitlements = entitlementsFor({
    subscription: null,
    memberCount: 1,
    portalAvailable: false,
  })
  const workspace: WorkspaceSummary = {
    id: 5,
    name: "Acme",
    slug: "acme",
    createdAt: "2026-01-01T00:00:00.000Z",
    role: "owner",
    memberCount: 1,
    entitlements,
    logoUrl: null,
    requireTwoFactor: false,
  }
  const members = [
    { userId: 1, name: "Ada", email: null, role: "owner", joinedAt: "2026-01-02T00:00:00.000Z" },
  ] as unknown as Member[]
  const view = (role: "owner" | "admin" | "member", withActivity: boolean) =>
    renderIn(
      "en",
      <WorkspaceView
        workspace={workspace}
        role={role}
        entitlements={entitlements}
        currentUserId={1}
        members={members}
        activity={withActivity ? { page: { items, nextCursor: null }, params: {} } : undefined}
        locale="en"
        apiKeysDocsUrl="https://docs.brand.localhost:3004"
        webhooksDocsUrl="https://docs.brand.localhost:3004"
      />
    )

  test("an admin and an owner see it", () => {
    for (const role of ["owner", "admin"] as const) {
      const html = view(role, true)
      expect(html).toContain('id="activity-heading"')
      expect(html).toContain("Renamed the workspace from Acme to Acme Inc.")
    }
  })

  test("below admin it is absent, even if a page were passed", () => {
    const html = view("member", true)
    expect(html).not.toContain("activity-heading")
    expect(html).not.toContain("Renamed the workspace")
  })
})
