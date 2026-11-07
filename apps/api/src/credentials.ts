/** Tokens and password hashing. Nothing here touches the database. */

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
export const RESET_TTL_MS = 60 * 60 * 1000
export const VERIFY_TTL_MS = 24 * 60 * 60_000
export const MAGIC_TTL_MS = 15 * 60_000
export const INVITE_TTL_MS = 7 * 24 * 60 * 60_000
/** An email change's confirm link (to the new address) and cancel link (to the current one). */
export const EMAIL_CHANGE_TTL_MS = 24 * 60 * 60_000
/** The undo link mailed to the old address once a change is confirmed. */
export const EMAIL_CHANGE_REVERT_TTL_MS = 7 * 24 * 60 * 60_000
/** How long a sign-in's two-factor challenge lives, and how many wrong codes burn it. */
export const TWO_FACTOR_CHALLENGE_TTL_MS = 5 * 60_000
/** A passkey registration or sign-in challenge: single-use, hashed, like the two-factor one. */
export const PASSKEY_CHALLENGE_TTL_MS = 5 * 60_000
export const TWO_FACTOR_MAX_WRONG_CODES = 5
/** How often `auth.me` refreshes a session's last_seen_at. */
export const TOUCH_INTERVAL_MS = 24 * 60 * 60 * 1000

/** 32 random bytes, base64url: the value handed to the client exactly once. */
export function newToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Buffer.from(bytes).toString("base64url")
}

/** What the database stores and looks up; a dump cannot be turned back into tokens. */
export function tokenHash(token: string): string {
  return new Bun.CryptoHasher("sha256").update(token).digest("hex")
}

export const hashPassword = (password: string) => Bun.password.hash(password)
export const verifyPassword = (password: string, hash: string) =>
  Bun.password.verify(password, hash)

/** Verified against when the email is unknown, so a miss costs as much as a wrong password. */
export const DUMMY_HASH = hashPassword("dummy-password-never-matches")
