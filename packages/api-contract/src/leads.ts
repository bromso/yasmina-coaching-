/**
 * Zod-free contact-form (lead) vocabulary: safe for a browser bundle that must not pull in zod or
 * the oRPC contract (both rooted in this package's index, which re-exports this module).
 * `apps/www`'s `/kontakt` form reads the option lists and limits from here through
 * `@repo/api-contract/leads`; the zod schemas live in `./leads-schema` (see
 * docs/architecture/leads.md).
 *
 * A lead is one contact request from the coaching site: who is writing (a private person or an
 * organisation), what they need, how soon, and how to reach them. It is address-keyed like a job
 * application, never linked to an account, and deleted `LEAD_RETENTION_MONTHS` after it arrived.
 */

/** Who the request is for: the visitor themself, or an organisation they write on behalf of. */
export const LEAD_AUDIENCES = ["private", "organisation"] as const
export type LeadAudience = (typeof LEAD_AUDIENCES)[number]

/**
 * What the visitor wants help with. Ledarskap inifrån is three separate answers (coaching,
 * mentoring, lifestyle), so the tailored next step can point at the matching start call.
 */
export const LEAD_NEEDS = [
  "coaching",
  "inner_coaching",
  "inner_mentoring",
  "inner_lifestyle",
  "team",
  "talk",
  "unsure",
] as const
export type LeadNeed = (typeof LEAD_NEEDS)[number]

/** How soon: within a month, within three months, or only exploring for now. */
export const LEAD_TIMELINES = ["month", "quarter", "exploring"] as const
export type LeadTimeline = (typeof LEAD_TIMELINES)[number]

/** How the visitor would rather be contacted; `phone` makes the phone number required. */
export const LEAD_CONTACT_METHODS = ["email", "phone"] as const
export type LeadContactMethod = (typeof LEAD_CONTACT_METHODS)[number]

/** A lead's place in the pipeline on `/admin/leads`; every new one starts `new`. */
export const LEAD_STATUSES = ["new", "contacted", "call_booked", "won", "lost"] as const
export type LeadStatus = (typeof LEAD_STATUSES)[number]

/** English labels, for the admin pages and the internal mail (customer copy lives in www). */
export const LEAD_AUDIENCE_LABELS: Record<LeadAudience, string> = {
  private: "Private person",
  organisation: "Organisation",
}
export const LEAD_NEED_LABELS: Record<LeadNeed, string> = {
  coaching: "Leadership coaching, one to one",
  inner_coaching: "Ledarskap inifrån: coaching",
  inner_mentoring: "Ledarskap inifrån: mentoring",
  inner_lifestyle: "Ledarskap inifrån: lifestyle change",
  team: "Team development or supervision",
  talk: "Workshop, talk or keynote",
  unsure: "Not sure yet",
}
export const LEAD_TIMELINE_LABELS: Record<LeadTimeline, string> = {
  month: "Within a month",
  quarter: "Within three months",
  exploring: "Just exploring",
}
export const LEAD_CONTACT_METHOD_LABELS: Record<LeadContactMethod, string> = {
  email: "Email",
  phone: "Phone",
}
export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  new: "New",
  contacted: "Contacted",
  call_booked: "Call booked",
  won: "Won",
  lost: "Lost",
}

export const LEAD_NAME_MAX = 100
export const LEAD_MESSAGE_MAX = 2000
export const LEAD_PHONE_MAX = 40
export const LEAD_ORGANISATION_MAX = 120
export const LEAD_ROLE_MAX = 100
/** `admin.leads.update`'s own notes, never shown to the visitor. */
export const LEAD_NOTES_MAX = 5000
export const LEAD_PAGE_MAX = 200
/** A root-relative www path (`/kontakt`): lowercase letters, digits, `/` and `-` only. */
export const LEAD_PAGE_PATTERN = /^\/[a-z0-9/-]*$/

/** How long a lead is kept before `leads.prune` deletes it. */
export const LEAD_RETENTION_MONTHS = 12

/** `leads.create`'s refusal once the per-client, per-recipient or api-wide limit trips. */
export const LEAD_RATE_MESSAGE = "Too many requests, try again later."

/** The reference a lead is known by, in mail, on the done page and in admin: `LEAD-<id>`. */
export const leadReference = (id: number) => `LEAD-${id}`

/**
 * The page a request was sent from, when it is a root-relative www path of at most
 * `LEAD_PAGE_MAX` characters; anything else is null (dropped, never a refusal), like support's.
 */
export function leadPage(page: string | null | undefined): string | null {
  if (typeof page !== "string") return null
  const trimmed = page.trim()
  return trimmed.length <= LEAD_PAGE_MAX && LEAD_PAGE_PATTERN.test(trimmed) ? trimmed : null
}

/**
 * The tailored next step a visitor sees on `/kontakt/tack` and in their confirmation mail:
 *
 * - `inner` — a Ledarskap inifrån answer: book that service's start call (`/book/inner_start_*`).
 * - `coaching` — leadership coaching: Yasmina offers the free intro call; a session can be booked
 *   straight away (`/book/session`).
 * - `proposal` — team development, a workshop or a talk: Yasmina comes back with a proposal; the
 *   matching request form (`/book/workshop`, `/book/keynote`) is there for dates.
 * - `explore` — not sure yet, or only exploring coaching or the inifrån track: reading first (two
 *   blog posts and `/inifran`), with no booking pushed.
 *
 * `path` is a www path (no host): the done page links it as is, the api prefixes www's own URL.
 */
export type LeadNextStepKind = "inner" | "coaching" | "proposal" | "explore"
export type LeadNextStep = { kind: LeadNextStepKind; path: string }

const INNER_START: Record<"inner_coaching" | "inner_mentoring" | "inner_lifestyle", string> = {
  inner_coaching: "/book/inner_start_coaching",
  inner_mentoring: "/book/inner_start_mentoring",
  inner_lifestyle: "/book/inner_start_lifestyle",
}

/** The one rule both the done page and the confirmation mail follow (see `LeadNextStep`). */
export function leadNextStep(answers: {
  audience: LeadAudience
  need: LeadNeed
  timeline: LeadTimeline
}): LeadNextStep {
  const { need, timeline } = answers
  if (need === "unsure") return { kind: "explore", path: "/inifran" }
  if (need === "team") return { kind: "proposal", path: "/book/workshop" }
  if (need === "talk") return { kind: "proposal", path: "/book/keynote" }
  // Coaching and the inifrån track are personal: someone only exploring is not pushed to book.
  if (timeline === "exploring") return { kind: "explore", path: "/inifran" }
  if (need === "coaching") return { kind: "coaching", path: "/book/session" }
  return { kind: "inner", path: INNER_START[need] }
}

export const isLeadAudience = (v: unknown): v is LeadAudience =>
  typeof v === "string" && (LEAD_AUDIENCES as readonly string[]).includes(v)
export const isLeadNeed = (v: unknown): v is LeadNeed =>
  typeof v === "string" && (LEAD_NEEDS as readonly string[]).includes(v)
export const isLeadTimeline = (v: unknown): v is LeadTimeline =>
  typeof v === "string" && (LEAD_TIMELINES as readonly string[]).includes(v)
export const isLeadStatus = (v: unknown): v is LeadStatus =>
  typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v)
