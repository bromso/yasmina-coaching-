import { describe, expect, test } from "bun:test"
import {
  isOptionalNotificationEmailType,
  NOTIFICATION_EMAIL,
  NOTIFICATION_TYPES,
} from "./notifications"
import {
  ListNotificationsSchema,
  MarkNotificationsReadSchema,
  NOTIFICATION_DATA_SCHEMAS,
  NotificationEmailPeekSchema,
  SetNotificationPreferenceSchema,
} from "./notifications-schema"

describe("NOTIFICATION_TYPES", () => {
  test("lists the seven personal events, each with its own data schema", () => {
    expect(NOTIFICATION_TYPES).toEqual([
      "invitation.received",
      "member.role_changed",
      "member.removed",
      "workspace.two_factor_required",
      "export.ready",
      "webhook.disabled",
      "plan.changed",
    ])
    expect(Object.keys(NOTIFICATION_DATA_SCHEMAS).sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })
})

describe("NOTIFICATION_DATA_SCHEMAS", () => {
  test("accept the display data and refuse any other key, such as an email", () => {
    const valid = {
      "invitation.received": { workspaceName: "W", role: "admin", invitationId: 1 },
      "member.role_changed": { workspaceName: "W", from: "viewer", to: "admin" },
      "member.removed": { workspaceName: "W" },
      "workspace.two_factor_required": { workspaceName: "W" },
      "export.ready": {},
      "webhook.disabled": { workspaceName: "W", host: "hooks.example.com", reason: "gone" },
      "plan.changed": { workspaceName: "W", plan: "pro" },
    } as const
    for (const type of NOTIFICATION_TYPES) {
      const schema = NOTIFICATION_DATA_SCHEMAS[type]
      expect(schema.safeParse(valid[type]).success).toBe(true)
      expect(schema.safeParse({ ...valid[type], email: "a@example.com" }).success).toBe(false)
    }
    expect(
      NOTIFICATION_DATA_SCHEMAS["webhook.disabled"].safeParse({
        workspaceName: "W",
        host: "h",
        reason: "manual",
      }).success
    ).toBe(false)
    expect(
      NOTIFICATION_DATA_SCHEMAS["plan.changed"].safeParse({ workspaceName: "W", plan: "gold" })
        .success
    ).toBe(false)
  })
})

describe("ListNotificationsSchema", () => {
  test("defaults to 20 of every row; bounds the page at 1–50", () => {
    expect(ListNotificationsSchema.parse(undefined)).toEqual({ limit: 20, unreadOnly: false })
    expect(ListNotificationsSchema.parse({})).toEqual({ limit: 20, unreadOnly: false })
    expect(ListNotificationsSchema.parse({ limit: "50", unreadOnly: "true" })).toEqual({
      limit: 50,
      unreadOnly: true,
    })
    expect(ListNotificationsSchema.parse({ unreadOnly: "false" }).unreadOnly).toBe(false)
    expect(ListNotificationsSchema.safeParse({ limit: 0 }).success).toBe(false)
    expect(ListNotificationsSchema.safeParse({ limit: 51 }).success).toBe(false)
  })

  test("a cursor must be a real time and id, never an impossible date", () => {
    const ok = "2026-01-01T00:00:00.000Z_12"
    expect(ListNotificationsSchema.parse({ cursor: ok }).cursor).toBe(ok)
    for (const cursor of [
      "x",
      "2026-13-01T00:00:00.000Z_1",
      "2026-02-30T00:00:00.000Z_1",
      "2026-01-01T00:00:00.000Z_0",
      "2026-01-01T00:00:00.000Z_99999999999",
    ]) {
      expect(ListNotificationsSchema.safeParse({ cursor }).success).toBe(false)
    }
  })
})

describe("MarkNotificationsReadSchema", () => {
  test("1–100 positive ids, or all: true", () => {
    expect(MarkNotificationsReadSchema.safeParse({ ids: [1] }).success).toBe(true)
    expect(MarkNotificationsReadSchema.safeParse({ all: true }).success).toBe(true)
    for (const input of [
      { ids: [] },
      { ids: Array.from({ length: 101 }, (_, i) => i + 1) },
      { ids: [-1] },
      { all: false },
      {},
    ]) {
      expect(MarkNotificationsReadSchema.safeParse(input).success).toBe(false)
    }
  })
})

describe("NOTIFICATION_EMAIL", () => {
  test("splits every type into locked and optional, with no overlap", () => {
    expect(NOTIFICATION_EMAIL.locked).toEqual([
      "invitation.received",
      "workspace.two_factor_required",
      "export.ready",
      "webhook.disabled",
    ])
    expect(NOTIFICATION_EMAIL.optional).toEqual([
      "member.role_changed",
      "member.removed",
      "plan.changed",
    ])
    const all = [...NOTIFICATION_EMAIL.locked, ...NOTIFICATION_EMAIL.optional]
    expect(new Set(all).size).toBe(all.length)
    expect([...all].sort()).toEqual([...NOTIFICATION_TYPES].sort())
  })

  test("isOptionalNotificationEmailType accepts only the optional types", () => {
    for (const type of NOTIFICATION_EMAIL.optional)
      expect(isOptionalNotificationEmailType(type)).toBe(true)
    for (const type of [...NOTIFICATION_EMAIL.locked, "", "member.ROLE_changed", 1, null]) {
      expect(isOptionalNotificationEmailType(type)).toBe(false)
    }
  })

  test("a preference can only be set for an optional type", () => {
    expect(
      SetNotificationPreferenceSchema.safeParse({ type: "plan.changed", email: false }).success
    ).toBe(true)
    for (const type of [...NOTIFICATION_EMAIL.locked, "plan.changed ", "nope"]) {
      expect(SetNotificationPreferenceSchema.safeParse({ type, email: false }).success).toBe(false)
    }
    expect(
      SetNotificationPreferenceSchema.safeParse({ type: "plan.changed", email: "false" }).success
    ).toBe(false)
  })

  test("peek answers an optional type or null, never a locked one", () => {
    expect(NotificationEmailPeekSchema.parse(null)).toBeNull()
    expect(NotificationEmailPeekSchema.safeParse({ type: "export.ready" }).success).toBe(false)
    expect(
      NotificationEmailPeekSchema.safeParse({ type: "member.removed", userId: 1 }).data
    ).toEqual({
      type: "member.removed",
    })
  })
})
