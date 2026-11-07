/**
 * A cookieless, per-day, per-app visitor hash: the first 16 hex chars of
 * `sha256(salt + ":" + app + ":" + ip + ":" + userAgent)`. The same salt (one per UTC day), app,
 * ip and user agent always hash to the same id; a different day's salt, another app or another ip
 * never match. `ip` and `userAgent` are consumed only here — the caller never stores them.
 */
export function visitorId(salt: string, app: string, ip: string, userAgent: string): string {
  const key = `${salt}:${app}:${ip}:${userAgent}`
  return new Bun.CryptoHasher("sha256").update(key).digest("hex").slice(0, 16)
}
