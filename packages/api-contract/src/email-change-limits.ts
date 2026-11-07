/**
 * Dependency-free email-change constants: safe for a browser bundle that must not pull in zod or
 * the oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not
 * part of). `email-change.ts` imports this and re-exports it, so every existing
 * `@repo/api-contract` import keeps working; a client component imports it from here instead.
 */

/** `account.email.requestChange`'s own limiter (`email-change:<userId>`): past this many attempts
 * within `EMAIL_CHANGE_RATE_WINDOW_MS` the api answers `TOO_MANY_REQUESTS`
 * `EMAIL_CHANGE_RATE_MESSAGE`. */
export const EMAIL_CHANGE_RATE_LIMIT = 3
export const EMAIL_CHANGE_RATE_WINDOW_MS = 15 * 60 * 1000
