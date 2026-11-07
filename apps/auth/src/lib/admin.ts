import { type Me, SUSPEND_UNTIL_MAX_DAYS } from "@repo/api-contract"

/** The admin pages and the Admin link exist only for a superadmin who is not impersonating. */
export const canUseAdmin = (me: Me | null): boolean =>
  me?.user.superadmin === true && me.impersonation === null

/** `?cursor=` from the URL: a positive safe integer, or undefined (the first page). */
export function parseCursor(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined
  const cursor = Number(value)
  return Number.isSafeInteger(cursor) && cursor > 0 ? cursor : undefined
}

export const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)

/**
 * `?job=` on `/admin/applications`: a non-empty role slug, or undefined (no filter). Longer than
 * 100 characters (the contract's `job` max) is also undefined — the api would reject it with a
 * validation error that would crash the page, so an over-long value never reaches it.
 */
export function parseJob(value: string | string[] | undefined): string | undefined {
  const v = first(value)
  const trimmed = typeof v === "string" ? v.trim() : ""
  return trimmed && trimmed.length <= 100 ? trimmed : undefined
}

/** `?days=` on `/admin/analytics`: 7, 30 or 90 only — anything else (missing, malformed, out of
 * range) falls back to 7, silently, not an error. */
export function parseDays(value: string | string[] | undefined): 7 | 30 | 90 {
  const v = first(value)
  return v === "30" ? 30 : v === "90" ? 90 : 7
}

/** `?suspended=` on `/admin/users`: the literal `"true"` is the only filter value the contract's
 * `AdminUserListSchema` accepts; anything else (missing, "false", malformed) is no filter. */
export function parseSuspended(value: string | string[] | undefined): true | undefined {
  return first(value) === "true" ? true : undefined
}

/**
 * The `<input type="date">` `min`/`max` hint for `admin.users.suspend`'s `until` — tomorrow
 * through the last day whose converted `until` is still within `SUSPEND_UNTIL_MAX_DAYS` days of
 * `now`, as `YYYY-MM-DD` in UTC (the limit only grows while the page is open, so a day offered
 * at render is still accepted at submission). A hint only: the api is the
 * one that actually enforces "future" and "at most 365 days ahead" (`SuspensionForm`'s submission
 * still goes through it unchanged for an out-of-range date).
 */
export function suspendUntilBounds(now: Date = new Date()): { min: string; max: string } {
  const toDateString = (d: Date) => d.toISOString().slice(0, 10)
  const min = new Date(now)
  min.setUTCDate(min.getUTCDate() + 1)
  // A picked day becomes "until the start of the next UTC day" (`untilFromDateInput`), and the api
  // accepts an `until` at most SUSPEND_UNTIL_MAX_DAYS × 24 h from now. So the last day offered is
  // the one before the UTC day that limit falls on: its end is at or before the limit.
  const limit = new Date(now.getTime() + SUSPEND_UNTIL_MAX_DAYS * 24 * 60 * 60 * 1000)
  const max = new Date(
    Date.UTC(limit.getUTCFullYear(), limit.getUTCMonth(), limit.getUTCDate() - 1)
  )
  return { min: toDateString(min), max: toDateString(max) }
}

/**
 * `/admin/audit`'s Export card default From/To: the last 30 UTC days, i.e. today−29 through
 * today, as `YYYY-MM-DD` — matching `admin.audit.export`'s own whole-UTC-days-inclusive range.
 */
export function auditExportDefaultRange(now: Date = new Date()): { from: string; to: string } {
  const toDateString = (d: Date) => d.toISOString().slice(0, 10)
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const from = new Date(to)
  from.setUTCDate(from.getUTCDate() - 29)
  return { from: toDateString(from), to: toDateString(to) }
}

/**
 * `/admin/audit`'s Export card `min`/`max` for From and To, computed on the server: `min` is the
 * oldest UTC day an entry can still exist (today − `rowDays`, `AUDIT_RETENTION_DAYS`), `max`
 * tomorrow's UTC date — the latest `to` `admin.audit.export` accepts (`isToWithinBounds`).
 */
export function auditExportDateBounds(now: Date, rowDays: number): { min: string; max: string } {
  const toDateString = (d: Date) => d.toISOString().slice(0, 10)
  const day = (offset: number) =>
    new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset))
  return { min: toDateString(day(-rowDays)), max: toDateString(day(1)) }
}

// Fixed locale and zone: server render and hydration must print the same string. Assembled from
// parts because the runtimes join date and time differently (Bun "at", Node ","); the parts agree.
const dateTime = new Intl.DateTimeFormat("en", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "UTC",
})
export function formatDateTime(iso: string): string {
  const parts: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const part of dateTime.formatToParts(new Date(iso))) parts[part.type] = part.value
  return `${parts.month} ${parts.day}, ${parts.year}, ${parts.hour}:${parts.minute} UTC`
}
