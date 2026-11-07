import { z } from "zod"
import { APPLICATION_STATUSES, type ApplicationStatus } from "./application-statuses"
import { EmailSchema } from "./auth"
import { STORAGE_UNAVAILABLE_MESSAGE } from "./files"
import {
  APPLICATION_LINK_MAX,
  APPLICATION_NAME_MAX,
  APPLICATION_NOTE_MAX,
  APPLICATION_RETENTION_MONTHS,
  APPLICATION_TITLE_MAX,
  applicationLink,
  CV_ACCEPT,
  CV_KEY_PATTERN,
  CV_UPLOAD_MESSAGE,
  JOB_SLUG_PATTERN,
  JOBS_RATE_MESSAGE,
  jobReference,
  MAX_CV_BYTES,
} from "./jobs-limits"

// Kept narrow on purpose, like support.ts: this file imports only zod, ./application-statuses,
// ./auth, ./files (zod only itself) and ./jobs-limits (zod-free), never the main
// index. apps/jobs's static apply form reaches it through the "@repo/api-contract/jobs" subpath
// (for the limits and messages below) and must not pull in the whole contract. A browser
// component that needs only these limits (like apps/jobs's ApplyForm) should import
// "@repo/api-contract/jobs-limits" directly instead — this file still imports zod for
// `JobApplySchema`. Server code still gets it from the main index, which re-exports everything
// here.

export type { ApplicationStatus }
export {
  APPLICATION_LINK_MAX,
  APPLICATION_NAME_MAX,
  APPLICATION_NOTE_MAX,
  APPLICATION_RETENTION_MONTHS,
  APPLICATION_STATUSES,
  APPLICATION_TITLE_MAX,
  applicationLink,
  CV_ACCEPT,
  CV_KEY_PATTERN,
  CV_UPLOAD_MESSAGE,
  JOB_SLUG_PATTERN,
  JOBS_RATE_MESSAGE,
  jobReference,
  MAX_CV_BYTES,
}

export const JobApplySchema = z.object({
  job: z.string().regex(JOB_SLUG_PATTERN),
  title: z.string().trim().min(1).max(APPLICATION_TITLE_MAX),
  name: z.string().trim().min(1).max(APPLICATION_NAME_MAX),
  email: EmailSchema,
  // Not an `https://` URL of at most APPLICATION_LINK_MAX characters → dropped, never refused.
  link: z
    .string()
    .optional()
    .catch(undefined)
    .transform((value) => applicationLink(value) ?? undefined),
  note: z.string().trim().max(APPLICATION_NOTE_MAX).optional(),
  // No size limit here on purpose (like `ImageUploadSchema`): the api checks the size itself and
  // answers the declared `CV_UPLOAD_MESSAGE`, where a schema `max` would answer an undeclared one.
  cv: z.file(),
})
export type JobApplyInput = z.input<typeof JobApplySchema>

export const JobApplyResultSchema = z.object({ reference: z.string() })

export const JobApplyErrors = {
  BAD_REQUEST: { message: CV_UPLOAD_MESSAGE },
  TOO_MANY_REQUESTS: { message: JOBS_RATE_MESSAGE },
  SERVICE_UNAVAILABLE: { message: STORAGE_UNAVAILABLE_MESSAGE },
} as const
