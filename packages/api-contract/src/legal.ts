/**
 * Zod-free legal constants, safe for any bundle (`@repo/api-contract/legal`).
 *
 * `TERMS_VERSION` names the terms a booking accepts: the newest change date in the terms page's
 * change log (`apps/legal/content/pages/villkor.mdx` and its English twin). `apps/api` stamps it
 * on every booking, with the time of acceptance; the visitor only sends `termsAccepted: true`, so
 * the version is never taken from the client. A new entry in the terms' change log moves this
 * value with it: `apps/legal/src/lib/terms-version.test.ts` fails until it does.
 */
export const TERMS_VERSION = "2026-11-12"
