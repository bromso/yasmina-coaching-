/**
 * What the sessions list will show for this sign-in, and the per-browser rate-limit key.
 * Informational; never trusted for auth.
 *
 * Only a proxy that sets/overwrites these makes the value the browser's; behind an appending
 * proxy or none at all, treat the per-browser bucket as best-effort.
 */
export function requestInfo(h: Headers): { userAgent?: string; ip?: string } {
  const userAgent = h.get("user-agent")?.slice(0, 500) || undefined
  const realIp = h.get("x-real-ip")?.trim()
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim()
  const ip = (realIp || forwarded || undefined)?.slice(0, 45)
  return { userAgent, ip }
}
