import { expect, test } from "bun:test"
import { FEATURE_COPY, PLAN_KEYS, PLANS } from "@repo/api-contract"
import { tiersFromPlans } from "./home"

test("pricing tiers derive their names from PLANS, in PLAN_KEYS order", () => {
  const tiers = tiersFromPlans()
  expect(tiers.map((t) => t.name)).toEqual(PLAN_KEYS.map((key) => PLANS[key].name))
})

test("pricing tiers render the plan's monthly price", () => {
  const [free, pro, team] = tiersFromPlans()
  expect(free?.price).toBe("$0")
  expect(pro?.price).toBe("$19")
  expect(team?.price).toBe("$49")
})

test("only the free tier is billed /forever, the rest /month", () => {
  const [free, pro, team] = tiersFromPlans()
  expect(free?.period).toBe("/forever")
  expect(pro?.period).toBe("/month")
  expect(team?.period).toBe("/month")
})

test("paid tiers list AI chat and API access (FEATURE_COPY) and their seat limit, free lists neither", () => {
  const [free, pro, team] = tiersFromPlans()
  expect(FEATURE_COPY.api.label).toBe("API access")
  expect(free?.features).not.toContain(FEATURE_COPY.chat.label)
  expect(free?.features).not.toContain(FEATURE_COPY.api.label)
  expect(free?.features).toContain("Up to 3 members")
  expect(pro?.features).toContain(FEATURE_COPY.chat.label)
  expect(pro?.features).toContain(FEATURE_COPY.api.label)
  expect(pro?.features).toContain("Up to 10 members")
  expect(team?.features).toContain(FEATURE_COPY.chat.label)
  expect(team?.features).toContain(FEATURE_COPY.api.label)
  expect(team?.features).toContain("Unlimited members")
})

test("pro and team CTAs carry their plan key, pro is the highlighted tier", () => {
  const [free, pro, team] = tiersFromPlans()
  expect(pro?.cta.href.endsWith("/signup?plan=pro")).toBe(true)
  expect(team?.cta.href.endsWith("/signup?plan=team")).toBe(true)
  expect(pro?.highlighted).toBe(true)
  expect(free?.highlighted).not.toBe(true)
  expect(team?.highlighted).not.toBe(true)
})
