import { describe, expect, test } from "bun:test"
import { gateFailures, type Needs } from "./ci-gate"

const outputs = {
  docs_only: "false",
  storybook: "true",
  postgres: "true",
  e2e: "true",
  docker: '[{"dockerfile":"next","app":"app","port":3001}]',
}
const ran = (result: string, over: Partial<Needs> = {}): Needs => ({
  changes: { result: "success", outputs },
  verify: { result },
  storybook: { result },
  "api-postgres": { result },
  e2e: { result },
  docker: { result },
  security: { result },
  ...over,
})

describe("gateFailures", () => {
  test("every planned job succeeded → passes", () => {
    expect(gateFailures(ran("success"))).toEqual([])
  })

  test("a failed or cancelled job fails the gate", () => {
    expect(gateFailures(ran("success", { e2e: { result: "failure" } }))).toEqual(["e2e: failure"])
    expect(gateFailures(ran("success", { verify: { result: "cancelled" } }))).toEqual([
      "verify: cancelled",
    ])
  })

  test("a planned job that never ran (skipped, no runner) fails the gate", () => {
    // What #69 hit: no runner was assigned, so nothing ran and nothing reported success.
    expect(gateFailures(ran("skipped"))).toEqual([
      "verify: skipped, but the plan required it",
      "storybook: skipped, but the plan required it",
      "api-postgres: skipped, but the plan required it",
      "e2e: skipped, but the plan required it",
      "docker: skipped, but the plan required it",
      "security: skipped, but the plan required it",
    ])
  })

  test("jobs the plan left out may be skipped", () => {
    const docsOnly: Needs = {
      ...ran("skipped"),
      // security carries no `if:` of its own — it runs (and must succeed) even on a docs-only
      // change, unlike every other gated job here.
      security: { result: "success" },
      changes: {
        result: "success",
        outputs: { docs_only: "true", storybook: "", postgres: "", e2e: "", docker: "[]" },
      },
    }
    expect(gateFailures(docsOnly)).toEqual([])
  })

  test("security is required even on a docs-only change", () => {
    const docsOnly: Needs = {
      ...ran("skipped"),
      security: { result: "skipped" },
      changes: {
        result: "success",
        outputs: { docs_only: "true", storybook: "", postgres: "", e2e: "", docker: "[]" },
      },
    }
    expect(gateFailures(docsOnly)).toEqual(["security: skipped, but the plan required it"])
  })

  test("the planner itself must succeed", () => {
    expect(gateFailures(ran("skipped", { changes: { result: "cancelled" } }))[0]).toBe(
      "changes: cancelled"
    )
  })

  test("an unknown result is not a pass", () => {
    expect(gateFailures(ran("success", { docker: { result: "neutral" } }))).toEqual([
      "docker: neutral",
    ])
  })
})
