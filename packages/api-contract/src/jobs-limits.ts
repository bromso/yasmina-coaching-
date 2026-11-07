/**
 * Zod-free job-application constants and helpers: safe for a browser bundle that must not pull in
 * zod or the oRPC contract (both are rooted in `@repo/api-contract`'s index, which this module is
 * not part of). `jobs.ts` imports these and re-exports them, so every existing
 * `@repo/api-contract` import keeps working; a client component (like `apps/jobs`'s `ApplyForm`)
 * imports them from here instead.
 */

/** The largest CV `jobs.apply` accepts, checked before the file is read. */
export const MAX_CV_BYTES = 5 * 1024 * 1024
/** `jobs.apply`'s refusal for a CV that is not a PDF of at most `MAX_CV_BYTES`. */
export const CV_UPLOAD_MESSAGE = "Upload your CV as a PDF up to 5 MB."
/** `jobs.apply`'s refusal once the per-client, per-recipient or api-wide limit trips. */
export const JOBS_RATE_MESSAGE = "Too many applications, try again later."
/** The file input's `accept`. Only a hint: the api checks the bytes, never the declared type. */
export const CV_ACCEPT = "application/pdf"
/** How long an application (row and CV) is kept before `applications.prune` deletes it. */
export const APPLICATION_RETENTION_MONTHS = 6

export const APPLICATION_NAME_MAX = 100
export const APPLICATION_TITLE_MAX = 200
export const APPLICATION_LINK_MAX = 300
export const APPLICATION_NOTE_MAX = 3000
/** A posting's slug as the jobs app builds it: lowercase letters, digits and `-`. */
export const JOB_SLUG_PATTERN = /^[a-z0-9-]{1,100}$/

/**
 * A CV's storage key (`applications/<random>.pdf`). Kept apart from `FILE_KEY_PATTERN` on
 * purpose (a different prefix and extension), so `files.get` can never serve a CV: only the
 * superadmin download does.
 */
export const CV_KEY_PATTERN = /^applications\/[A-Za-z0-9_-]{22}\.pdf$/

/** The reference an application is known by, in mail and on the admin page: `JOB-<id>`. */
export const jobReference = (id: number) => `JOB-${id}`

/**
 * The applicant's link when it is an `https://` URL of at most `APPLICATION_LINK_MAX` characters;
 * anything else is null. The api applies it to whatever it is sent, so a bad link is dropped
 * rather than refusing the application.
 */
export function applicationLink(link: string | null | undefined): string | null {
  if (typeof link !== "string") return null
  const trimmed = link.trim()
  if (trimmed.length > APPLICATION_LINK_MAX || !trimmed.startsWith("https://")) return null
  try {
    return new URL(trimmed).protocol === "https:" ? trimmed : null
  } catch {
    return null
  }
}
