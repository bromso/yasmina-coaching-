import {
  CacheFirst,
  ExpirationPlugin,
  NetworkFirst,
  NetworkOnly,
  type RuntimeCaching,
  StaleWhileRevalidate,
} from "serwist"

/**
 * What a service worker may cache, by kind of app.
 *
 * - `private` (app, auth, account): pages show the signed-in user, so pages, client-side navigation
 *   payloads (`RSC: 1`) and API calls always go to the network and never reach Cache Storage —
 *   otherwise they outlive sign-out on a shared device. Only build assets, fonts and icons cache.
 * - `public` (www, docs, help, jobs): every page is the same for everyone, so pages (documents)
 *   are network-first and readable offline once visited. RSC payloads are not cached: link
 *   prefetches would crowd the documents out, and a failed RSC fetch already makes Next fall back
 *   to a full navigation, which the cached document (or the offline page) answers.
 *
 * Either way a failed navigation falls back to `OFFLINE_URL`, a static file in each app's
 * `public/` (precached by @serwist/next): a Next route would render the signed-in header.
 */
export type SiteKind = "public" | "private"

export const OFFLINE_URL = "/offline.html"

const STATIC_CACHE = "static"
const PAGES_CACHE = "pages"
const IMAGES_CACHE = "images"

const isApi = (url: URL) => url.pathname.startsWith("/api/")
const isRsc = (request: Request) => request.headers.get("RSC") === "1"
const isBuildAsset = (url: URL) => url.pathname.startsWith("/_next/static/")

/** Hashed, immutable build output, fonts and the app's own icons. */
const staticAssets = (): RuntimeCaching => ({
  matcher: ({ url, request, sameOrigin }) =>
    sameOrigin &&
    (isBuildAsset(url) || url.pathname.startsWith("/icons/") || request.destination === "font"),
  handler: new CacheFirst({
    cacheName: STATIC_CACHE,
    plugins: [new ExpirationPlugin({ maxEntries: 256, maxAgeSeconds: 30 * 24 * 60 * 60 })],
  }),
})

const networkOnlyApi = (): RuntimeCaching => ({
  matcher: ({ url, sameOrigin }) => sameOrigin && isApi(url),
  handler: new NetworkOnly(),
})

export function runtimeCaching(kind: SiteKind): RuntimeCaching[] {
  if (kind === "private") {
    return [
      networkOnlyApi(),
      {
        matcher: ({ request }) => request.mode === "navigate" || isRsc(request),
        handler: new NetworkOnly(),
      },
      staticAssets(),
    ]
  }
  return [
    networkOnlyApi(),
    { matcher: ({ request }) => isRsc(request), handler: new NetworkOnly() },
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.mode === "navigate",
      handler: new NetworkFirst({
        cacheName: PAGES_CACHE,
        networkTimeoutSeconds: 3,
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 7 * 24 * 60 * 60 })],
      }),
    },
    staticAssets(),
    {
      matcher: ({ request, sameOrigin }) => sameOrigin && request.destination === "image",
      handler: new StaleWhileRevalidate({
        cacheName: IMAGES_CACHE,
        plugins: [new ExpirationPlugin({ maxEntries: 64, maxAgeSeconds: 30 * 24 * 60 * 60 })],
      }),
    },
  ]
}

/** The runtime caches a kind uses; anything else in Cache Storage is a leftover to delete. */
export function cacheNames(kind: SiteKind): Set<string> {
  return new Set(kind === "private" ? [STATIC_CACHE] : [STATIC_CACHE, PAGES_CACHE, IMAGES_CACHE])
}
