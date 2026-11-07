import { AsyncLocalStorage } from "node:async_hooks"
import { setRequestIdGetter } from "./index"

type RequestContext = { requestId: string }

const storage = new AsyncLocalStorage<RequestContext>()

/** Server-only: runs `fn` with `requestId` available to `currentRequestId()` for its whole async chain. */
export function withRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return storage.run(ctx, fn)
}

/**
 * Server-only: runs `fn` with no request context, so work it starts (a timer, a poll chain) never
 * carries the id of the request that happened to trigger it.
 */
export function outsideRequestContext<T>(fn: () => T): T {
  return storage.exit(fn)
}

/** The request id of the context currently running, or `undefined` outside one. */
export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId
}

// Registering here (rather than in the root entry) keeps `node:async_hooks` out of code that only
// imports `@repo/log` — client bundles included.
setRequestIdGetter(currentRequestId)
