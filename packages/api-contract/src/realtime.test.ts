import { describe, expect, test } from "bun:test"
import {
  BroadcastEventSchema,
  NOTIFY_PAYLOAD_LIMIT,
  RealtimeEventSchema,
  UserRealtimeEventSchema,
  userChannel,
  workspaceChannel,
} from "./realtime"

const note = {
  id: 1,
  title: "First",
  body: "",
  createdAt: new Date().toISOString(),
  authorId: 2,
  apiKey: null,
}

describe("RealtimeEventSchema", () => {
  test("parses note.created", () => {
    expect(RealtimeEventSchema.safeParse({ type: "note.created", note }).success).toBe(true)
  })

  test("parses note.deleted", () => {
    expect(RealtimeEventSchema.safeParse({ type: "note.deleted", id: 7 }).success).toBe(true)
  })

  test("parses presence", () => {
    const result = RealtimeEventSchema.safeParse({
      type: "presence",
      replicaId: "r1",
      members: [{ userId: 1, name: "Ada", avatarUrl: null }],
    })
    expect(result.success).toBe(true)
  })

  test("parses resync", () => {
    expect(RealtimeEventSchema.safeParse({ type: "resync" }).success).toBe(true)
  })

  test("rejects an unknown type", () => {
    expect(RealtimeEventSchema.safeParse({ type: "note.updated", id: 1 }).success).toBe(false)
  })
})

describe("workspaceChannel", () => {
  test("is a stable key per workspace", () => {
    expect(workspaceChannel(1)).toBe("workspace:1")
    expect(workspaceChannel(42)).toBe("workspace:42")
  })
})

describe("userChannel", () => {
  test("is a stable key per user, apart from every workspace channel", () => {
    expect(userChannel(1)).toBe("user:1")
    expect(userChannel(42)).toBe("user:42")
    expect(userChannel(1)).not.toBe(workspaceChannel(1))
  })
})

describe("the per-user events", () => {
  const created = { type: "notification.created", id: 3 }

  test("a user stream carries notification.created and resync, nothing of a workspace's", () => {
    expect(UserRealtimeEventSchema.safeParse(created).success).toBe(true)
    expect(UserRealtimeEventSchema.safeParse({ type: "resync" }).success).toBe(true)
    expect(UserRealtimeEventSchema.safeParse({ type: "note.deleted", id: 1 }).success).toBe(false)
    expect(UserRealtimeEventSchema.safeParse({ type: "notification.created" }).success).toBe(false)
  })

  test("the bus carries both vocabularies; a workspace stream's parser still refuses it", () => {
    expect(BroadcastEventSchema.safeParse(created).success).toBe(true)
    expect(BroadcastEventSchema.safeParse({ type: "note.deleted", id: 1 }).success).toBe(true)
    expect(RealtimeEventSchema.safeParse(created).success).toBe(false)
  })
})

describe("NOTIFY_PAYLOAD_LIMIT", () => {
  test("is Postgres's NOTIFY payload cap", () => {
    expect(NOTIFY_PAYLOAD_LIMIT).toBe(8000)
  })
})
