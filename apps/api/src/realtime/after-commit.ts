import type { BroadcastEvent } from "@repo/api-contract"
import { type Broadcaster, PAYLOAD_TOO_LARGE } from "./broadcaster"

export type PublishContext = {
  broadcaster: Broadcaster
  recordFailure: (message: string, error: unknown) => void
}

const isTooLarge = (error: unknown) => error instanceof Error && error.message === PAYLOAD_TOO_LARGE

/**
 * Publishes `event` on `channel`, fire-and-forget: it returns at once, never throws and never
 * rejects, so a bus failure can never fail the request that made the change. A failure is logged
 * and recorded through `recordFailure`.
 *
 * One expected refusal is not a failure: a `note.created` whose note is too large for the
 * 8000-byte `NOTIFY` payload (a body may be 10 000 characters). The channel gets a `resync`
 * instead, so its clients re-fetch and still see the note.
 *
 * Call it only once the write is durable. Today `notes.create` / `notes.delete` write without a
 * transaction, so they call it after the write returns. A caller inside `db.transaction` must call
 * it after the transaction resolves — never inside the callback, where a later rollback would
 * leave subscribers holding an event for a write that never happened — or hand it to
 * `tx.afterCommit`, which does exactly that (`notifyUser` in notifications.ts).
 */
export function publishAfterCommit(
  ctx: PublishContext,
  channel: string,
  event: BroadcastEvent
): void {
  // `Promise.resolve().then` so even a broadcaster that throws synchronously ends up in `catch`.
  Promise.resolve()
    .then(() => ctx.broadcaster.publish(channel, event))
    .catch((error: unknown) => {
      if (event.type === "note.created" && isTooLarge(error)) {
        return ctx.broadcaster.publish(channel, { type: "resync" })
      }
      throw error
    })
    .catch((error: unknown) => ctx.recordFailure("realtime publish failed", error))
}
