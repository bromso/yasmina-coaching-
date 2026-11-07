import { describe, expect, test } from "bun:test"
import type { WorkspaceActivityItem } from "@repo/api-contract"
import { WORKSPACE_ACTIVITY_ACTIONS } from "@repo/api-contract/workspace-activity"
import { createFormatter } from "next-intl"
import {
  ACTION_KEYS,
  activityHref,
  activityParams,
  activitySentence,
  actorLabel,
  readActivity,
} from "./activity"
import { accountTranslator } from "./i18n"
import { conjunction } from "./invite-domains"

const en = accountTranslator("en")
const sv = accountTranslator("sv")
const lists = {
  en: conjunction(createFormatter({ locale: "en", timeZone: "UTC" })),
  sv: conjunction(createFormatter({ locale: "sv", timeZone: "UTC" })),
}
/** The sentence in `t`'s language, lists formatted in the same one. */
const sentenceIn = (row: WorkspaceActivityItem, t: typeof en) =>
  activitySentence(row, t, t === sv ? lists.sv : lists.en)

const CURSOR = "2026-10-01T12:00:00.000Z_42"

const item = (
  action: WorkspaceActivityItem["action"],
  details: WorkspaceActivityItem["details"] = {},
  target: WorkspaceActivityItem["target"] = null
): WorkspaceActivityItem => ({
  id: 1,
  at: "2026-10-01T12:00:00.000Z",
  action,
  actor: { kind: "system" },
  target,
  details,
})

const user = (label: string | null) => ({ type: "user" as const, id: "7", label })
const hook = { type: "webhook" as const, id: "3", label: "hooks.example.com" }
const key = { type: "api_key" as const, id: "4", label: "Deploy bot" }

describe("activityParams", () => {
  test("reads the card's own parameters", () => {
    expect(activityParams({ activityAction: "workspace.renamed", activityCursor: CURSOR })).toEqual(
      { action: "workspace.renamed", cursor: CURSOR }
    )
  })

  test("takes the first of a repeated parameter", () => {
    expect(activityParams({ activityAction: ["member.removed", "workspace.left"] })).toEqual({
      action: "member.removed",
    })
  })

  test("drops what the api would refuse: an unknown action, a malformed or impossible cursor", () => {
    expect(activityParams({ activityAction: "note.created" })).toEqual({})
    expect(activityParams({ activityAction: "" })).toEqual({})
    expect(activityParams({ activityCursor: "nope" })).toEqual({})
    expect(activityParams({ activityCursor: "2026-02-31T12:00:00.000Z_1" })).toEqual({})
    expect(activityParams({ activityCursor: "2026-10-01T12:00:00.000Z_0" })).toEqual({})
  })

  test("ignores every other parameter", () => {
    expect(
      activityParams({ checkout: "success", cursor: CURSOR, action: "workspace.left" })
    ).toEqual({})
  })
})

describe("activityHref", () => {
  test("the first page of everything is the page itself, landing on the card", () => {
    expect(activityHref({})).toBe("/workspace#activity-heading")
  })

  test("keeps the filter on every page", () => {
    expect(activityHref({ action: "invitation.created" })).toBe(
      "/workspace?activityAction=invitation.created#activity-heading"
    )
    expect(activityHref({ action: "invitation.created", cursor: CURSOR })).toBe(
      `/workspace?activityAction=invitation.created&activityCursor=${encodeURIComponent(CURSOR)}#activity-heading`
    )
  })

  test("a cursor alone, and it round-trips through activityParams", () => {
    const href = activityHref({ cursor: CURSOR })
    const query = new URL(href, "http://x").searchParams
    expect(activityParams(Object.fromEntries(query))).toEqual({ cursor: CURSOR })
  })
})

