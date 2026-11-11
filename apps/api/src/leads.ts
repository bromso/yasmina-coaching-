import {
  type AdminLead,
  LEAD_AUDIENCE_LABELS,
  LEAD_CONTACT_METHOD_LABELS,
  LEAD_NEED_LABELS,
  LEAD_RETENTION_MONTHS,
  LEAD_TIMELINE_LABELS,
  type LeadCreateSchema,
  leadNextStep,
  leadPage,
  leadReference,
} from "@repo/api-contract"
import { DEFAULT_LOCALE, type Locale } from "@repo/i18n/locales"
import type { z } from "zod"
import { type RecordEventContext, recordEvent } from "./analytics/record"
import type { Db } from "./db"
import { enqueueMail } from "./jobs/builtin/mail"
import type { Enqueue } from "./jobs/enqueue"
import type { AdminLeadRow, ExportedLeadRow } from "./queries/leads"

/** When a lead that arrived at `now` is deleted by `leads.prune`: twelve months later. */
export function leadDeleteAfter(now: Date): string {
  const at = new Date(now.getTime())
  at.setUTCMonth(at.getUTCMonth() + LEAD_RETENTION_MONTHS)
  return at.toISOString()
}

type LeadContext = RecordEventContext & {
  db: Db
  enqueue: Enqueue
  now: () => Date
  /** The supported locale the request named, or null: the visitor's confirmation uses it. */
  requestedLocale: Locale | null
  /** The x-api-client-id (an ip hash), stored for abuse review. */
  clientId: string | null
  /** Where leads are mailed: BOOKING_EMAIL, else wherever support requests go. */
  bookingEmail: string
  authUrl: string
  wwwUrl: string
}

/**
 * Stores one contact request (`leads.create`, after its three limits) and, in the same
 * transaction, queues both mails and the `lead_submitted` event: `leadNew` to Yasmina in English
 * (every answer, `Reply-To:` the sender, a link to the lead in admin) and `leadReceived` to the
 * sender in the page's language — the reference and the tailored next step only, never their
 * own text, since the address is whatever was typed (the same reasoning as `supportReceived`).
 * A private person's organisation and role are dropped: the form only shows them to an
 * organisation, so anything sent for a private person was never asked for.
 */
export async function submitLead(
  context: LeadContext,
  input: z.output<typeof LeadCreateSchema>
): Promise<{ reference: string }> {
  const now = context.now()
  const organisation = input.audience === "organisation" ? (input.organisation ?? null) : null
  const role = input.audience === "organisation" ? (input.role ?? null) : null
  const message = input.message ?? null
  const phone = input.phone ?? null
  const page = leadPage(input.page)
  const next = leadNextStep(input)
  return context.db.transaction(async (tx) => {
    const { id } = await tx.leads.create({
      audience: input.audience,
      need: input.need,
      timeline: input.timeline,
      message,
      name: input.name,
      email: input.email,
      phone,
      organisation,
      role,
      contactMethod: input.contactMethod,
      newsletter: input.newsletter,
      locale: context.requestedLocale,
      page,
      ipHash: context.clientId,
      createdAt: now.toISOString(),
      deleteAfter: leadDeleteAfter(now),
    })
    const reference = leadReference(id)
    await enqueueMail(
      context.enqueue,
      "leadNew",
      context.bookingEmail,
      {
        reference,
        audience: LEAD_AUDIENCE_LABELS[input.audience],
        need: LEAD_NEED_LABELS[input.need],
        timeline: LEAD_TIMELINE_LABELS[input.timeline],
        contactMethod: LEAD_CONTACT_METHOD_LABELS[input.contactMethod],
        name: input.name,
        email: input.email,
        phone: phone ?? undefined,
        organisation: organisation ?? undefined,
        role: role ?? undefined,
        message: message ?? undefined,
        newsletter: input.newsletter,
        page: page ?? undefined,
        adminUrl: `${context.authUrl}/admin/leads/${id}`,
      },
      { tx, replyTo: input.email }
    )
    await enqueueMail(
      context.enqueue,
      "leadReceived",
      input.email,
      { reference, nextStep: next.kind, nextStepUrl: `${context.wwwUrl}${next.path}` },
      {
        tx,
        locale: context.requestedLocale ?? DEFAULT_LOCALE,
        replyTo: context.bookingEmail,
      }
    )
    // The three fixed answers only: no account, no address, nothing the visitor typed.
    await recordEvent(
      context,
      "lead_submitted",
      { userId: null, workspaceId: null },
      { audience: input.audience, need: input.need, timeline: input.timeline },
      { tx }
    )
    return { reference }
  })
}

export const toAdminLead = (row: AdminLeadRow): AdminLead => ({
  id: row.id,
  reference: leadReference(row.id),
  audience: row.audience,
  need: row.need,
  timeline: row.timeline,
  message: row.message,
  name: row.name,
  email: row.email,
  phone: row.phone,
  organisation: row.organisation,
  role: row.role,
  contactMethod: row.contact_method,
  newsletter: row.newsletter,
  locale: row.locale,
  page: row.page,
  status: row.status,
  notes: row.notes,
  createdAt: row.created_at,
  consentAt: row.consent_at,
  statusChangedAt: row.status_changed_at,
  statusChangedBy:
    row.status_changed_by !== null && row.status_changed_by_email !== null
      ? { id: row.status_changed_by, email: row.status_changed_by_email }
      : null,
  deleteAfter: row.delete_after,
})

/**
 * A lead as the data export lists it (address-keyed, verified addresses only): never the ip hash,
 * Yasmina's notes, the status's admin or the page it came from.
 */
export const toExportedLead = (row: ExportedLeadRow) => ({
  reference: leadReference(row.id),
  audience: row.audience,
  need: row.need,
  timeline: row.timeline,
  message: row.message,
  name: row.name,
  email: row.email,
  phone: row.phone,
  organisation: row.organisation,
  role: row.role,
  contactMethod: row.contact_method,
  consentAt: row.consent_at,
  newsletter: row.newsletter,
  status: row.status,
  createdAt: row.created_at,
})
