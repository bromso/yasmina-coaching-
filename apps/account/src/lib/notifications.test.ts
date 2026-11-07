import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import type { Notification, NotificationPreference } from "@repo/api-contract"
import { NOTIFICATION_UNREAD_CAP } from "@repo/api-contract/notifications"
import { NOTIFICATION_BELL_CAP, notificationBadge } from "@repo/ui/blocks/notification-bell"
import { accountTranslator } from "./i18n"
import {
  emailPreferenceChanges,
  isAccountPage,
  markReadCore,
  notificationEmailLockedLabel,
  notificationSentence,
  notificationsHref,
  notificationsParams,
  notificationTarget,
  optionalEmailPreferences,
  readNotificationPreferences,
  setNotificationEmailCore,
} from "./notifications"
import { focusHeadingIfLost } from "./notifications-focus"

const base = { id: 1, workspaceId: 7, createdAt: "2026-10-21T08:00:00.000Z", read: false }
const ITEMS: Notification[] = [
  {
    ...base,
    type: "invitation.received",
    workspaceId: null,
    data: { workspaceName: "Acme", role: "member", invitationId: 3 },
  },
  {
    ...base,
    type: "member.role_changed",
    data: { workspaceName: "Acme", from: "member", to: "admin" },
  },
  { ...base, type: "member.removed", workspaceId: null, data: { workspaceName: "Acme" } },
  { ...base, type: "workspace.two_factor_required", data: { workspaceName: "Acme" } },
  { ...base, type: "export.ready", workspaceId: null, data: {} },
  {
    ...base,
    type: "webhook.disabled",
    data: { workspaceName: "Acme", host: "hooks.example.com", reason: "failures" },
  },
  {
    ...base,
    type: "webhook.disabled",
    data: { workspaceName: "Acme", host: "hooks.example.com:8443", reason: "gone" },
  },
  { ...base, type: "plan.changed", data: { workspaceName: "Acme", plan: "team" } },
]

describe("the bell's cap", () => {
  // The badge (`@repo/ui`) and the accessible name (the api's capped count, the ICU plural) must
  // agree on where `99+` starts; @repo/ui does not depend on the contract, so they meet here.
  test("NOTIFICATION_BELL_CAP equals the contract's NOTIFICATION_UNREAD_CAP", () => {
    expect(NOTIFICATION_BELL_CAP).toBe(NOTIFICATION_UNREAD_CAP)
    expect(notificationBadge(NOTIFICATION_UNREAD_CAP)).toBe(String(NOTIFICATION_UNREAD_CAP))
    expect(notificationBadge(NOTIFICATION_UNREAD_CAP + 1)).toBe(`${NOTIFICATION_UNREAD_CAP}+`)
  })
})

describe("notificationSentence", () => {
  test("one sentence per type, in English", () => {
    const t = accountTranslator("en")
    expect(ITEMS.map((item) => notificationSentence(item, t))).toEqual([
      "You're invited to join Acme as Member.",
      "Your role in Acme changed to Admin.",
      "You were removed from Acme.",
      "Acme now requires two-step verification. Turn it on, or add a passkey, to keep using it.",
      "Your data export is ready to download.",
      "A webhook in Acme sending to hooks.example.com was turned off after repeated failed deliveries.",
      "A webhook in Acme sending to hooks.example.com:8443 was turned off because the endpoint said it is gone.",
      "Acme is now on the Team plan.",
    ])
  })

  test("and in Swedish, never a raw key", () => {
    const t = accountTranslator("sv")
    const sentences = ITEMS.map((item) => notificationSentence(item, t))
    // Role names are lowercase mid-sentence in Swedish.
    expect(sentences[0]).toBe("Du har bjudits in till Acme som medlem.")
    expect(sentences[1]).toBe("Din roll i Acme har ändrats till administratör.")
    expect(sentences[7]).toBe("Acme har nu planen Team.")
    for (const sentence of sentences) {
      expect(sentence).not.toContain("notifications.")
      expect(sentence).not.toContain("{")
    }
  })
})

