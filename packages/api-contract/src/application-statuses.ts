/**
 * Zod-free application-status constants: safe for a browser bundle that must not pull in zod or
 * the oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is not
 * part of). `jobs.ts` imports these and re-exports them, so every existing `@repo/api-contract`
 * import keeps working; a client component (like `apps/auth`'s `ApplicationStatusForm`) imports
 * them from here instead.
 */

/** A job application's lifecycle on `/admin/applications`; every new one starts `new`. */
export const APPLICATION_STATUSES = ["new", "reviewing", "rejected", "hired"] as const
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]
