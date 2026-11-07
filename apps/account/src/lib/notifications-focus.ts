// Client-safe (imports nothing): shared by the Notifications page's server view and its mark
// forms, which run in the browser.

/** The list's heading id: the paging links land on it, and focus goes there after a mark. */
export const NOTIFICATIONS_HEADING_ID = "notifications-heading"

/**
 * A mark form that held focus has just unmounted — its row was marked read (or every row was),
 * so the server re-render dropped it — and focus fell to the page's body: move it to the list's
 * heading (focusable from script, never a tab stop: `SettingsCard`'s `titleId`), as the passkeys
 * card does after a removal. Focus the user has already moved elsewhere is left alone.
 */
export function focusHeadingIfLost(
  hadFocus: boolean,
  doc: Pick<Document, "getElementById" | "activeElement" | "body"> = document
): boolean {
  if (!hadFocus) return false
  const active = doc.activeElement
  if (active && active !== doc.body && active.isConnected) return false
  const heading = doc.getElementById(NOTIFICATIONS_HEADING_ID)
  if (!heading) return false
  heading.focus()
  return true
}
