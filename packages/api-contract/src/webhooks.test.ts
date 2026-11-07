import { describe, expect, test } from "bun:test"
import { contract } from "./index"
import {
  CreateWebhookEndpointSchema,
  MAX_WEBHOOK_ENDPOINTS,
  UpdateWebhookEndpointSchema,
  WEBHOOK_EVENT_TYPES,
  WEBHOOK_LIMIT_MESSAGE,
  WebhookDeliveriesInputSchema,
  WebhookDeliverySchema,
  WebhookEndpointIdSchema,
  WebhookEndpointSchema,
} from "./webhooks"
import * as limits from "./webhooks-limits"

describe("webhook endpoint schemas", () => {
  const base = { workspaceId: 1, url: "https://example.com/hook", events: ["note.created"] }

  test("the eight subscribable events, in order; ping is not subscribable", () => {
    expect(WEBHOOK_EVENT_TYPES).toEqual([
      "note.created",
      "note.deleted",
      "member.joined",
      "member.left",
      "member.role_changed",
      "workspace.updated",
      "api_key.created",
      "api_key.revoked",
    ])
    expect(CreateWebhookEndpointSchema.safeParse({ ...base, events: ["ping"] }).success).toBe(false)
  })

  test("create: a trimmed URL of 1–2000 characters without control characters", () => {
    expect(CreateWebhookEndpointSchema.parse({ ...base, url: "  https://a.example/  " }).url).toBe(
      "https://a.example/"
    )
    expect(CreateWebhookEndpointSchema.safeParse({ ...base, url: " " }).success).toBe(false)
    expect(
      CreateWebhookEndpointSchema.safeParse({ ...base, url: `https://a/${"x".repeat(1991)}` })
        .success
    ).toBe(false)
    expect(
      CreateWebhookEndpointSchema.safeParse({ ...base, url: "https://a.example/\nb" }).success
    ).toBe(false)
  })

  test("create: at least one known event, each at most once", () => {
    expect(CreateWebhookEndpointSchema.safeParse({ ...base, events: [] }).success).toBe(false)
    expect(CreateWebhookEndpointSchema.safeParse({ ...base, events: ["nope"] }).success).toBe(false)
    expect(
      CreateWebhookEndpointSchema.safeParse({ ...base, events: ["note.created", "note.created"] })
        .success
    ).toBe(false)
    expect(
      CreateWebhookEndpointSchema.safeParse({ ...base, events: [...WEBHOOK_EVENT_TYPES] }).success
    ).toBe(true)
    const { events: _, ...without } = base
    expect(CreateWebhookEndpointSchema.safeParse(without).success).toBe(false)
  })

  test("create: an optional description, trimmed, at most 200 characters, null allowed", () => {
    expect(CreateWebhookEndpointSchema.parse(base).description).toBeUndefined()
    expect(CreateWebhookEndpointSchema.parse({ ...base, description: null }).description).toBeNull()
    expect(CreateWebhookEndpointSchema.parse({ ...base, description: "  CI  " }).description).toBe(
      "CI"
    )
    expect(
      CreateWebhookEndpointSchema.safeParse({ ...base, description: "x".repeat(201) }).success
    ).toBe(false)
    expect(CreateWebhookEndpointSchema.safeParse({ ...base, description: "a\u0000" }).success).toBe(
      false
    )
  })

  test("update: every field optional; path ids coerce", () => {
    expect(UpdateWebhookEndpointSchema.parse({ workspaceId: "2", id: "3" })).toEqual({
      workspaceId: 2,
      id: 3,
    })
    expect(
      UpdateWebhookEndpointSchema.safeParse({ workspaceId: 2, id: 3, events: ["ping"] }).success
    ).toBe(false)
    expect(
      UpdateWebhookEndpointSchema.parse({ workspaceId: 2, id: 3, enabled: false, description: "" })
    ).toEqual({ workspaceId: 2, id: 3, enabled: false, description: "" })
    expect(
      UpdateWebhookEndpointSchema.safeParse({ workspaceId: 2, id: 3, events: [] }).success
    ).toBe(false)
    expect(WebhookEndpointIdSchema.parse({ workspaceId: "2", id: "3" })).toEqual({
      workspaceId: 2,
      id: 3,
    })
    expect(WebhookDeliveriesInputSchema.parse({ workspaceId: "2", id: "3" })).toEqual({
      workspaceId: 2,
      id: 3,
    })
  })

  test("the endpoint and delivery summaries carry no secret and no body", () => {
    const endpointKeys = Object.keys(WebhookEndpointSchema.shape)
    for (const key of ["secret", "secretEncrypted", "signingSecret"])
      expect(endpointKeys).not.toContain(key)
    const deliveryKeys = Object.keys(WebhookDeliverySchema.shape)
    for (const key of ["body", "response", "responseBody", "headers"])
      expect(deliveryKeys).not.toContain(key)
  })

  test("the limit message names MAX_WEBHOOK_ENDPOINTS", () => {
    expect(WEBHOOK_LIMIT_MESSAGE).toContain(String(MAX_WEBHOOK_ENDPOINTS))
  })
})

describe("the webhooks-limits subpath", () => {
  test("is Zod-free: plain values only, the same ones the schemas use", () => {
    expect(limits.MAX_WEBHOOK_ENDPOINTS).toBe(10)
    expect(limits.WEBHOOK_URL_MAX).toBe(2000)
    expect(limits.WEBHOOK_DESCRIPTION_MAX).toBe(200)
    expect(limits.WEBHOOK_DISABLED_REASONS).toEqual(["failures", "gone", "manual"])
    expect(limits.WEBHOOK_DELIVERY_ERRORS).toEqual([
      "timeout",
      "network",
      "blocked",
      "redirect",
      "http",
    ])
    expect(limits.WEBHOOK_DELIVERIES_LIMIT).toBe(50)
    expect(limits.WEBHOOK_MAX_CONSECUTIVE_FAILURES).toBe(5)
    expect(limits.WEBHOOK_EVENT_TYPES).toBe(WEBHOOK_EVENT_TYPES)
    expect(limits.WEBHOOK_DELIVERY_EVENT_TYPES).toEqual([...WEBHOOK_EVENT_TYPES, "ping"])
  })
})

describe("workspaces.webhooks in the contract", () => {
  test("list, create, update, rotateSecret, delete, test and deliveries exist", () => {
    const webhooks = contract.workspaces.webhooks
    for (const name of ["list", "create", "update", "rotateSecret", "delete", "test", "deliveries"])
      expect(webhooks[name as keyof typeof webhooks]).toBeDefined()
  })
})