describe("actorLabel", () => {
  test("a member by name, an unnamed one as such", () => {
    const member = { kind: "member" as const, userId: 1, email: null, bySupport: false }
    expect(actorLabel({ ...member, name: "Ada" }, en)).toBe("Ada")
    expect(actorLabel({ ...member, name: " " }, en)).toBe("Unnamed member")
    expect(actorLabel({ ...member, name: "Ada", bySupport: true }, en)).toBe("Ada")
  })

  test("an API key, the system and a deleted account", () => {
    expect(actorLabel({ kind: "apiKey", id: 1, name: "CI" }, en)).toBe("API key CI")
    expect(actorLabel({ kind: "apiKey", id: 1, name: "" }, en)).toBe("An API key")
    expect(actorLabel({ kind: "system" }, en)).toBe("System")
    expect(actorLabel({ kind: "deleted" }, en)).toBe("Deleted user")
  })

  test("a plan change: an upgrade, a move to Free or a cancellation, and a past-due status", () => {
    const sentence = (details: WorkspaceActivityItem["details"]) =>
      sentenceIn(item("workspace.plan_changed", details), en)
    // An upgrade names the plan and how it is billed.
    expect(sentence({ plan: "team", interval: "year", status: "active" })).toBe(
      "Changed the plan to Team, billed yearly."
    )
    expect(sentence({ plan: "pro", interval: "month", status: "trialing" })).toBe(
      "Changed the plan to Pro, billed monthly (trial)."
    )
    // A cancellation lands on Free: never "billed monthly", never "(canceled)" tacked on.
    expect(sentence({ plan: "free", interval: "month", status: "canceled" })).toBe(
      "Canceled the paid plan; the workspace is now on Free."
    )
    // A cancellation row that still carries the old paid plan reads the same.
    expect(sentence({ plan: "pro", interval: "year", status: "canceled" })).toBe(
      "Canceled the paid plan; the workspace is now on Free."
    )
    // A downgrade to Free for another reason keeps its status, but drops the billing interval.
    expect(sentence({ plan: "free", interval: "month", status: "unpaid" })).toBe(
      "Changed the plan to Free (unpaid)."
    )
    expect(sentence({ plan: "free", interval: "month" })).toBe("Changed the plan to Free.")
    // Past due keeps the paid plan: its interval and the status both show.
    expect(sentence({ plan: "team", interval: "month", status: "past_due" })).toBe(
      "Changed the plan to Team, billed monthly (past due)."
    )
  })

  test("in Swedish", () => {
    expect(actorLabel({ kind: "apiKey", id: 1, name: "CI" }, sv)).toBe("API-nyckeln CI")
    expect(actorLabel({ kind: "system" }, sv)).toBe("Systemet")
    expect(actorLabel({ kind: "deleted" }, sv)).toBe("Borttagen användare")
    expect(sv("activity.bySupport")).toBe("av supporten")
    expect(en("activity.bySupport")).toBe("by support")
  })
})

