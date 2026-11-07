import { OG_SIZE } from "@repo/ui/lib/og"

/** The file name every docs page's OG image is served under, below `/og/<page>/`. */
export const OG_FILE = "image.png"

/**
 * A docs page's OG image path: `/og/image.png` for `/`, `/og/guides/deploying/image.png` for
 * `/guides/deploying`. A route handler serves them (`app/og/[...slug]/route.ts`): Next refuses an
 * `opengraph-image` file below the optional catch-all `[[...slug]]` page.
 */
export function ogImagePath(url: string): string {
  return `/og${url === "/" ? "" : url}/${OG_FILE}`
}

/** The page slugs an OG image route's `slug` names (its last segment is `OG_FILE`), or `undefined`
 * when it does not end in `OG_FILE`. */
export function pageSlugsOf(slug: string[]): string[] | undefined {
  return slug.at(-1) === OG_FILE ? slug.slice(0, -1) : undefined
}

/** A page's OG and Twitter image metadata: its prerendered PNG, size and alt text. */
export function ogImageMetadata(url: string, title: string, brand: string) {
  return { url: ogImagePath(url), ...OG_SIZE, alt: `${brand} — ${title}`, type: "image/png" }
}

/**
 * The OG images' `Cache-Control`: an hour in browsers and a day in shared caches. Not `immutable`:
 * the path stays the same when a page's title changes, so a cached image must expire.
 */
export const OG_CACHE_CONTROL = "public, max-age=3600, s-maxage=86400"

/** `response` with `OG_CACHE_CONTROL` in place of whatever `Cache-Control` it carried. */
export function withOgCache(response: Response): Response {
  response.headers.set("cache-control", OG_CACHE_CONTROL)
  return response
}