describe("notificationTarget", () => {
  const appUrl = "http://app.brand.localhost:3001"
  const at = (index: number, currentWorkspaceId: number | null = 7) =>
    notificationTarget(ITEMS[index] as Notification, { currentWorkspaceId, appUrl })

  test("each type's page; the current workspace's pages are plain links", () => {
    expect(at(0)).toEqual({ kind: "href", href: `${appUrl}/workspaces/new` })
    expect(at(1)).toEqual({ kind: "href", href: "/workspace" })
    expect(at(2)).toBeNull()
    expect(at(3)).toEqual({ kind: "href", href: "/security" })
    expect(at(4)).toEqual({ kind: "href", href: "/data-privacy" })
    expect(at(5)).toEqual({ kind: "href", href: "/workspace" })
    expect(at(7)).toEqual({ kind: "href", href: "/payments" })
  })

  test("another workspace's page switches to it first", () => {
    expect(at(1, 9)).toEqual({ kind: "switchTo", workspaceId: 7, page: "/workspace" })
    expect(at(7, null)).toEqual({ kind: "switchTo", workspaceId: 7, page: "/payments" })
  })

  test("a workspace the user has left (workspaceId null) leads nowhere", () => {
    for (const item of ITEMS.filter((i) => i.type !== "invitation.received")) {
      const left = { ...item, workspaceId: null } as Notification
      const target = notificationTarget(left, { currentWorkspaceId: 7, appUrl })
      if (target?.kind === "href") expect(["/security", "/data-privacy"]).toContain(target.href)
      else expect(target).toBeNull()
    }
  })

  test("isAccountPage allows only the four pages", () => {
    for (const page of ["/workspace", "/payments", "/security", "/data-privacy"]) {
      expect(isAccountPage(page)).toBe(true)
    }
    for (const page of ["/", "//evil.example", "https://evil.example", "/workspace/x", null, 1]) {
      expect(isAccountPage(page)).toBe(false)
    }
  })
})

describe("the page's query string", () => {
  const cursor = "2026-10-21T08:00:00.000Z_12"

  test("unread=1 and a well-formed cursor are kept; anything else dropped", () => {
    expect(notificationsParams({})).toEqual({ unreadOnly: false })
    expect(notificationsParams({ unread: "1", cursor })).toEqual({ unreadOnly: true, cursor })
    expect(notificationsParams({ unread: "yes", cursor: "nope" })).toEqual({ unreadOnly: false })
    expect(notificationsParams({ cursor: "2026-13-01T00:00:00.000Z_1" })).toEqual({
      unreadOnly: false,
    })
    expect(notificationsParams({ cursor: "2026-10-21T08:00:00.000Z_9999999999" })).toEqual({
      unreadOnly: false,
    })
  })

  test("error=open is the refused-Open notice; anything else is not", () => {
    expect(notificationsParams({ error: "open" })).toEqual({ unreadOnly: false, openFailed: true })
    expect(notificationsParams({ error: "nope" })).toEqual({ unreadOnly: false })
    expect(notificationsHref({ unreadOnly: false, openFailed: true })).toBe(
      "/notifications?error=open#notifications-heading"
    )
  })

  test("hrefs keep the filter and land on the list", () => {
    expect(notificationsHref({ unreadOnly: false })).toBe("/notifications#notifications-heading")
    expect(notificationsHref({ unreadOnly: true, cursor })).toBe(
      `/notifications?unread=1&cursor=${encodeURIComponent(cursor)}#notifications-heading`
    )
  })
})

describe("markReadCore", () => {
  const form = (entries: Record<string, string>) => {
    const fd = new FormData()
    for (const [key, value] of Object.entries(entries)) fd.set(key, value)
    return fd
  }
  const recorder = (fail?: unknown) => {
    const calls: unknown[] = []
    return {
      calls,
      api: {
        markRead: async (input: unknown) => {
          calls.push(input)
          if (fail) throw fail
        },
      },
    }
  }

  test("all=1 marks all; id marks that one", async () => {
    const r = recorder()
    expect(await markReadCore({ api: r.api as never }, form({ all: "1" }))).toEqual({ ok: true })
    expect(await markReadCore({ api: r.api as never }, form({ id: "5" }))).toEqual({ ok: true })
    expect(r.calls).toEqual([{ all: true }, { ids: [5] }])
  })

  test("an unusable form calls nothing", async () => {
    const r = recorder()
    const forms: Record<string, string>[] = [
      {},
      { id: "0" },
      { id: "x" },
      { id: "1.5" },
      { all: "yes" },
    ]
    for (const entries of forms) {
      const out = await markReadCore({ api: r.api as never }, form(entries))
      expect(out).toEqual({
        ok: false,
        message: "Couldn't mark your notifications as read. Try again.",
      })
    }
    expect(r.calls).toEqual([])
  })

  test("impersonating is refused with its own message, in the page's language", async () => {
    const r = recorder(new ORPCError("FORBIDDEN", { message: "Not available while impersonating" }))
    expect(await markReadCore({ api: r.api as never }, form({ all: "1" }))).toEqual({
      ok: false,
      message: "Not available while impersonating.",
    })
    expect(await markReadCore({ api: r.api as never, locale: "sv" }, form({ id: "2" }))).toEqual({
      ok: false,
      message: "Inte tillgängligt när du agerar som en annan användare.",
    })
  })

  test("any other failure is the generic message", async () => {
    const r = recorder(new TypeError("fetch failed"))
    expect(await markReadCore({ api: r.api as never, locale: "sv" }, form({ all: "1" }))).toEqual({
      ok: false,
      message: "Det gick inte att markera aviseringarna som lästa. Försök igen.",
    })
  })
})

