import { type BroadcastEvent, NOTIFY_PAYLOAD_LIMIT } from "@repo/api-contract"

/** A subscriber callback; an async one's rejection is reported the same way a sync throw is. */
export type EventHandler = (event: BroadcastEvent) => void | Promise<void>

/**
 * The publisher seam, picked at boot from the database dialect (see `create-broadcaster.ts`):
 * `memory` for SQLite (in-process fan-out, correct for the one api process SQLite implies) and
 * `postgres` for Postgres (`NOTIFY`, so every replica's subscribers hear every replica's writes).
 */
export type Broadcaster = {
  kind: "memory" | "postgres"
  /** Delivers `event` to every subscriber of `channel` — across replicas for "postgres". */
  publish(channel: string, event: BroadcastEvent): Promise<void>
  /** Registers `onEvent` for every future publish on `channel`. Call the result to unsubscribe. */
  subscribe(channel: string, onEvent: EventHandler): () => void
  close(): Promise<void>
}

/** The message `publish` rejects with when a payload reaches `NOTIFY_PAYLOAD_LIMIT`. */
export const PAYLOAD_TOO_LARGE = "realtime payload too large"

/**
 * The JSON `{ channel, event }` payload both buses use, and the one size rule both enforce before
 * anything else runs: Postgres's `NOTIFY` refuses a payload of `NOTIFY_PAYLOAD_LIMIT` bytes or
 * more, and `memory` enforces the same limit so a publisher never behaves differently depending
 * on which bus happens to be active.
 */
export function encodePayload(channel: string, event: BroadcastEvent): string {
  const payload = JSON.stringify({ channel, event })
  if (Buffer.byteLength(payload) >= NOTIFY_PAYLOAD_LIMIT) {
    throw new Error(PAYLOAD_TOO_LARGE)
  }
  return payload
}

/** The local subscriber bookkeeping both broadcasters share: register, unregister, fan out. */
export type SubscriberRegistry = {
  subscribe: Broadcaster["subscribe"]
  /** Channels with at least one current subscriber. */
  channels(): string[]
  /** How many channels the registry holds an entry for — 0 once every subscriber has left. */
  size(): number
  /**
   * Calls every current subscriber of `channel` with `event`. A sync throw or an async rejection
   * is reported to `onError`; either way, it never stops the remaining subscribers.
   */
  publishLocal(channel: string, event: BroadcastEvent, onError?: (error: unknown) => void): void
  /** Drops every registration — nothing delivers after this. */
  clear(): void
}

export function createSubscriberRegistry(): SubscriberRegistry {
  const subscribers = new Map<string, Set<EventHandler>>()

  return {
    subscribe(channel, onEvent) {
      let set = subscribers.get(channel)
      if (!set) {
        set = new Set()
        subscribers.set(channel, set)
      }
      set.add(onEvent)
      const own = set
      return () => {
        own.delete(onEvent)
        // The last subscriber gone: drop the channel's entry, or every workspace ever opened would
        // keep an empty Set for the life of the process. Only this Set's entry — after `clear()`
        // and a new subscribe, the channel may already map to a different one.
        if (own.size === 0 && subscribers.get(channel) === own) subscribers.delete(channel)
      }
    },
    channels() {
      return [...subscribers.keys()]
    },
    size() {
      return subscribers.size
    },
    publishLocal(channel, event, onError) {
      for (const onEvent of subscribers.get(channel) ?? []) {
        try {
          const result = onEvent(event)
          if (result && typeof result.catch === "function") {
            result.catch((error) => onError?.(error))
          }
        } catch (error) {
          onError?.(error)
        }
      }
    },
    clear() {
      subscribers.clear()
    },
  }
}