describe("activitySentence", () => {
  test("each action, with its details, in English", () => {
    const cases: [WorkspaceActivityItem, string][] = [
      [item("workspace.created", { name: "Acme" }), "Created the workspace Acme."],
      [
        item("workspace.renamed", { from: "Acme", to: "Acme Inc" }),
        "Renamed the workspace from Acme to Acme Inc.",
      ],
      [item("workspace.logo_set"), "Changed the workspace logo."],
      [item("workspace.logo_removed"), "Removed the workspace logo."],
      [
        item("workspace.ownership_transferred", {}, user("Grace")),
        "Transferred ownership to Grace.",
      ],
      [
        item("workspace.plan_changed", { plan: "pro", interval: "year", status: "active" }),
        "Changed the plan to Pro, billed yearly.",
      ],
      [
        item("workspace.plan_changed", { plan: "team", interval: "month", status: "past_due" }),
        "Changed the plan to Team, billed monthly (past due).",
      ],
      [
        item("workspace.plan_changed", { plan: "free", interval: "month", status: "canceled" }),
        "Canceled the paid plan; the workspace is now on Free.",
      ],
      [
        item("invitation.accepted", { role: "member" }, user("Grace")),
        "Joined the workspace as Member.",
      ],
      [
        item("member.role_changed", { from: "member", to: "admin" }, user("Grace")),
        "Changed the role of Grace from Member to Admin.",
      ],
      [item("member.removed", {}, user("Grace")), "Removed Grace from the workspace."],
      [item("workspace.left", {}, user("Grace")), "Left the workspace."],
      [
        item("invitation.created", { role: "viewer", email: "g***@example.com" }),
        "Invited g***@example.com as Viewer.",
      ],
      [
        item("invitation.revoked", { role: "viewer", email: "g***@example.com" }),
        "Revoked the invitation for g***@example.com.",
      ],
      [
        item(
          "workspace.api_key_created",
          { name: "Deploy bot", scopes: ["notes:read", "notes:write"] },
          key
        ),
        "Created the API key Deploy bot with the scopes notes:read, notes:write.",
      ],
      [
        item("workspace.api_key_revoked", { name: "Deploy bot" }, key),
        "Revoked the API key Deploy bot.",
      ],
      [
        item(
          "workspace.webhook_created",
          { host: "hooks.example.com", events: ["note.created"] },
          hook
        ),
        "Added the webhook endpoint hooks.example.com for note.created.",
      ],
      [
        item(
          "workspace.webhook_updated",
          { host: "hooks.example.com", events: ["note.created", "note.deleted"] },
          hook
        ),
        "Updated the webhook endpoint hooks.example.com, which now receives note.created, note.deleted.",
      ],
      [
        item("workspace.webhook_secret_rotated", { host: "hooks.example.com" }, hook),
        "Rotated the signing secret of the webhook endpoint hooks.example.com.",
      ],
      [
        item("workspace.webhook_deleted", { host: "hooks.example.com" }, hook),
        "Deleted the webhook endpoint hooks.example.com.",
      ],
      [
        item("workspace.webhook_disabled", { host: "hooks.example.com", reason: "failures" }, hook),
        "Turned off the webhook endpoint hooks.example.com after repeated failed deliveries.",
      ],
      [
        item("workspace.webhook_disabled", { host: "hooks.example.com", reason: "gone" }, hook),
        "Turned off the webhook endpoint hooks.example.com because it answered 410 Gone.",
      ],
    ]
    for (const [row, sentence] of cases) expect(sentenceIn(row, en)).toBe(sentence)
  })

  test("a row with no details still reads as a sentence, never a raw key or placeholder", () => {
    for (const locale of [en, sv]) {
      for (const action of WORKSPACE_ACTIVITY_ACTIONS) {
        const sentence = sentenceIn(item(action), locale)
        expect(sentence).not.toContain("{")
        expect(sentence).not.toContain("activity.")
        expect(sentence.endsWith(".")).toBe(true)
      }
    }
    expect(sentenceIn(item("member.removed", {}, user(null)), en)).toBe(
      "Removed a former member from the workspace."
    )
    expect(sentenceIn(item("workspace.renamed"), en)).toBe("Renamed the workspace.")
    expect(sentenceIn(item("invitation.created"), en)).toBe("Invited someone.")
    expect(sentenceIn(item("workspace.api_key_revoked"), en)).toBe("Revoked an API key.")
    expect(sentenceIn(item("workspace.webhook_deleted"), en)).toBe("Deleted a webhook endpoint.")
  })

  test("reads whether the two-step requirement was turned on or off", () => {
    const changed = "workspace.two_factor_requirement_changed" as const
    expect(sentenceIn(item(changed, { enabled: true }), en)).toBe(
      "Required two-step verification for all members."
    )
    expect(sentenceIn(item(changed, { enabled: false }), en)).toBe(
      "Stopped requiring two-step verification."
    )
    expect(sentenceIn(item(changed, { enabled: true }), sv)).toBe(
      "Krävde tvåstegsverifiering för alla medlemmar."
    )
    expect(sentenceIn(item(changed, { enabled: false }), sv)).toBe(
      "Slutade kräva tvåstegsverifiering."
    )
  })

  test("an allowed-domains change: what it added and removed, as lists, in each language", () => {
    const changed = "workspace.invite_domains_changed" as const
    const row = (added?: string[], removed?: string[]) =>
      item(changed, { ...(added ? { added } : {}), ...(removed ? { removed } : {}) })
    expect(sentenceIn(row(["acme.com", "acme.se"], ["old.com"]), en)).toBe(
      "Changed the allowed invitation domains: added acme.com and acme.se, removed old.com."
    )
    expect(sentenceIn(row(["acme.com", "acme.se", "acme.no"]), en)).toBe(
      "Changed the allowed invitation domains: added acme.com, acme.se, and acme.no."
    )
    expect(sentenceIn(row([], ["old.com"]), en)).toBe(
      "Changed the allowed invitation domains: removed old.com."
    )
    expect(sentenceIn(row(), en)).toBe("Changed the allowed invitation domains.")
    // Stored as A-labels, read in their Unicode form.
    expect(sentenceIn(row(["xn--bcher-kva.de"]), en)).toBe(
      "Changed the allowed invitation domains: added bücher.de."
    )
    expect(sentenceIn(row(["acme.com", "acme.se", "acme.no"], ["old.com"]), sv)).toBe(
      "Ändrade de tillåtna inbjudningsdomänerna: lade till acme.com, acme.se och acme.no, tog bort old.com."
    )
    expect(sentenceIn(row(undefined, ["old.com"]), sv)).toBe(
      "Ändrade de tillåtna inbjudningsdomänerna: tog bort old.com."
    )
    expect(en(`activity.filters.${ACTION_KEYS[changed]}`)).toBe("Invitation domain changes")
    expect(sv(`activity.filters.${ACTION_KEYS[changed]}`)).toBe("Ändrade inbjudningsdomäner")
  })

  test("falls back to the target's label for a key's name and an endpoint's host", () => {
    expect(sentenceIn(item("workspace.api_key_revoked", {}, key), en)).toBe(
      "Revoked the API key Deploy bot."
    )
    expect(sentenceIn(item("workspace.webhook_deleted", {}, hook), en)).toBe(
      "Deleted the webhook endpoint hooks.example.com."
    )
  })

  test("in Swedish", () => {
    expect(sentenceIn(item("invitation.accepted", { role: "admin" }), sv)).toBe(
      "Gick med i arbetsytan som Administratör."
    )
    expect(
      sentenceIn(item("member.role_changed", { from: "viewer", to: "member" }, user("Grace")), sv)
    ).toBe("Ändrade rollen för Grace från Läsare till Medlem.")
    expect(sentenceIn(item("workspace.plan_changed", { plan: "pro", interval: "month" }), sv)).toBe(
      "Ändrade planen till Pro, debiteras månadsvis."
    )
    expect(
      sentenceIn(
        item("workspace.plan_changed", { plan: "free", interval: "year", status: "canceled" }),
        sv
      )
    ).toBe("Sade upp den betalda planen; arbetsytan har nu Free.")
    expect(sentenceIn(item("workspace.webhook_secret_rotated", {}, hook), sv)).toBe(
      "Bytte signeringsnyckeln för webhook-mottagaren hooks.example.com."
    )
    expect(sentenceIn(item("workspace.webhook_disabled", { reason: "gone" }, hook), sv)).toBe(
      "Stängde av webhook-mottagaren hooks.example.com eftersom den svarade 410 Gone."
    )
  })

  test("every action has its own sentence and filter label, in both languages", () => {
    for (const action of WORKSPACE_ACTIVITY_ACTIONS) {
      const name = ACTION_KEYS[action]
      for (const t of [en, sv]) {
        expect(t(`activity.filters.${name}`)).not.toBe(`activity.filters.${name}`)
        expect(t(`activity.actions.${name}`)).not.toBe(`activity.actions.${name}`)
      }
      expect(sv(`activity.filters.${name}`)).not.toBe(en(`activity.filters.${name}`))
    }
    const labels = WORKSPACE_ACTIVITY_ACTIONS.map((action) =>
      en(`activity.filters.${ACTION_KEYS[action]}`)
    )
    expect(new Set(labels).size).toBe(labels.length)
  })
})

describe("readActivity", () => {
  test("the page when the read succeeds, null when it fails", async () => {
    const page = { items: [], nextCursor: null }
    expect(await readActivity(async () => page)).toBe(page)
    expect(
      await readActivity(async () => {
        throw new Error("api down")
      })
    ).toBeNull()
  })
})
