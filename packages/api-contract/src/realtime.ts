import { z } from "zod"
import { NoteSchema } from "./note"

// Kept narrow on purpose: this file imports only ./note, never the main index — a browser bundle
// that reaches it through the "@repo/api-contract/realtime" subpath must not pull in the whole
// contract (auth, billing, admin, …). Server code still gets it from the main index, which
// re-exports everything here.

export const PresenceMemberSchema = z.object({
  userId: z.number().int().positive(),
  name: z.string(),
  avatarUrl: z.string().nullable(),
})

export type PresenceMember = z.infer<typeof PresenceMemberSchema>

export const RealtimeEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("note.created"), note: NoteSchema }),
  z.object({ type: z.literal("note.deleted"), id: z.number().int().positive() }),
  z.object({
    type: z.literal("presence"),
    replicaId: z.string(),
    members: z.array(PresenceMemberSchema),
  }),
  z.object({ type: z.literal("resync") }),
])

export type RealtimeEvent = z.infer<typeof RealtimeEventSchema>

/** The Postgres NOTIFY channel, and the in-process bus's own channel key, for one workspace. */
export const workspaceChannel = (workspaceId: number) => `workspace:${workspaceId}`

/**
 * One user's own channel (Phase 13 A): `notification.created` for each notification written for
 * them, once its transaction has committed. Never a workspace event, and never another user's.
 */
export const userChannel = (userId: number) => `user:${userId}`

/** Published on `userChannel(userId)`: a new notification exists; the client re-fetches it. */
export const NotificationCreatedEventSchema = z.object({
  type: z.literal("notification.created"),
  id: z.number().int().positive(),
})
export type NotificationCreatedEvent = z.infer<typeof NotificationCreatedEventSchema>

/** What a per-user stream carries: new notifications, and a `resync` on every connect. */
export const UserRealtimeEventSchema = z.discriminatedUnion("type", [
  NotificationCreatedEventSchema,
  z.object({ type: z.literal("resync") }),
])
export type UserRealtimeEvent = z.infer<typeof UserRealtimeEventSchema>

/**
 * Everything the bus (`Broadcaster`) carries: a workspace channel's `RealtimeEvent`s and a user
 * channel's `notification.created`. Kept apart from `RealtimeEventSchema`, which is exactly what a
 * workspace stream's client parses.
 */
export const BroadcastEventSchema = z.union([RealtimeEventSchema, NotificationCreatedEventSchema])
export type BroadcastEvent = z.infer<typeof BroadcastEventSchema>

/**
 * PostgreSQL's `NOTIFY` payload is capped at 8000 bytes. Both broadcasters enforce the same limit
 * (see `apps/api/src/realtime/`), so a publisher never sees different behaviour depending on which
 * bus happens to be active.
 */
export const NOTIFY_PAYLOAD_LIMIT = 8000
