import { describe, expect, test } from "bun:test"
import * as events from "./webhook-events"
import {
  SUBSCRIBABLE_WEBHOOK_EVENTS,
  WEBHOOK_DATA_SCHEMAS,
  WEBHOOK_EVENTS,
  WebhookEventSchema,
} from "./webhooks"

const at = "2026-10-18T12:00:00.000Z"
const member = { userId: 7, name: "Ada", role: "member", joinedAt: at }

describe("webhook events", () => {
  test("the nine types, ping last; ping is not subscribable", () => {
    expect(WEBHOOK_EVENTS).toEqual([
      "note.created",
      "note.deleted",
      "member.joined",
      "member.left",
      "member.role_changed",
      "workspace.updated",
      "api_key.created",
      "api_key.revoked",
      "ping",
    ])
    expect(SUBSCRIBABLE_WEBHOOK_EVENTS).toEqual(WEBHOOK_EVENTS.filter((e) => e !== "ping"))
    expect(Object.keys(WEBHOOK_DATA_SCHEMAS).sort()).toEqual([...WEBHOOK_EVENTS].sort())
  })

  test("the Zod-free subpath carries the same lists", () => {
    expect(events.WEBHOOK_EVENTS).toBe(WEBHOOK_EVENTS)
    expect(events.SUBSCRIBABLE_WEBHOOK_EVENTS).toBe(SUBSCRIBABLE_WEBHOOK_EVENTS)
  })

  test("each envelope parses with its own data, and only with it", () => {
    const valid = [
      {
        type: "note.created",
        timestamp: at,
        data: { id: 1, title: "t", body: "", createdAt: at, author: null },
      },
      { type: "note.deleted", timestamp: at, data: { id: 1 } },
      { type: "member.joined", timestamp: at, data: member },
      { type: "member.left", timestamp: at, data: member },
      {
        type: "member.role_changed",
        timestamp: at,
        data: { ...member, role: "admin", previousRole: "member" },
      },
      {
        type: "workspace.updated",
        timestamp: at,
        data: { id: 1, name: "W", slug: "w", plan: "pro" },
      },
      {
        type: "api_key.created",
        timestamp: at,
        data: { id: 1, name: "CI", prefix: "Abcdef12", scopes: ["notes:read"], expiresAt: null },
      },
      {
        type: "api_key.revoked",
        timestamp: at,
        data: { id: 1, name: "CI", prefix: "Abcdef12", scopes: ["notes:read"], expiresAt: at },
      },
      { type: "ping", timestamp: at, data: { endpointId: 3 } },
    ]
    for (const event of valid) expect(WebhookEventSchema.safeParse(event).success).toBe(true)
    expect(valid.map((e) => e.type)).toEqual([...WEBHOOK_EVENTS])
    expect(
      WebhookEventSchema.safeParse({ type: "note.deleted", timestamp: at, data: member }).success
    ).toBe(false)
    expect(
      WebhookEventSchema.safeParse({ type: "member.role_changed", timestamp: at, data: member })
        .success
    ).toBe(false)
    expect(WebhookEventSchema.safeParse({ type: "nope", timestamp: at, data: {} }).success).toBe(
      false
    )
  })

  test("no payload carries an email address field", () => {
    for (const schema of Object.values(WEBHOOK_DATA_SCHEMAS)) {
      const keys = Object.keys((schema as unknown as { shape: Record<string, unknown> }).shape)
      expect(keys).not.toContain("email")
    }
  })
})
