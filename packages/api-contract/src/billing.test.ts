import { describe, expect, test } from "bun:test"
import {
  entitlementsFor,
  FEATURE_COPY,
  FEATURE_MESSAGES,
  FEATURES,
  featureCopy,
  hasFeature,
  PLANS,
  SEAT_LIMIT_MESSAGE,
  seatsLeft,
} from "./billing"

const sub = (
  over: Partial<Parameters<typeof entitlementsFor>[0]["subscription"] & object> = {}
) => ({
  plan: "pro" as const,
  interval: "month" as const,
  status: "active" as const,
  currentPeriodEnd: "2026-11-02T00:00:00.000Z",
  cancelAtPeriodEnd: false,
  ...over,
})

describe("entitlementsFor", () => {
  test("no subscription is the Free plan", () => {
    const e = entitlementsFor({ subscription: null, memberCount: 2, portalAvailable: false })
    expect(e).toEqual({
      plan: "free",
      planName: "Free",
      status: "none",
      features: [],
      seatLimit: 3,
      seatsUsed: 2,
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
      interval: null,
      portalAvailable: false,
    })
  })
  test.each([
    ["active", "pro", true],
    ["trialing", "pro", true],
    ["past_due", "pro", true],
    ["canceled", "free", false],
    ["unpaid", "free", false],
    ["incomplete", "free", false],
  ] as const)("status %s resolves to %s", (status, plan, entitled) => {
    const e = entitlementsFor({
      subscription: sub({ status }),
      memberCount: 1,
      portalAvailable: true,
    })
    expect(e.plan).toBe(plan)
    expect(e.status).toBe(status)
    expect(e.currentPeriodEnd).toBe(entitled ? "2026-11-02T00:00:00.000Z" : null)
    expect(e.interval).toBe(entitled ? "month" : null)
    expect(e.cancelAtPeriodEnd).toBe(false)
  })
  test("an active subscription set to cancel surfaces cancelAtPeriodEnd", () => {
    const e = entitlementsFor({
      subscription: sub({ cancelAtPeriodEnd: true }),
      memberCount: 1,
      portalAvailable: true,
    })
    expect(e.cancelAtPeriodEnd).toBe(true)
  })
  test("a team subscription has no seat limit and the chat feature", () => {
    const e = entitlementsFor({
      subscription: sub({ plan: "team" }),
      memberCount: 40,
      portalAvailable: true,
    })
    expect(e.seatLimit).toBeNull()
    expect(seatsLeft(e)).toBeNull()
    expect(hasFeature(e, "chat")).toBe(true)
  })
  test("seatsLeft counts down and never goes negative", () => {
    const e = entitlementsFor({ subscription: null, memberCount: 5, portalAvailable: false })
    expect(seatsLeft(e)).toBe(0)
  })
})

describe("PLANS", () => {
  test("free has no features and the limits ascend", () => {
    expect(PLANS.free.features).toEqual([])
    expect(PLANS.free.seatLimit).toBe(3)
    expect(PLANS.pro.seatLimit).toBe(10)
    expect(PLANS.team.seatLimit).toBeNull()
    expect(PLANS.pro.features).toEqual(FEATURES)
    expect(SEAT_LIMIT_MESSAGE).toBe("This workspace has reached its member limit")
  })
})

test("FEATURE_MESSAGES derives from FEATURE_COPY, one entry per feature", () => {
  expect(Object.keys(FEATURE_COPY)).toEqual([...FEATURES])
  for (const f of FEATURES) {
    expect(FEATURE_MESSAGES[f]).toBe(FEATURE_COPY[f].upgradeMessage)
    expect(featureCopy(f)).toBe(FEATURE_COPY[f])
  }
})