describe("focusHeadingIfLost", () => {
  const fakeDoc = (active: "body" | "other" | "detached") => {
    const focused: string[] = []
    const body = { isConnected: true } as unknown as Element
    const activeElement =
      active === "body" ? body : ({ isConnected: active === "other" } as unknown as Element)
    return {
      focused,
      doc: {
        body: body as HTMLElement,
        activeElement,
        getElementById: (id: string) =>
          ({ focus: () => focused.push(id) }) as unknown as HTMLElement,
      },
    }
  }

  test("focus lost to the body (or a removed element) goes to the list's heading", () => {
    for (const active of ["body", "detached"] as const) {
      const { doc, focused } = fakeDoc(active)
      expect(focusHeadingIfLost(true, doc)).toBe(true)
      expect(focused).toEqual(["notifications-heading"])
    }
  })

  test("never when the form did not hold focus, or focus is already elsewhere", () => {
    const a = fakeDoc("body")
    expect(focusHeadingIfLost(false, a.doc)).toBe(false)
    const b = fakeDoc("other")
    expect(focusHeadingIfLost(true, b.doc)).toBe(false)
    expect([...a.focused, ...b.focused]).toEqual([])
  })
})

describe("readNotificationPreferences", () => {
  test("the read's own answer, or null when it throws", async () => {
    const preferences: NotificationPreference[] = [
      { type: "member.role_changed", email: true, locked: false },
    ]
    expect(await readNotificationPreferences(async () => preferences)).toBe(preferences)
    expect(
      await readNotificationPreferences(async () => {
        throw new Error("boom")
      })
    ).toBeNull()
  })
})

describe("optionalEmailPreferences", () => {
  test("the optional types only, in NOTIFICATION_EMAIL.optional order, locked rows dropped", () => {
    const preferences: NotificationPreference[] = [
      { type: "member.role_changed", email: false, locked: false },
      { type: "member.removed", email: true, locked: false },
      { type: "plan.changed", email: false, locked: false },
      { type: "invitation.received", email: true, locked: true },
    ]
    expect(optionalEmailPreferences(preferences)).toEqual([
      { type: "member.role_changed", email: false },
      { type: "member.removed", email: true },
      { type: "plan.changed", email: false },
    ])
  })

  test("a type missing from the read defaults to on", () => {
    const preferences: NotificationPreference[] = [
      { type: "member.role_changed", email: false, locked: false },
    ]
    expect(optionalEmailPreferences(preferences)).toEqual([
      { type: "member.role_changed", email: false },
      { type: "member.removed", email: true },
      { type: "plan.changed", email: true },
    ])
  })
})

describe("notificationEmailLockedLabel", () => {
  test("each locked type's own read-only line, in the page's language", () => {
    const en = accountTranslator("en")
    expect(notificationEmailLockedLabel("invitation.received", en)).toBe("Workspace invitations")
    expect(notificationEmailLockedLabel("workspace.two_factor_required", en)).toBe(
      "A workspace starts requiring two-step verification"
    )
    expect(notificationEmailLockedLabel("export.ready", en)).toBe("Your data export is ready")
    expect(notificationEmailLockedLabel("webhook.disabled", en)).toBe("A webhook was turned off")
    const sv = accountTranslator("sv")
    expect(notificationEmailLockedLabel("invitation.received", sv)).toBe(
      "Inbjudningar till arbetsytor"
    )
  })
})

