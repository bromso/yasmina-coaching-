export const CONSENT_COOKIE = "consent"
export const CONSENT_MAX_AGE = 15_552_000 // 180 days
export type Consent = "all" | "necessary"

/** Reads the consent cookie out of a Cookie header: the first recognised value wins, unrecognised
 * duplicates are skipped, and no recognised value at all is "no choice yet". */
export function parseConsent(cookieHeader: string | null | undefined): Consent | null {
  if (!cookieHeader) return null
  for (const part of cookieHeader.split(";")) {
    const [name, ...rest] = part.split("=")
    if (name?.trim() !== CONSENT_COOKIE) continue
    const value = rest.join("=").trim()
    if (value === "all" || value === "necessary") return value
  }
  return null
}

/** The cookie string the banner writes (also valid as a Set-Cookie value). */
export function consentCookie(
  value: Consent,
  { domain, secure }: { domain?: string; secure: boolean }
): string {
  const parts = [
    `${CONSENT_COOKIE}=${value}`,
    "Path=/",
    `Max-Age=${CONSENT_MAX_AGE}`,
    "SameSite=Lax",
  ]
  if (domain) parts.push(`Domain=${domain}`)
  if (secure) parts.push("Secure")
  return parts.join("; ")
}
