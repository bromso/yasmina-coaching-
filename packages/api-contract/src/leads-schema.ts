import { z } from "zod"
import { EmailSchema } from "./auth"
import {
  LEAD_AUDIENCES,
  LEAD_CONTACT_METHODS,
  LEAD_MESSAGE_MAX,
  LEAD_NAME_MAX,
  LEAD_NEEDS,
  LEAD_NOTES_MAX,
  LEAD_ORGANISATION_MAX,
  LEAD_PAGE_MAX,
  LEAD_PAGE_PATTERN,
  LEAD_PHONE_MAX,
  LEAD_RATE_MESSAGE,
  LEAD_ROLE_MAX,
  LEAD_STATUSES,
  LEAD_TIMELINES,
} from "./leads"

// The `leads.*` and `admin.leads.*` shapes. Kept apart from the dependency-free `./leads` (which
// apps/www's client form imports) because these need zod; this file imports only zod, ./auth and
// ./leads, never the main index, which re-exports everything here.

const Id = z.number().int().positive()
const CoercedId = z.coerce.number().int().positive()
const Iso = z.iso.datetime()
const Who = z.object({ id: Id, email: z.string() })

/** An empty or whitespace-only optional field is the same as leaving it out. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined))

/**
 * What `/kontakt` sends. `organisation` is required for an organisation (and dropped for a
 * private person by the api); `phone` is required when the visitor asks to be phoned. Consent to
 * be contacted about this request must be given; the newsletter box is separate and never
 * assumed. A bad `page` is caught to undefined, never a refusal (like support's).
 */
export const LeadCreateSchema = z
  .object({
    audience: z.enum(LEAD_AUDIENCES),
    need: z.enum(LEAD_NEEDS),
    timeline: z.enum(LEAD_TIMELINES),
    message: optionalText(LEAD_MESSAGE_MAX),
    name: z.string().trim().min(1).max(LEAD_NAME_MAX),
    email: EmailSchema,
    phone: optionalText(LEAD_PHONE_MAX),
    organisation: optionalText(LEAD_ORGANISATION_MAX),
    role: optionalText(LEAD_ROLE_MAX),
    contactMethod: z.enum(LEAD_CONTACT_METHODS),
    consent: z.literal(true),
    newsletter: z.boolean().default(false),
    page: z.string().trim().max(LEAD_PAGE_MAX).regex(LEAD_PAGE_PATTERN).optional().catch(undefined),
  })
  .superRefine((lead, ctx) => {
    if (lead.audience === "organisation" && !lead.organisation) {
      ctx.addIssue({ code: "custom", path: ["organisation"], message: "Required" })
    }
    if (lead.contactMethod === "phone" && !lead.phone) {
      ctx.addIssue({ code: "custom", path: ["phone"], message: "Required" })
    }
  })
export type LeadCreateInput = z.input<typeof LeadCreateSchema>

export const LeadCreateResultSchema = z.object({ reference: z.string() })

export const LEAD_CREATE_ERRORS = {
  TOO_MANY_REQUESTS: { message: LEAD_RATE_MESSAGE },
} as const

/** How many `admin.leads.list` returns per page, newest first. */
export const ADMIN_LEADS_PAGE_SIZE = 50

/** `admin.leads.list`'s `status` filter: a real status, or every lead regardless of it. */
export const AdminLeadStatusFilterSchema = z.enum([...LEAD_STATUSES, "all"])
export type AdminLeadStatusFilter = z.infer<typeof AdminLeadStatusFilterSchema>
export const AdminLeadListSchema = z.object({
  status: AdminLeadStatusFilterSchema.default("all"),
  cursor: CoercedId.optional(),
})

/** A lead as `/admin/leads` shows it — every typed value is plain text, never rendered as HTML. */
export const AdminLeadSchema = z.object({
  id: Id,
  /** `LEAD-<id>`, the same reference the visitor and Yasmina's mail were given. */
  reference: z.string(),
  audience: z.enum(LEAD_AUDIENCES),
  need: z.enum(LEAD_NEEDS),
  timeline: z.enum(LEAD_TIMELINES),
  message: z.string().nullable(),
  name: z.string(),
  email: z.string(),
  phone: z.string().nullable(),
  organisation: z.string().nullable(),
  role: z.string().nullable(),
  contactMethod: z.enum(LEAD_CONTACT_METHODS),
  /** Consent to newsletters, stored only: nothing sends a newsletter today. */
  newsletter: z.boolean(),
  /** The language the visitor wrote in (the page's), which their mail used. */
  locale: z.string().nullable(),
  page: z.string().nullable(),
  status: z.enum(LEAD_STATUSES),
  /** Yasmina's own notes, never shown to the visitor. */
  notes: z.string().nullable(),
  createdAt: Iso,
  consentAt: Iso,
  statusChangedAt: Iso.nullable(),
  statusChangedBy: Who.nullable(),
  /** When `leads.prune` deletes it. */
  deleteAfter: Iso,
})
export type AdminLead = z.infer<typeof AdminLeadSchema>

/** One page of leads, plus how many there are per status (for the tabs), whatever the filter. */
export const AdminLeadPageSchema = z.object({
  items: z.array(AdminLeadSchema),
  nextCursor: Id.nullable(),
  /** Every status, exhaustively (zod 4 records over an enum require each key). */
  counts: z.record(z.enum(LEAD_STATUSES), z.number().int()),
})

/** Changes the status, the notes, or both; leaving one out keeps it. */
export const AdminLeadUpdateSchema = z
  .object({
    id: CoercedId,
    status: z.enum(LEAD_STATUSES).optional(),
    notes: z.string().trim().max(LEAD_NOTES_MAX).optional(),
  })
  .refine((v) => v.status !== undefined || v.notes !== undefined, {
    message: "Nothing to update",
  })
