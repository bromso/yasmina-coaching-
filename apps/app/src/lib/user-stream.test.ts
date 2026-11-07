import { describe, expect, test } from "bun:test"
import { UserRealtimeEventSchema } from "@repo/api-contract/realtime"
import { userStreamEventType } from "./user-stream"

describe("userStreamEventType", () => {
  test("notification.created with a positive integer id, and resync", () => {
    expect(userStreamEventType('{"type":"notification.created","id":7}')).toBe(
      "notification.created"
    )
    expect(userStreamEventType('{"type":"resync"}')).toBe("resync")
  })

  test("anything else is null", () => {
    for (const raw of [
      "not json",
      "null",
      "42",
      '"resync"',
      "{}",
      '{"type":"note.created"}',
      '{"type":"presence","replicaId":"r","members":[]}',
      '{"type":"notification.created"}',
      '{"type":"notification.created","id":0}',
      '{"type":"notification.created","id":1.5}',
      '{"type":"notification.created","id":"7"}',
    ]) {
      expect(userStreamEventType(raw)).toBeNull()
    }
  })

  test("agrees with the contract's own schema on every case above", () => {
    for (const raw of [
      '{"type":"notification.created","id":7}',
      '{"type":"resync"}',
      '{"type":"notification.created","id":0}',
      '{"type":"note.created"}',
    ]) {
      const parsed = UserRealtimeEventSchema.safeParse(JSON.parse(raw))
      expect(userStreamEventType(raw)).toBe(parsed.success ? parsed.data.type : null)
    }
  })
})
