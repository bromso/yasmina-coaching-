/**
 * Recovery codes: 10 single-use backup codes for signing in when the authenticator app is
 * unavailable. High-entropy, like the tokens in ./credentials.ts — hash with that module's
 * `tokenHash()` before storing (Task 2+ wires up the database side).
 */

const ALPHABET = "abcdefghijklmnopqrstuvwxyz234567" // RFC 4648 base32 alphabet, lower case
const GROUP_LENGTH = 5
const DEFAULT_COUNT = 10
const CODE_PATTERN = /^[a-z2-7]{5}-[a-z2-7]{5}$/

function randomCode(): string {
  const bytes = new Uint8Array(GROUP_LENGTH * 2)
  crypto.getRandomValues(bytes)
  const chars = Array.from(bytes, (byte) => ALPHABET[byte & 0x1f])
  return `${chars.slice(0, GROUP_LENGTH).join("")}-${chars.slice(GROUP_LENGTH).join("")}`
}

/** `count` unique recovery codes, each `"xxxxx-xxxxx"` (lowercase base32 alphabet). */
export function generateRecoveryCodes(count: number = DEFAULT_COUNT): string[] {
  const codes = new Set<string>()
  while (codes.size < count) {
    codes.add(randomCode())
  }
  return [...codes]
}

/**
 * Trims, lowercases and reformats as `"xxxxx-xxxxx"`; null when the result is not a valid code
 * (wrong length or a character outside the base32 alphabet).
 */
export function normalizeRecoveryCode(input: string): string | null {
  const cleaned = input.trim().toLowerCase().replace(/[\s-]/g, "")
  if (cleaned.length !== GROUP_LENGTH * 2) return null
  const candidate = `${cleaned.slice(0, GROUP_LENGTH)}-${cleaned.slice(GROUP_LENGTH)}`
  return CODE_PATTERN.test(candidate) ? candidate : null
}

/** Whether `input` could plausibly be a recovery code (format only, not checked against storage). */
export function looksLikeRecoveryCode(input: string): boolean {
  return normalizeRecoveryCode(input) !== null
}