describe("emailPreferenceChanges", () => {
  const form = (entries: [string, string][]) => {
    const fd = new FormData()
    for (const [key, value] of entries) fd.append(key, value)
    return fd
  }
  const allTypes: [string, string][] = [
    ["type", "member.role_changed"],
    ["type", "member.removed"],
    ["type", "plan.changed"],
  ]

  test("nothing changed: every checkbox matches wasEmail", () => {
    const fd = form([
      ...allTypes,
      ["wasEmail", "member.role_changed"],
      ["email", "member.role_changed"],
      ["wasEmail", "member.removed"],
      ["email", "member.removed"],
      ["wasEmail", "plan.changed"],
      ["email", "plan.changed"],
    ])
    expect(emailPreferenceChanges(fd)).toEqual([])
  })

  test("turning one off and another on: only those two come back", () => {
    const fd = form([
      ...allTypes,
      // member.role_changed was on, now unchecked: no "email" entry for it.
      ["wasEmail", "member.role_changed"],
      // member.removed was off, now checked.
      ["email", "member.removed"],
      // plan.changed unchanged, off both times.
    ])
    expect(emailPreferenceChanges(fd)).toEqual([
      { type: "member.role_changed", email: false },
      { type: "member.removed", email: true },
    ])
  })

  test("a type the universe never listed on the form is ignored, even if checked or marked was-on", () => {
    const fd = form([
      ["type", "member.role_changed"],
      ["wasEmail", "member.role_changed"],
      ["email", "member.role_changed"], // unchanged: on before, checked now
      ["email", "workspace.two_factor_required"], // a locked type, tampered in
      ["wasEmail", "workspace.two_factor_required"],
    ])
    expect(emailPreferenceChanges(fd)).toEqual([])
  })

  test("a bogus type string changes nothing", () => {
    const fd = form([
      ["type", "not-a-real-type"],
      ["email", "not-a-real-type"],
    ])
    expect(emailPreferenceChanges(fd)).toEqual([])
  })
})

describe("setNotificationEmailCore", () => {
  const recorder = (fail?: unknown) => {
    const calls: unknown[] = []
    return {
      calls,
      api: {
        set: async (input: unknown) => {
          calls.push(input)
          if (fail) throw fail
          return []
        },
      },
    }
  }
  const form = (entries: [string, string][]) => {
    const fd = new FormData()
    for (const [key, value] of entries) fd.append(key, value)
    return fd
  }
  const changed = form([
    ["type", "member.role_changed"],
    ["type", "member.removed"],
    ["wasEmail", "member.role_changed"],
    ["email", "member.removed"],
  ])
  const unchanged = form([
    ["type", "member.role_changed"],
    ["wasEmail", "member.role_changed"],
    ["email", "member.role_changed"],
  ])

  test("one set call per change", async () => {
    const r = recorder()
    expect(await setNotificationEmailCore({ api: r.api as never }, changed)).toEqual({
      ok: true,
      message: "Email settings saved.",
    })
    expect(r.calls).toEqual([
      { type: "member.role_changed", email: false },
      { type: "member.removed", email: true },
    ])
  })

  test("nothing changed calls the api not at all, and still succeeds", async () => {
    const r = recorder()
    expect(await setNotificationEmailCore({ api: r.api as never }, unchanged)).toEqual({
      ok: true,
      message: "Email settings saved.",
    })
    expect(r.calls).toEqual([])
  })

  test("impersonating is refused with its own message, in the page's language", async () => {
    const r = recorder(new ORPCError("FORBIDDEN", { message: "Not available while impersonating" }))
    expect(await setNotificationEmailCore({ api: r.api as never }, changed)).toEqual({
      ok: false,
      message: "Not available while impersonating.",
    })
    expect(await setNotificationEmailCore({ api: r.api as never, locale: "sv" }, changed)).toEqual({
      ok: false,
      message: "Inte tillgängligt när du agerar som en annan användare.",
    })
  })

  test("a partial write: the first change lands, a later one fails, the answer is a failure", async () => {
    // Why the action refreshes on failure too: the server now differs from the render.
    const calls: unknown[] = []
    const api = {
      set: async (input: { type: string }) => {
        calls.push(input)
        if (input.type === "member.removed") throw new TypeError("fetch failed")
        return []
      },
    }
    expect(await setNotificationEmailCore({ api: api as never }, changed)).toEqual({
      ok: false,
      message: "Couldn't save your email settings. Try again.",
    })
    expect(calls).toEqual([
      { type: "member.role_changed", email: false },
      { type: "member.removed", email: true },
    ])
  })

  test("any other failure is the generic message", async () => {
    const r = recorder(new TypeError("fetch failed"))
    expect(await setNotificationEmailCore({ api: r.api as never, locale: "sv" }, changed)).toEqual({
      ok: false,
      message: "Det gick inte att spara dina e-postinställningar. Försök igen.",
    })
  })
})
