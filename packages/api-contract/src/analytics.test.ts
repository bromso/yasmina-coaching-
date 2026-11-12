import { describe, expect, test } from "bun:test"
import {
  ANALYTICS_EVENT_NAMES,
  ANALYTICS_EVENTS,
  ANALYTICS_PROPS_MAX_BYTES,
  type AnalyticsEventName,
  AnalyticsIngestSchema,
  collapseRoute,
  isAnalyticsEventName,
  parseEventProps,
  propsByteLength,
} from "./analytics"

// Valid props for each event, used to prove its schema accepts its own shape.
const VALID_PROPS: Record<AnalyticsEventName, Record<string, unknown>> = {
  signed_up: { method: "password" },
  email_verified: {},
  workspace_created: {},
  member_invited: { role: "admin" },
  invitation_accepted: {},
  note_created: {},
  plan_changed: { plan: "pro", interval: "month" },
  two_factor_enabled: {},
  pricing_viewed: {},
  lead_submitted: { audience: "organisation", need: "team", timeline: "quarter" },
}

describe("ANALYTICS_EVENTS", () => {
  for (const name of ANALYTICS_EVENT_NAMES) {
    test(`${name}: accepts its own valid props`, () => {
      expect(parseEventProps(name, VALID_PROPS[name])).toEqual(VALID_PROPS[name])
    })

    test(`${name}: refuses an unknown prop key`, () => {
      expect(parseEventProps(name, { ...VALID_PROPS[name], nope: "x" })).toBeNull()
    })
  }

  test("lead_submitted carries the three fixed answers only, never free text", () => {
    expect(
      parseEventProps("lead_submitted", { audience: "private", need: "x", timeline: "month" })
    ).toBeNull()
    expect(
      parseEventProps("lead_submitted", { ...VALID_PROPS.lead_submitted, email: "a@b.c" })
    ).toBeNull()
    expect(ANALYTICS_EVENTS.lead_submitted.client).toBe(false)
  })

  test("signed_up.method only accepts the known providers", () => {
    expect(parseEventProps("signed_up", { method: "password" })).toEqual({ method: "password" })
    expect(parseEventProps("signed_up", { method: "carrier-pigeon" })).toBeNull()
  })

  test("missing props is treated as {}", () => {
    expect(parseEventProps("note_created", undefined)).toEqual({})
    expect(parseEventProps("note_created", null)).toEqual({})
  })

  test("a client-allowed event is marked client: true, every other client: false", () => {
    expect(ANALYTICS_EVENTS.pricing_viewed.client).toBe(true)
    for (const name of ANALYTICS_EVENT_NAMES) {
      if (name === "pricing_viewed") continue
      expect(ANALYTICS_EVENTS[name].client).toBe(false)
    }
  })

  test("isAnalyticsEventName tells known names from unknown ones", () => {
    expect(isAnalyticsEventName("note_created")).toBe(true)
    expect(isAnalyticsEventName("nonexistent_event")).toBe(false)
  })
})

describe("propsByteLength / ANALYTICS_PROPS_MAX_BYTES", () => {
  test("flags a payload over the cap, independent of any event's own field .max() length", () => {
    // Every current event's per-field .max() is small enough that no *valid* props object can
    // reach 1 KB — going through parseEventProps with an oversized field would always fail on
    // that field's own schema first, never on this check. Testing propsByteLength directly, with
    // a plain object no event schema would accept anyway, proves the cap itself is enforceable.
    const small = { a: "x" }
    const big = { a: "x".repeat(ANALYTICS_PROPS_MAX_BYTES + 100) }
    expect(propsByteLength(small)).toBeLessThan(ANALYTICS_PROPS_MAX_BYTES)
    expect(propsByteLength(big)).toBeGreaterThan(ANALYTICS_PROPS_MAX_BYTES)
  })
})

describe("parseEventProps", () => {
  test("refuses a prop of the wrong type", () => {
    expect(parseEventProps("member_invited", { role: 123 })).toBeNull()
  })
})

describe("AnalyticsIngestSchema", () => {
  test("accepts a minimal pageview", () => {
    const result = AnalyticsIngestSchema.safeParse({ app: "www", kind: "pageview", path: "/" })
    expect(result.success).toBe(true)
  })

  test("accepts a minimal event", () => {
    const result = AnalyticsIngestSchema.safeParse({
      app: "app",
      kind: "event",
      name: "pricing_viewed",
    })
    expect(result.success).toBe(true)
  })

  test("refuses an unknown app", () => {
    const result = AnalyticsIngestSchema.safeParse({ app: "evil", kind: "pageview", path: "/" })
    expect(result.success).toBe(false)
  })

  test("refuses an unknown kind", () => {
    const result = AnalyticsIngestSchema.safeParse({ app: "www", kind: "click" })
    expect(result.success).toBe(false)
  })

  test('a path must start with /, so a bare query string can never collapse to ""', () => {
    expect(
      AnalyticsIngestSchema.safeParse({ app: "www", kind: "pageview", path: "?token=x" }).success
    ).toBe(false)
    expect(
      AnalyticsIngestSchema.safeParse({ app: "www", kind: "pageview", path: "pricing" }).success
    ).toBe(false)
    expect(
      AnalyticsIngestSchema.safeParse({ app: "www", kind: "pageview", path: "/" }).success
    ).toBe(true)
  })
})

describe("collapseRoute", () => {
  test("drops the query string and collapses an opaque segment to :id", () => {
    expect(collapseRoute("/invitations/abc123def456ghi789?token=x")).toBe("/invitations/:id")
  })

  test("drops a hash fragment", () => {
    expect(collapseRoute("/notes#section")).toBe("/notes")
  })

  test("collapses an all-digit segment and a uuid, leaves ordinary segments alone", () => {
    expect(collapseRoute("/notes/42")).toBe("/notes/:id")
    expect(collapseRoute("/workspaces/550e8400-e29b-41d4-a716-446655440000")).toBe(
      "/workspaces/:id"
    )
    expect(collapseRoute("/pricing")).toBe("/pricing")
  })
})
