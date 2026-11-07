import { BRAND_NAME } from "@repo/sites"

/** Every feed's own title, and the title each page's `<link rel="alternate">` gives it. */
export const FEED_TITLE = `${BRAND_NAME} Blog`

/**
 * The RSS, Atom and JSON feed links for a page's `alternates.types`. Next replaces (never
 * merges) a segment's whole `alternates` object with its parent's, so the root layout's own
 * `alternates.types` is wiped out on every page here — each sets its own `alternates.canonical`.
 * Every page that does spreads this alongside its canonical so the feeds stay discoverable there
 * too; the layout keeps it for the rare page that sets no `alternates` of its own.
 */
export const FEED_TYPES = {
  "application/rss+xml": [{ url: "/rss.xml", title: FEED_TITLE }],
  "application/atom+xml": [{ url: "/atom.xml", title: FEED_TITLE }],
  "application/feed+json": [{ url: "/feed.json", title: FEED_TITLE }],
}

/** A page's whole `alternates`: its own `canonical` plus `FEED_TYPES`, in one call — every page
 * below uses this instead of repeating the "alternates replaces, not merges" comment each time. */
export function pageAlternates(canonical: string) {
  return { canonical, types: FEED_TYPES }
}
