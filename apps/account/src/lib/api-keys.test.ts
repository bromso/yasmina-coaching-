import { describe, expect, test } from "bun:test"
import { entitlementsFor } from "@repo/api-contract"
import { apiKeysGate, listsApiKeys } from "./api-keys"
import {
  API_KEYS_HEADING_ID,
  dismissCreatedKey,
  focusApiKeysHeading,
  focusApiKeysHeadingAfterRevoke,
} from "./api-keys-focus"

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

describe("apiKeysGate", () => {
  test("below admin is always membersOnly, whatever the plan", () => {
    expect(apiKeysGate("viewer", pro)).toBe("membersOnly")
    expect(apiKeysGate("member", free)).toBe("membersOnly")
  })

  test("admin or owner on Free is upsell", () => {
    expect(apiKeysGate("admin", free)).toBe("upsell")
    expect(apiKeysGate("owner", free)).toBe("upsell")
  })

  test("admin or owner on a plan with the api feature is manage", () => {
    expect(apiKeysGate("admin", pro)).toBe("manage")
    expect(apiKeysGate("owner", pro)).toBe("manage")
  })
})

describe("listsApiKeys", () => {
  test("an admin or owner gets the list on every plan, so a Free workspace's keys can be revoked", () => {
    expect(listsApiKeys("manage")).toBe(true)
    expect(listsApiKeys("upsell")).toBe(true)
  })

  test("below admin the list is never fetched (the api would refuse it)", () => {
    expect(listsApiKeys("membersOnly")).toBe(false)
  })
})

describe("focusApiKeysHeading", () => {
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

  test("focuses the API keys card's heading", () => {
    const { doc, calls } = fakeDocument()
    focusApiKeysHeading(doc)
    expect(calls).toEqual({ lookedUp: [API_KEYS_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusApiKeysHeading(doc)).not.toThrow()
  })
})

describe("focusApiKeysHeadingAfterRevoke", () => {
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

  test("a successful revoke focuses the card's title (the row's button just unmounted)", () => {
    const { doc, calls } = fakeDocument()
    focusApiKeysHeadingAfterRevoke({ ok: true, message: "API key revoked." }, doc)
    expect(calls).toEqual({ lookedUp: [API_KEYS_HEADING_ID], focused: 1 })
  })

  test("a refusal, or the initial state, leaves focus where it is", () => {
    const { doc, calls } = fakeDocument()
    focusApiKeysHeadingAfterRevoke({ ok: false, message: "API key not found" }, doc)
    focusApiKeysHeadingAfterRevoke({ ok: false }, doc)
    expect(calls).toEqual({ lookedUp: [], focused: 0 })
  })
})

describe("dismissCreatedKey (Done, with JavaScript)", () => {
  function setup() {
    const calls = { prevented: 0, remounted: 0, focused: 0 }
    const event = { preventDefault: () => calls.prevented++ }
    const doc = {
      getElementById: () => ({ focus: () => calls.focused++ }) as unknown as HTMLElement,
    }
    return { calls, event, doc }
  }

  test("cancels the link's navigation, remounts the create section (dropping the key) and focuses the title", () => {
    const { calls, event, doc } = setup()
    dismissCreatedKey(event, () => calls.remounted++, doc)
    expect(calls).toEqual({ prevented: 1, remounted: 1, focused: 1 })
  })
})
