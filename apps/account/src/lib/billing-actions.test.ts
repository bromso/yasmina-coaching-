import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { type Billing, entitlementsFor } from "@repo/api-contract"
import {
  type BillingApi,
  type BillingDeps,
  changeMockPlanCore,
  openPortalCore,
  startCheckoutCore,
} from "./billing-actions"

const form = (fields: Record<string, string>) => {
  const fd = new FormData()
  for (const [k, v] of Object.entries(fields)) fd.set(k, v)
  return fd
}
const defined = (code: string, message: string) => new ORPCError(code, { message, defined: true })
const fail = (code: string, message: string) => async () => {
  throw defined(code, message)
}

const billingOn = (plan: "pro" | "team"): Billing => ({
  ...entitlementsFor({
    subscription: {
      plan,
      interval: "month",
      status: "active",
      currentPeriodEnd: "2026-11-02T00:00:00.000Z",
      cancelAtPeriodEnd: false,
    },
    memberCount: 2,
    portalAvailable: false,
  }),
  provider: "mock",
})

const fakeApi: BillingApi = {
  checkout: async () => ({ url: "https://checkout.example.com/s/1" }),
  portal: async () => ({ url: "https://billing.example.com/p/1" }),
  mockChange: async (input) => billingOn(input.plan === "team" ? "team" : "pro"),
}
const deps = (api: Partial<BillingApi> = {}): BillingDeps => ({
  api: { ...fakeApi, ...api },
  workspaceId: 5,
})

describe("startCheckoutCore", () => {
  test("starts a checkout for the current workspace and returns its url", async () => {
    let seen: unknown
    const d = deps({
      checkout: async (input) => {
        seen = input
        return { url: "https://checkout.example.com/s/1" }
      },
    })
    expect(
      await startCheckoutCore(d, form({ plan: "team", interval: "year", workspaceId: "99" }))
    ).toEqual({ ok: true, url: "https://checkout.example.com/s/1" })
    // The workspace comes from the deps, never from the form.
    expect(seen).toEqual({ workspaceId: 5, plan: "team", interval: "year" })
  })

  test("an unknown plan is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      checkout: async () => {
        called = true
        return { url: "https://checkout.example.com/s/1" }
      },
    })
    const out = await startCheckoutCore(d, form({ plan: "free", interval: "month" }))
    expect(out.ok).toBe(false)
    expect(!out.ok && out.fieldErrors?.plan).toBeTruthy()
    expect(!out.ok && out.values).toEqual({ plan: "free", interval: "month" })
    expect(called).toBe(false)
  })

  test("a missing interval is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      checkout: async () => {
        called = true
        return { url: "https://checkout.example.com/s/1" }
      },
    })
    const out = await startCheckoutCore(d, form({ plan: "pro" }))
    expect(!out.ok && out.fieldErrors?.interval).toBeTruthy()
    expect(called).toBe(false)
  })

  test("CONFLICT passes the api's message through", async () => {
    const d = deps({ checkout: fail("CONFLICT", "Use the billing portal to change your plan") })
    expect(await startCheckoutCore(d, form({ plan: "pro", interval: "month" }))).toEqual({
      ok: false,
      message: "Use the billing portal to change your plan",
      values: { plan: "pro", interval: "month" },
    })
  })

  test("BAD_REQUEST and a non-owner's FORBIDDEN pass through", async () => {
    const bad = deps({ checkout: fail("BAD_REQUEST", "This plan is not available") })
    const out = await startCheckoutCore(bad, form({ plan: "pro", interval: "month" }))
    expect(!out.ok && out.message).toBe("This plan is not available")
    const forbidden = deps({ checkout: fail("FORBIDDEN", "Requires the owner role") })
    const out2 = await startCheckoutCore(forbidden, form({ plan: "pro", interval: "month" }))
    expect(!out2.ok && out2.message).toBe("Requires the owner role")
  })
})

describe("openPortalCore", () => {
  test("returns the portal url for the current workspace", async () => {
    let seen: unknown
    const d = deps({
      portal: async (input) => {
        seen = input
        return { url: "https://billing.example.com/p/1" }
      },
    })
    expect(await openPortalCore(d)).toEqual({ ok: true, url: "https://billing.example.com/p/1" })
    expect(seen).toEqual({ workspaceId: 5 })
  })

  test("NOT_FOUND passes the api's message through", async () => {
    const d = deps({ portal: fail("NOT_FOUND", "No billing account yet") })
    expect(await openPortalCore(d)).toEqual({ ok: false, message: "No billing account yet" })
  })
})

describe("changeMockPlanCore", () => {
  test("switches the plan and names it", async () => {
    let seen: unknown
    const d = deps({
      mockChange: async (input) => {
        seen = input
        return billingOn("team")
      },
    })
    expect(await changeMockPlanCore(d, form({ plan: "team", interval: "year" }))).toEqual({
      ok: true,
      message: "You're on Team.",
    })
    expect(seen).toEqual({ workspaceId: 5, plan: "team", interval: "year" })
  })

  test("cancel needs no interval and says so", async () => {
    let seen: unknown
    const d = deps({
      mockChange: async (input) => {
        seen = input
        return { ...billingOn("pro"), cancelAtPeriodEnd: true }
      },
    })
    expect(await changeMockPlanCore(d, form({ plan: "cancel" }))).toEqual({
      ok: true,
      message: "Subscription cancelled.",
    })
    expect(seen).toEqual({ workspaceId: 5, plan: "cancel", interval: "month" })
  })

  test("an unknown plan is a field error and never reaches the api", async () => {
    let called = false
    const d = deps({
      mockChange: async () => {
        called = true
        return billingOn("pro")
      },
    })
    const out = await changeMockPlanCore(d, form({ plan: "enterprise", interval: "month" }))
    expect(!out.ok && out.fieldErrors?.plan).toBeTruthy()
    expect(called).toBe(false)
  })

  test("NOT_FOUND passes the api's message through", async () => {
    const d = deps({ mockChange: fail("NOT_FOUND", "Mock billing is not enabled") })
    const out = await changeMockPlanCore(d, form({ plan: "pro", interval: "month" }))
    expect(!out.ok && out.message).toBe("Mock billing is not enabled")
  })
})
