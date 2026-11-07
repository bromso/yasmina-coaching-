import { OG_SIZE } from "@repo/ui/lib/og"

/** The file name every article's OG image is served under, below `/og/<category>/<article>/`. */
export const OG_FILE = "image.png"

/**
 * An article's OG image path: `/og/getting-started/create-an-account/image.png`. A route handler
 * serves them (`app/og/[...path]/route.ts`): Next refuses a literal segment after a catch-all, so
 * `OG_FILE` is the catch-all's own last entry, exactly as `apps/docs`'s own route does.
 */
export function ogImagePath(category: string, slug: string): string {
  return `/og/${category}/${slug}/${OG_FILE}`
}

/** The article's `[category, slug]` a `/og/[...path]` route's `path` names (its last segment is
 * `OG_FILE`), or `undefined` when it does not end in `OG_FILE` or does not name exactly one. */
export function articleSlugsOf(path: string[]): [string, string] | undefined {
  if (path.at(-1) !== OG_FILE || path.length !== 3) return undefined
  const [category, slug] = path
  return category && slug ? [category, slug] : undefined
}

/** An article's OG and Twitter image metadata: its prerendered PNG, size and alt text. */
export function ogImageMetadata(category: string, slug: string, title: string, brand: string) {
  return {
    url: ogImagePath(category, slug),
    ...OG_SIZE,
    alt: `${brand} — ${title}`,
    type: "image/png",
  }
}

/**
 * The OG images' `Cache-Control`: an hour in browsers and a day in shared caches. Not `immutable`:
 * the path stays the same when an article's title changes, so a cached image must expire.
 */
export const OG_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400"

/** `response` with `OG_CACHE_CONTROL` in place of whatever `Cache-Control` it carried. */
export function withOgCache(response: Response): Response {
  response.headers.set("cache-control", OG_CACHE_CONTROL)
  return response
}
