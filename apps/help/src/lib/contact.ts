import { ORPCError } from "@orpc/client"
import { type ApiClient, SUPPORT_RATE_MESSAGE, SupportCreateSchema } from "@repo/api-contract"
import { resolveLocaleWithSource } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"

const logger = createLogger({ service: "help" })

export type ContactApi = Pick<ApiClient["support"], "create">

/**
 * Builds the api client for one submission, given the request's ip, resolved locale and a
 * forwarded `session` cookie token. Injected (rather than a pre-built client) so a test can
 * assert the session token actually reaches the factory — see CLAUDE.md's Controller ruling: the
 * rate-limit client id must stay `anon:<ip hash>` throughout, never flip to a per-session bucket
 * the way `@repo/session`'s own `createApiClient` would the moment a session token is set. The
 * real implementation is `apps/help/src/lib/api.ts`'s `anonymousApiFor`.
 */
export type ContactApiFactory = (
  ip: string | undefined,
  locale: string | undefined,
  sessionToken: string | null | undefined
) => Promise<ContactApi>

export type ContactDeps = {
  api: ContactApiFactory
  ip?: string
  sessionToken?: string | null
  locale?: string
}

export type ContactFormState = FormState & { reference?: string }

/** The English of every outcome but the success message (which also carries the reference and
 * the address it was sent to). */
export const UNAVAILABLE = "Support is unavailable right now. Try again in a moment."
/** A filled honeypot gets this and nothing else — no reference exists for a request never sent. */
export const HONEYPOT_MESSAGE = "Thanks — we've got it."
/** The same English text `support.create`'s rate limiter answers with — read from the contract
 * directly rather than the live error: the action may send `x-locale` for a signed-in caller's
 * saved language, and this page never translates (see `apps/www/src/lib/actions.ts`'s identical
 * reasoning for its own `TOO_MANY_REQUESTS`). */
export const TOO_MANY_REQUESTS = SUPPORT_RATE_MESSAGE

/** "Thanks — we've got it. Your reference is <reference>. We've sent a confirmation to <email>." */
export function contactSentMessage(reference: string, email: string): string {
  return `${HONEYPOT_MESSAGE} Your reference is ${reference}. We've sent a confirmation to ${email}.`
}

const str = (fd: FormData, key: string) => {
  const v = fd.get(key)
  return typeof v === "string" ? v : ""
}

/**
 * The support mail's language: the `locale` cookie, else `Accept-Language`, else nothing — the
 * English default is no real choice to report. Mirrors `apps/www/src/lib/actions.ts`'s
 * `resolveWaitlistLocale` exactly; duplicated rather than shared because it is three lines and
 * the two apps have no other reason to depend on one another.
 */
export function resolveContactLocale(signals: {
  cookie?: string | null
  acceptLanguage?: string | null
}): string | undefined {
  const { locale, source } = resolveLocaleWithSource(signals)
  return source === "default" ? undefined : locale
}

/**
 * The contact form's logic, free of Next so it runs under `bun test`. A filled honeypot
 * (`hp_field`) answers success with no api call at all — a real visitor never sees or fills it.
 * A trip is logged (one line, no submitted values) so an unexpectedly high rate — a sign the
 * field itself is catching real visitors, not bots — is visible without a reference.
 * `page` (the hidden field carrying the article the visitor came from) is sanitised by
 * `SupportCreateSchema` itself (`.catch(undefined)`): anything that is not a short, root-relative
 * help path is dropped rather than refusing the request.
 */
export async function submitContactCore(
  deps: ContactDeps,
  fd: FormData
): Promise<ContactFormState> {
  if (str(fd, "hp_field")) {
    logger.info("contact honeypot tripped")
    return { ok: true, message: HONEYPOT_MESSAGE }
  }

  const values = {
    email: str(fd, "email"),
    name: str(fd, "name"),
    topic: str(fd, "topic"),
    message: str(fd, "message"),
  }
  const parsed = SupportCreateSchema.safeParse({
    email: values.email,
    name: values.name || undefined,
    topic: values.topic,
    message: values.message,
    page: str(fd, "page") || undefined,
  })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values }
  }

  let api: ContactApi
  try {
    api = await deps.api(deps.ip, deps.locale, deps.sessionToken)
  } catch (error) {
    logger.error("building the support api client failed", { error })
    return { ok: false, message: UNAVAILABLE, values }
  }

  try {
    const { reference } = await api.create(parsed.data)
    return { ok: true, message: contactSentMessage(reference, parsed.data.email), reference }
  } catch (error) {
    const limited =
      error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS"
    if (!limited) logger.error("support.create failed", { error })
    return { ok: false, message: limited ? TOO_MANY_REQUESTS : UNAVAILABLE, values }
  }
}
