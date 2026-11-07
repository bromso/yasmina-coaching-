/**
 * TOTP (RFC 6238): secret generation, the otpauth:// URL and window/replay verification.
 * SHA-1, 6 digits, 30 s — @oslojs/otp's defaults, checked against the RFC 6238 Appendix B vectors.
 */

import { encodeBase32UpperCaseNoPadding } from "@oslojs/encoding"
import { createTOTPKeyURI, generateHOTP, verifyHOTP } from "@oslojs/otp"

export const TOTP_PERIOD_SECONDS = 30
const TOTP_DIGITS = 6
const TOTP_SECRET_BYTES = 20

/** 20 random bytes: the shared secret behind a user's authenticator app entry. */
export function generateTotpSecret(): Uint8Array {
  const secret = new Uint8Array(TOTP_SECRET_BYTES)
  crypto.getRandomValues(secret)
  return secret
}

/** Base32, no padding, upper case — shown to the user and embedded in the otpauth URL. */
export function encodeSecret(secret: Uint8Array): string {
  return encodeBase32UpperCaseNoPadding(secret)
}

/** The otpauth:// URL an authenticator app scans to add this account. */
export function otpauthUrl(secret: Uint8Array, account: string, issuer: string): string {
  return createTOTPKeyURI(issuer, account, secret, TOTP_PERIOD_SECONDS, TOTP_DIGITS)
}

/**
 * The matched time step, or null — never throws, even given a malformed `code` or a non-finite
 * `now`. Checks steps now-1, now and now+1 (±1 window) and refuses any step that is not greater
 * than `lastStep` (replay protection): a code already accepted, or one from a step before it, is
 * never accepted again. `now` is Unix seconds, defaulting to the current time. The comparison at
 * each step is constant-time (@oslojs/otp's `verifyHOTP`).
 */
export function verifyTotp(
  secret: Uint8Array,
  code: string,
  lastStep: number | null,
  now: number = Math.floor(Date.now() / 1000)
): number | null {
  if (!Number.isFinite(now)) return null
  const currentStep = Math.floor(now / TOTP_PERIOD_SECONDS)
  for (const step of [currentStep - 1, currentStep, currentStep + 1]) {
    if (step < 0) continue
    if (lastStep !== null && step <= lastStep) continue
    if (verifyHOTP(secret, BigInt(step), TOTP_DIGITS, code)) return step
  }
  return null
}

/** The code an authenticator app shows at `now` (Unix seconds): for tests and fixtures. */
export function totpCodeAt(secret: Uint8Array, now: number): string {
  return generateHOTP(secret, BigInt(Math.floor(now / TOTP_PERIOD_SECONDS)), TOTP_DIGITS)
}
