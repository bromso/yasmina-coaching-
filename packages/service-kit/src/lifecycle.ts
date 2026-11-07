import { errorResponse } from "./errors"

export type Stoppable = { stop(closeActiveConnections?: boolean): Promise<void> }

export type Lifecycle = {
  /** False from the moment shutdown starts; `/ready` answers 503 from then on. */
  ready(): boolean
  /** Idempotent: every call returns the same shutdown. */
  shutdown(server: Stoppable): Promise<void>
  /** SIGTERM / SIGINT → shutdown → exit 0, or log the error and exit 1 if shutdown rejects. */
  installSignalHandlers(server: Stoppable): void
}

/** How long a shutdown waits for a forced stop to report back once the drain window is over. */
const FORCE_STOP_WAIT_MS = 500

/** Resolves when `promise` settles or after `ms`, whichever is first; a rejection still rejects. */
async function settleWithin(promise: Promise<unknown>, ms: number): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    await Promise.race([promise, new Promise((resolve) => (timer = setTimeout(resolve, ms)))])
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Graceful shutdown. Readiness flips first; after `graceMs` (raise it behind a load balancer that
 * polls /ready, so it stops routing here) the server stops accepting connections and in-flight
 * requests get `drainMs` to finish before they are cut off; then `cleanup` runs once — even when
 * stopping the server fails, in which case the shutdown rejects with that error.
 *
 * `onShutdown` runs once, synchronously, the moment shutdown starts (before the grace period):
 * the place to stop background work from taking anything new, so its own drain overlaps the
 * request drain instead of starting after it. Await that drain in `cleanup`.
 */
export function createLifecycle({
  drainMs,
  graceMs = 0,
  cleanup = () => {},
  onShutdown = () => {},
  log = (message: string) => console.info(message),
}: {
  drainMs: number
  graceMs?: number
  cleanup?: () => void | Promise<void>
  onShutdown?: () => void
  log?: (message: string) => void
}): Lifecycle {
  let draining = false
  let done: Promise<void> | undefined

  const shutdown = (server: Stoppable) => {
    done ??= (async () => {
      draining = true
      log(`shutting down: draining in-flight requests (up to ${drainMs} ms)`)
      let timer: ReturnType<typeof setTimeout> | undefined
      let drained: boolean
      try {
        // Inside the try: if it throws, cleanup still runs and the shutdown rejects with it.
        onShutdown()
        if (graceMs > 0) await Bun.sleep(graceMs)
        drained = await Promise.race([
          server.stop().then(() => true),
          new Promise<false>((resolve) => {
            timer = setTimeout(() => resolve(false), drainMs)
          }),
        ])
        // Bun 1.3's stop(true) promise has been seen to take ~5 s to settle while a handler is
        // still pending (observed with the client in the same process). Cleanup and the exit must
        // not wait on it: the exit closes every socket anyway.
        if (!drained) await settleWithin(server.stop(true), FORCE_STOP_WAIT_MS)
      } finally {
        // A fast drain must not leave the timer holding the event loop open for drainMs.
        clearTimeout(timer)
        await cleanup()
      }
      log(
        drained
          ? "shut down after in-flight requests finished"
          : `shut down; cut off requests still running after ${drainMs} ms`
      )
    })()
    return done
  }

  return {
    ready: () => !draining,
    shutdown,
    installSignalHandlers(server) {
      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.once(signal, () => {
          shutdown(server).then(
            () => process.exit(0),
            (error: unknown) => {
              console.error("shutdown failed:", error)
              process.exit(1)
            }
          )
        })
      }
    },
  }
}

/** How long `/ready` waits for its check before answering 503 (`READY_TIMEOUT_MS`). */
export const DEFAULT_READY_TIMEOUT_MS = 2_000

export type ReadyRouteOptions = {
  /**
   * How long the check may take before `/ready` answers 503 "Not ready (timed out)". A paused
   * Postgres keeps its TCP connection open, so a ping can otherwise wait as long as the socket
   * does — and a probe that hangs tells a load balancer nothing. Defaults to 2 000 ms.
   */
  timeoutMs?: number
}

/**
 * A `/ready` handler: 503 while shutting down, when `check` throws, or when it has not settled
 * within `timeoutMs` (the check keeps running; its late result is ignored); else 200 "OK".
 */
export function readyRoute(
  lifecycle: Pick<Lifecycle, "ready">,
  check?: () => unknown,
  { timeoutMs = DEFAULT_READY_TIMEOUT_MS }: ReadyRouteOptions = {}
) {
  return async (): Promise<Response> => {
    if (!lifecycle.ready()) {
      return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    }
    if (!check) return new Response("OK")
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      const outcome = await Promise.race([
        Promise.resolve()
          .then(check)
          .then(() => "ok" as const),
        new Promise<"timeout">((resolve) => {
          timer = setTimeout(() => resolve("timeout"), timeoutMs)
        }),
      ])
      if (outcome === "timeout") {
        return errorResponse("SERVICE_UNAVAILABLE", { message: "Not ready (timed out)" })
      }
    } catch {
      return errorResponse("SERVICE_UNAVAILABLE", { message: "Not ready" })
    } finally {
      clearTimeout(timer)
    }
    return new Response("OK")
  }
}
