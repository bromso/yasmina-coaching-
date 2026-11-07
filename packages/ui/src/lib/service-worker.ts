import { CacheExpiration, type PrecacheEntry, Serwist } from "serwist"
import { cacheNames, OFFLINE_URL, runtimeCaching, type SiteKind } from "./service-worker-rules"

export type { SiteKind } from "./service-worker-rules"

type ActivateEvent = Event & { waitUntil(promise: Promise<unknown>): void }

/**
 * Every app's service worker, from its `src/app/sw.ts`:
 *
 *   startServiceWorker("private", self.__SW_MANIFEST)
 *
 * `self.__SW_MANIFEST` must be written in the app's own sw.ts: @serwist/next injects the precache
 * list at that token. Rules per kind live in ./service-worker-rules. On activation it deletes every
 * cache on the origin whose name neither starts with `serwist-` nor is one the current rules use —
 * so caches an older worker filled (signed-in pages included) do not survive an update; a page
 * script must not keep its own Cache Storage under another name. The expiration metadata of each
 * deleted cache (URLs and timestamps, in IndexedDB) goes with it.
 */
export function startServiceWorker(
  kind: SiteKind,
  precacheEntries: (PrecacheEntry | string)[] | undefined
) {
  const serwist = new Serwist({
    precacheEntries,
    skipWaiting: true,
    clientsClaim: true,
    navigationPreload: true,
    runtimeCaching: runtimeCaching(kind),
    fallbacks: {
      entries: [{ url: OFFLINE_URL, matcher: ({ request }) => request.destination === "document" }],
    },
  })
  serwist.addEventListeners()

  const keep = cacheNames(kind)
  globalThis.addEventListener("activate", (event) => {
    ;(event as ActivateEvent).waitUntil(
      caches
        .keys()
        .then((names) =>
          Promise.all(
            names
              .filter((name) => !name.startsWith("serwist-") && !keep.has(name))
              .map((name) =>
                Promise.all([
                  caches.delete(name),
                  new CacheExpiration(name, { maxEntries: 1 }).delete(),
                ])
              )
          )
        )
    )
  })
}
