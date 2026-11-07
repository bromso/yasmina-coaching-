import { OG_SIZE } from "@repo/ui/lib/og"

/** The file name every posting's OG image is served under, below `/og/<slug>/`. */
export const OG_FILE = "image.png"

/**
 * A posting's OG image path: `/og/senior-fullstack-engineer/image.png`. A route handler serves
 * them (`app/og/[...path]/route.ts`): Next refuses a literal segment after a catch-all, so
 * `OG_FILE` is the catch-all's own last entry, exactly as `apps/help`'s own route does.
 */
export function ogImagePath(slug: string): string {
  return `/og/${slug}/${OG_FILE}`
}

/** The posting slug a `/og/[...path]` route's `path` names (its last segment is `OG_FILE`), or
 * `undefined` when it does not end in `OG_FILE` or does not name exactly one segment before it. */
export function jobSlugOf(path: string[]): string | undefined {
  if (path.at(-1) !== OG_FILE || path.length !== 2) return undefined
  return path[0]
}

/** A posting's OG and Twitter image metadata: its prerendered PNG, size and alt text. */
export function ogImageMetadata(slug: string, title: string, brand: string) {
  return {
    url: ogImagePath(slug),
    ...OG_SIZE,
    alt: `${brand} — ${title}`,
    type: "image/png",
  }
}

/**
 * The OG images' `Cache-Control`: an hour in browsers and a day in shared caches. Not `immutable`:
 * the path stays the same when a posting's title changes, so a cached image must expire.
 */
export const OG_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400"

/** `response` with `OG_CACHE_CONTROL` in place of whatever `Cache-Control` it carried. */
export function withOgCache(response: Response): Response {
  response.headers.set("cache-control", OG_CACHE_CONTROL)
  return response
}
