/** How long `LiveNotificationRefresh` gathers `notification.created` events into one refresh. */
export const NOTIFICATION_REFRESH_DEBOUNCE_MS = 1_000

/**
 * The type of one `/api/events/me` message, or null for anything else (unparseable, an unknown
 * type, a malformed `notification.created`). A hand-written check rather than the contract's
 * `UserRealtimeEventSchema`: the wrapper mounts on every page of the app, and only the type
 * matters to it — the event's id is never read — so zod stays out of every page's bundle.
 */
export function userStreamEventType(raw: string): "notification.created" | "resync" | null {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== "object" || data === null) return null
  const { type, id } = data as { type?: unknown; id?: unknown }
  if (type === "resync") return "resync"
  if (type === "notification.created" && Number.isInteger(id) && (id as number) > 0) {
    return "notification.created"
  }
  return null
}
