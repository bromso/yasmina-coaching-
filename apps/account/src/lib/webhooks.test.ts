import { describe, expect, test } from "bun:test"
import { entitlementsFor } from "@repo/api-contract"
import { deliveriesByEndpoint, listsWebhooks, webhooksGate } from "./webhooks"
import {
  dismissCreatedWebhookSecret,
  dismissRotatedWebhookSecret,
  focusWebhooksHeading,
  focusWebhooksHeadingAfterDelete,
  WEBHOOKS_HEADING_ID,
} from "./webhooks-focus"

const free = entitlementsFor({ subscription: null, memberCount: 1, portalAvailable: false })
const pro = entitlementsFor({
  subscription: {
    plan: "pro",
    interval: "month",
    status: "active",
    currentPeriodEnd: "2026-11-02T00:00:00.000Z",
    cancelAtPeriodEnd: false,
  },
  memberCount: 1,
  portalAvailable: true,
})

describe("webhooksGate", () => {
  test("below admin is always membersOnly, whatever the plan", () => {
    expect(webhooksGate("viewer", pro)).toBe("membersOnly")
    expect(webhooksGate("member", free)).toBe("membersOnly")
  })

  test("admin or owner on Free is upsell", () => {
    expect(webhooksGate("admin", free)).toBe("upsell")
    expect(webhooksGate("owner", free)).toBe("upsell")
  })

  test("admin or owner on a plan with the api feature is manage", () => {
    expect(webhooksGate("admin", pro)).toBe("manage")
    expect(webhooksGate("owner", pro)).toBe("manage")
  })
})

describe("listsWebhooks", () => {
  test("an admin or owner gets the list on every plan, so a Free workspace's endpoints can be deleted", () => {
    expect(listsWebhooks("manage")).toBe(true)
    expect(listsWebhooks("upsell")).toBe(true)
  })

  test("below admin the list is never fetched (the api would refuse it)", () => {
    expect(listsWebhooks("membersOnly")).toBe(false)
  })
})

describe("focusWebhooksHeading", () => {
  /** A stand-in document: records which id was looked up and whether it was focused. */
  function fakeDocument(present = true) {
    const calls = { lookedUp: [] as string[], focused: 0 }
    const doc = {
      getElementById(id: string) {
        calls.lookedUp.push(id)
        return present ? ({ focus: () => calls.focused++ } as unknown as HTMLElement) : null
      },
    }
    return { doc, calls }
  }

  test("focuses the Webhooks card's heading", () => {
    const { doc, calls } = fakeDocument()
    focusWebhooksHeading(doc)
    expect(calls).toEqual({ lookedUp: [WEBHOOKS_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusWebhooksHeading(doc)).not.toThrow()
  })
})

describe("focusWebhooksHeadingAfterDelete", () => {
  function fakeDocument() {
    const calls = { lookedUp: [] as string[], focused: 0 }
    const doc = {
      getElementById(id: string) {
        calls.lookedUp.push(id)
        return { focus: () => calls.focused++ } as unknown as HTMLElement
      },
    }
    return { doc, calls }
  }

  test("a successful delete focuses the card's title (the row's button just unmounted)", () => {
    const { doc, calls } = fakeDocument()
    focusWebhooksHeadingAfterDelete({ ok: true, message: "Webhook endpoint deleted." }, doc)
    expect(calls).toEqual({ lookedUp: [WEBHOOKS_HEADING_ID], focused: 1 })
  })

  test("a refusal, or the initial state, leaves focus where it is", () => {
    const { doc, calls } = fakeDocument()
    focusWebhooksHeadingAfterDelete({ ok: false, message: "Webhook endpoint not found" }, doc)
    focusWebhooksHeadingAfterDelete({ ok: false }, doc)
    expect(calls).toEqual({ lookedUp: [], focused: 0 })
  })
})

describe("dismissCreatedWebhookSecret (Done, with JavaScript)", () => {
  function setup() {
    const calls = { prevented: 0, remounted: 0, focused: 0 }
    const event = { preventDefault: () => calls.prevented++ }
    const doc = {
      getElementById: () => ({ focus: () => calls.focused++ }) as unknown as HTMLElement,
    }
    return { calls, event, doc }
  }

  test("cancels the link's navigation, remounts the add section (dropping the secret) and focuses the title", () => {
    const { calls, event, doc } = setup()
    dismissCreatedWebhookSecret(event, () => calls.remounted++, doc)
    expect(calls).toEqual({ prevented: 1, remounted: 1, focused: 1 })
  })
})

describe("deliveriesByEndpoint", () => {
  const row = (id: number) => ({
    id,
    eventId: `msg_${id}`,
    eventType: "note.created" as const,
    attempt: 1,
    status: 204,
    error: null,
    durationMs: 5,
    createdAt: "2026-10-19T00:00:00.000Z",
  })

  test("each endpoint's deliveries, keyed by its id", async () => {
    const result = await deliveriesByEndpoint([{ id: 1 }, { id: 2 }], async (id) => ({
      items: [row(id * 10)],
    }))
    expect(result).toEqual({ 1: [row(10)], 2: [row(20)] })
  })

  test("an endpoint deleted between the list and its deliveries is empty, not a failed page", async () => {
    const result = await deliveriesByEndpoint([{ id: 1 }, { id: 2 }], async (id) => {
      if (id === 2) throw new Error("Webhook endpoint not found")
      return { items: [row(1)] }
    })
    expect(result).toEqual({ 1: [row(1)], 2: [] })
  })
})

describe("dismissRotatedWebhookSecret (a row's Done, with JavaScript)", () => {
  test("cancels the navigation and remounts the row's rotate section, leaving focus to it", () => {
    const calls = { prevented: 0, remounted: 0 }
    dismissRotatedWebhookSecret(
      { preventDefault: () => calls.prevented++ },
      () => calls.remounted++
    )
    expect(calls).toEqual({ prevented: 1, remounted: 1 })
  })
})
