import { decodeBase32IgnorePadding } from "@oslojs/encoding"
import { generateHOTP } from "@oslojs/otp"

/** RFC 6238 defaults, the same as the api's: SHA-1, 6 digits, 30-second steps. */
const PERIOD_SECONDS = 30
const DIGITS = 6

/**
 * What an authenticator app would show for `secret` (the base32 key as the account Security page
 * prints it, spaces and all) at `atMs` (epoch milliseconds). Written here rather than imported from
 * `apps/api`: e2e drives the apps from outside, like a person with a phone.
 */
export function totpCode(secret: string, atMs = Date.now()): string {
  const key = decodeBase32IgnorePadding(secret.replace(/\s+/g, "").toUpperCase())
  return generateHOTP(key, BigInt(Math.floor(atMs / 1000 / PERIOD_SECONDS)), DIGITS)
}

/** The step after now's: accepted within the api's ±1 window, and always later than a code the
 * api has just accepted for the current step, which its replay check refuses. */
export const nextStepCode = (secret: string) => totpCode(secret, Date.now() + PERIOD_SECONDS * 1000)
