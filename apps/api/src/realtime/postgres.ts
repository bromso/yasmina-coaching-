import { BroadcastEventSchema } from "@repo/api-contract"
import type { SQL } from "bun"
import type { Log } from "../jobs/define"
import {
  type Broadcaster,
  createSubscriberRegistry,
  encodePayload,
  type SubscriberRegistry,
} from "./broadcaster"

/**
 * The one Postgres channel every workspace's events ride on. The JSON payload's own `channel`
 * field (`workspace:<id>`, see `@repo/api-contract`'s `workspaceChannel`) is what local
 * subscribers are actually registered against.
 */
const NOTIFY_CHANNEL = "realtime"

/**
 * The `onlisten` callback for `sql.listen`: it runs once the subscription is first acknowledged,
 * and again after every reconnect. The first call is ordinary startup; from the second call on, a
 * dropped connection may have missed notifications published during the gap, so every channel
 * that still has a subscriber gets a local `resync` — telling its clients to re-fetch rather than
 * trust a delivery they can no longer be sure they would have seen. Exported so a test can drive
 * it directly without forcing a real reconnect.
 */
export function resyncOnReconnect(registry: SubscriberRegistry, log: Log): () => void {
  let calls = 0
  return () => {
    calls += 1
    if (calls === 1) return
    for (const channel of registry.channels()) {
      registry.publishLocal(channel, { type: "resync" }, (error) =>
        log("realtime: subscriber threw", error)
      )
    }
  }
}

/** How long `close()` waits for `UNLISTEN` before closing the connections anyway. */
const UNLISTEN_TIMEOUT_MS = 2_000
/** Seconds `close()` gives pending queries (a last NOTIFY) before the connections are cut. */
const CLOSE_TIMEOUT_S = 2

/**
 * `publish` runs `SELECT pg_notify('realtime', '<json>')`; one shared `sql.listen("realtime", …)`
 * fans out locally (Bun 1.4.2 re-subscribes on reconnect), so every replica's subscribers hear
 * every replica's writes. `sql` must be this broadcaster's own client, never the api's database
 * pool: `sql.listen` opens a dedicated connection of its own, outside the client's pool, and holds
 * it for as long as it is active; the pool carries the NOTIFYs. `createBroadcaster` passes
 * `new SQL(databaseUrl, { max: 1 })` — two connections in all (see `broadcasterSql`). Resolves
 * once the `LISTEN` is acknowledged.
 */
export async function postgresBroadcaster(
  sql: SQL,
  log: Log,
  opts: { unlistenTimeoutMs?: number } = {}
): Promise<Broadcaster> {
  const registry = createSubscriberRegistry()
  let closed = false

  const subscription = await sql.listen(
    NOTIFY_CHANNEL,
    (raw) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(raw)
      } catch (error) {
        log("realtime: invalid notify payload (not JSON)", error)
        return
      }
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { channel?: unknown }).channel !== "string"
      ) {
        log("realtime: invalid notify payload (missing channel)", parsed)
        return
      }
      const { channel, event } = parsed as { channel: string; event: unknown }
      const result = BroadcastEventSchema.safeParse(event)
      if (!result.success) {
        log("realtime: invalid notify payload (bad event)", result.error)
        return
      }
      registry.publishLocal(channel, result.data, (error) =>
        log("realtime: subscriber threw", error)
      )
    },
    resyncOnReconnect(registry, log)
  )

  return {
    kind: "postgres",
    async publish(channel, event) {
      // Validated and serialized before any SQL runs — an over-limit payload never reaches it.
      const payload = encodePayload(channel, event)
      // Matches the memory bus: a publish racing shutdown does nothing rather than throwing, so
      // `publishAfterCommit` does not record a failure for every publish racing shutdown. No new
      // connection on a closed broadcaster, either — Bun's SQL client would otherwise happily
      // reconnect and send the NOTIFY anyway.
      if (closed) return
      await sql`SELECT pg_notify(${NOTIFY_CHANNEL}, ${payload})`
    },
    subscribe: registry.subscribe,
    async close() {
      closed = true
      // Bounded: on a dead connection UNLISTEN may never be answered, and shutdown must not
      // hang on it — the connections are closed either way.
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), opts.unlistenTimeoutMs ?? UNLISTEN_TIMEOUT_MS)
      })
      try {
        const outcome = await Promise.race([subscription.unlisten(), timedOut])
        if (outcome === "timeout") log("realtime: UNLISTEN timed out; closing anyway", null)
      } catch (error) {
        log("realtime: UNLISTEN failed; closing anyway", error)
      } finally {
        clearTimeout(timer)
        // Bounded too: with no timeout, close() waits for every pending query to finish.
        await sql.close({ timeout: CLOSE_TIMEOUT_S })
      }
    },
  }
}
