import { z } from "zod"
import { EmailSchema } from "./auth"
import {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_NAME_MAX,
  SUPPORT_PAGE_MAX,
  SUPPORT_PAGE_PATTERN,
  SUPPORT_RATE_MESSAGE,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  type SupportStatus,
  type SupportTopic,
  supportPage,
  supportReference,
} from "./support-limits"

// Kept narrow on purpose, like realtime.ts: this file imports only zod, ./auth (itself just
// zod plus @repo/i18n/locales's plain constants) and ./support-limits (zod-free), never the main
// index. A browser bundle that reaches it through the "@repo/api-contract/support" subpath should
// import "@repo/api-contract/support-limits" directly instead — apps/help's static contact form
// wants only SUPPORT_TOPICS and must not pull in zod or the whole contract (billing, admin,
// realtime, …). Server code still gets it from the main index, which re-exports everything here.

export type { SupportStatus, SupportTopic }
export {
  SUPPORT_MESSAGE_MAX,
  SUPPORT_MESSAGE_MIN,
  SUPPORT_NAME_MAX,
  SUPPORT_PAGE_MAX,
  SUPPORT_PAGE_PATTERN,
  SUPPORT_RATE_MESSAGE,
  SUPPORT_STATUSES,
  SUPPORT_TOPICS,
  supportPage,
  supportReference,
}

export const SupportCreateSchema = z.object({
  email: EmailSchema,
  name: z.string().trim().max(SUPPORT_NAME_MAX).optional(),
  topic: z.enum(SUPPORT_TOPICS),
  message: z.string().trim().min(SUPPORT_MESSAGE_MIN).max(SUPPORT_MESSAGE_MAX),
  // Anything but a root-relative help path of at most SUPPORT_PAGE_MAX characters (too long, a
  // full URL, not a string) is caught to undefined: dropped, never a reason to refuse the request.
  page: z
    .string()
    .trim()
    .max(SUPPORT_PAGE_MAX)
    .regex(SUPPORT_PAGE_PATTERN)
    .optional()
    .catch(undefined),
})
export type SupportCreateInput = z.infer<typeof SupportCreateSchema>

export const SupportCreateResultSchema = z.object({ reference: z.string() })
