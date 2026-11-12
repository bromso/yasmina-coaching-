import { ORPCError } from "@orpc/client"
import { type ApiClient, type LeadCreateInput, LeadCreateSchema } from "@repo/api-contract"
import {
  isLeadAudience,
  isLeadNeed,
  isLeadTimeline,
  type LeadAudience,
  type LeadNeed,
  type LeadTimeline,
  leadPage,
} from "@repo/api-contract/leads"
import { createLogger } from "@repo/log"
import type { FormState } from "@repo/ui/components/form-feedback"
import { CONTACT, CONTACT_DONE_HREF, CONTACT_HREF } from "@/content/contact"
import { type Locale, SITE_LOCALE } from "@/lib/site-locale"

const logger = createLogger({ service: "www" })

/**
 * The contact form's own messages, in the page's language. A field's message comes from
 * `CONTACT[locale].form.check`; these two cover the whole form.
 */
export const GENERIC_FAILURE: Record<Locale, string> = {
  sv: "Något gick fel, försök igen senare.",
  en: "Something went wrong, please try again later.",
}
/**
 * The limiter's refusal in the page's own words. The api answers in the `x-locale` it was sent,
 * which is the same language, but the page keeps its own wording either way.
 */
export const TOO_MANY_REQUESTS: Record<Locale, string> = {
  sv: "För många förfrågningar, försök igen om en stund.",
  en: "Too many requests, please try again in a while.",
}

/** What `leadReference` produces: `LEAD-` and up to twelve digits. */
export const LEAD_REFERENCE_PATTERN = /^LEAD-\d{1,12}$/

export type LeadsApi = Pick<ApiClient["leads"], "create">
export type LeadOutcome = { ok: true; redirectTo: string } | (FormState & { ok: false })
export type LeadAnswers = { audience: LeadAudience; need: LeadNeed; timeline: LeadTimeline }

/** Every field the form posts, as the core reads (and, after a refusal, hands back) them. */
const FIELDS = [
  "audience",
  "need",
  "timeline",
  "message",
  "name",
  "email",
  "phone",
  "organisation",
  "role",
  "contactMethod",
  "consent",
  "newsletter",
  "page",
] as const
type Field = (typeof FIELDS)[number]
/** The fields a refusal can point at, each with its own message in `check`. */
const CHECKED = [
  "audience",
  "need",
  "timeline",
  "message",
  "name",
  "email",
  "organisation",
  "phone",
  "consent",
] as const
type CheckedField = (typeof CHECKED)[number]
const isChecked = (key: unknown): key is CheckedField =>
  typeof key === "string" && (CHECKED as readonly string[]).includes(key)

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/** `/kontakt/tack?ref=…&for=…&need=…&when=…`: the reference and the three fixed answers only. */
export function doneHref(reference: string, answers: LeadAnswers): string {
  const params = new URLSearchParams({
    ref: reference,
    for: answers.audience,
    need: answers.need,
    when: answers.timeline,
  })
  return `${CONTACT_DONE_HREF}?${params.toString()}`
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? ""

/**
 * The done page's query, untrusted: the reference is shown only when it is a real lead reference
 * (`LEAD-<digits>`, `LEAD_REFERENCE_PATTERN`) — anything else, even plain text, renders nothing,
 * so the page cannot be made to show a message of someone else's choosing — and the answers count
 * only when all three are known options; otherwise there is no tailored step, never a guess.
 */
export function parseDone(query: Record<string, string | string[] | undefined>): {
  reference: string
  answers: LeadAnswers | null
} {
  const audience = one(query.for)
  const need = one(query.need)
  const timeline = one(query.when)
  return {
    reference: LEAD_REFERENCE_PATTERN.test(one(query.ref)) ? one(query.ref) : "",
    answers:
      isLeadAudience(audience) && isLeadNeed(need) && isLeadTimeline(timeline)
        ? { audience, need, timeline }
        : null,
  }
}

/** The page a visitor came from (`/kontakt?from=/inifran/coachning`), else `/kontakt` itself. */
export const sourcePage = (from: string | undefined): string => leadPage(from) ?? CONTACT_HREF

/**
 * The contact form's logic, free of Next so it runs under `bun test`. Every refusal names its
 * field in the page's language (`check`), never Zod's English, and keeps what was typed. A
 * private person's organisation and role are never sent: the form shows those fields to an
 * organisation only. `locale` is the page's (Swedish when omitted); the action also sends it as
 * `x-locale`, so the confirmation mail matches the page.
 */
export async function sendLeadCore(
  deps: { api: LeadsApi; locale?: Locale },
  fd: FormData
): Promise<LeadOutcome> {
  const locale = deps.locale ?? SITE_LOCALE
  const check = CONTACT[locale].form.check
  const values = Object.fromEntries(FIELDS.map((key) => [key, str(fd, key)])) as Record<
    Field,
    string
  >
  const organisation = values.audience === "organisation"
  const input = {
    audience: values.audience,
    need: values.need,
    timeline: values.timeline,
    message: values.message,
    name: values.name,
    email: values.email,
    phone: values.phone,
    organisation: organisation ? values.organisation : undefined,
    role: organisation ? values.role : undefined,
    // The radio pair starts on e-mail; anything but "phone" (a tampered post) is e-mail too.
    contactMethod: values.contactMethod === "phone" ? "phone" : "email",
    consent: values.consent === "yes",
    newsletter: values.newsletter === "yes",
    page: values.page,
  }
  const parsed = LeadCreateSchema.safeParse(input)
  // The schema's cross-field rules run only once every field parses, so they are checked here as
  // well: a visitor sees every missing answer at once.
  const errors: Partial<Record<CheckedField, string>> = {}
  if (organisation && !values.organisation.trim()) errors.organisation = check.organisation
  if (values.contactMethod === "phone" && !values.phone.trim()) errors.phone = check.phone
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const [key] = issue.path
      if (isChecked(key)) errors[key] = check[key]
    }
  }
  if (!parsed.success || Object.keys(errors).length > 0) {
    // A refusal on a field with no message of its own (a role past its length, which the input's
    // `maxLength` already prevents) still says something.
    const message = Object.keys(errors).length === 0 ? GENERIC_FAILURE[locale] : undefined
    return { ok: false, message, fieldErrors: errors as Record<string, string>, values }
  }
  const lead: LeadCreateInput = parsed.data
  try {
    const { reference } = await deps.api.create(lead)
    return { ok: true, redirectTo: doneHref(reference, parsed.data) }
  } catch (error) {
    const limited =
      error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS"
    if (!limited) logger.error("leads.create failed", { error })
    return {
      ok: false,
      message: limited ? TOO_MANY_REQUESTS[locale] : GENERIC_FAILURE[locale],
      values,
    }
  }
}
