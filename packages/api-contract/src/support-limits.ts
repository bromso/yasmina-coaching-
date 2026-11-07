/**
 * Zod-free help-center-support constants and helpers: safe for a browser bundle that must not
 * pull in zod or the oRPC contract (both are rooted in `@repo/api-contract`'s index, which this
 * module is not part of). `support.ts` imports these and re-exports them, so every existing
 * `@repo/api-contract` import keeps working; a client component (like `apps/help`'s
 * `ContactForm`) imports them from here instead.
 */

/** What a help-center contact request is about; the form labels each one. */
export const SUPPORT_TOPICS = ["account", "billing", "bug", "other"] as const
export type SupportTopic = (typeof SUPPORT_TOPICS)[number]

/** A support request's lifecycle: `open` until an admin marks it resolved. */
export const SUPPORT_STATUSES = ["open", "resolved"] as const
export type SupportStatus = (typeof SUPPORT_STATUSES)[number]

export const SUPPORT_NAME_MAX = 100
export const SUPPORT_MESSAGE_MIN = 10
export const SUPPORT_MESSAGE_MAX = 5000
export const SUPPORT_PAGE_MAX = 200
/** A root-relative help path (`/billing/plans`): lowercase letters, digits, `/` and `-` only. */
export const SUPPORT_PAGE_PATTERN = /^\/[a-z0-9/-]*$/

/** `support.create`'s refusal once the per-ip, per-recipient or api-wide limit trips. */
export const SUPPORT_RATE_MESSAGE = "Too many requests, try again later."

/** The reference a support request is known by, in mail and on the form: `HELP-<id>`. */
export const supportReference = (id: number) => `HELP-${id}`

/**
 * The page a request was sent from, when it is a root-relative help path of at most
 * `SUPPORT_PAGE_MAX` characters; anything else is null. The api applies it to whatever it is sent,
 * so a bad `page` is dropped rather than refusing the request.
 */
export function supportPage(page: string | null | undefined): string | null {
  if (typeof page !== "string") return null
  const trimmed = page.trim()
  return trimmed.length <= SUPPORT_PAGE_MAX && SUPPORT_PAGE_PATTERN.test(trimmed) ? trimmed : null
}
