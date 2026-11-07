// Client-safe (imports nothing): the header bell's `aria-current="page"` on `/notifications`,
// shared by the `(account)` layout (server) and `BellCurrent` on the Notifications page (browser).

/** The page the bell links to. */
export const NOTIFICATIONS_PATH = "/notifications"

/**
 * Whether the request's URL (the `x-url` header the shared security proxy sets) is the
 * Notifications page, with or without its query string. A missing or unparseable URL is not.
 */
export function isNotificationsUrl(url: string | null | undefined): boolean {
  if (!url) return false
  try {
    return new URL(url).pathname === NOTIFICATIONS_PATH
  } catch {
    return false
  }
}

const BELL_LINK = '[data-slot="notification-bell"] a'

/**
 * Marks the header bell's link `aria-current="page"` and returns the undo. The layout renders the
 * bell's `current` per request, but a layout is not re-rendered on a soft navigation (a sidebar
 * `<Link>`), so the Notifications page corrects it in the browser: set while the page is mounted,
 * removed when it unmounts. Lives on that page alone, so no other page ships it.
 */
export function markBellCurrent(doc: Pick<Document, "querySelector"> = document): () => void {
  const link = doc.querySelector(BELL_LINK)
  if (!link) return () => {}
  link.setAttribute("aria-current", "page")
  return () => link.removeAttribute("aria-current")
}
