import type { Log } from "../jobs/define"
import { type Broadcaster, createSubscriberRegistry, encodePayload } from "./broadcaster"

/**
 * In-process fan-out, no database involved. Correct for one api process — several replicas would
 * each keep their own subscribers and never see another's publish, unlike `postgres`. `log`
 * defaults to a no-op; `createServer` always passes a real one, so both buses behave the same way
 * when a subscriber throws.
 */
export function memoryBroadcaster(log: Log = () => {}): Broadcaster {
  const registry = createSubscriberRegistry()
  let closed = false

  return {
    kind: "memory",
    async publish(channel, event) {
      // Same size rule as Postgres's NOTIFY (see encodePayload), enforced before any delivery.
      encodePayload(channel, event)
      if (closed) return
      registry.publishLocal(channel, event, (error) => log("realtime: subscriber threw", error))
    },
    subscribe: registry.subscribe,
    async close() {
      closed = true
      registry.clear()
    },
  }
}
