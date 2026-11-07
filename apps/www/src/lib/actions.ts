import { ORPCError } from "@orpc/client"
import { type ApiClient, WaitlistJoinSchema } from "@repo/api-contract"
import { resolveLocaleWithSource } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"

const logger = createLogger({ service: "www" })

export const JOINED = "You're on the list — check your inbox."
export const GENERIC_FAILURE = "Something went wrong, try again later."
/**
 * The limiter's refusal, in English like the rest of the page. Never the api's own message: the
 * action sends `x-locale` (for the welcome mail), so that would be a Swedish sentence on an
 * English page for a visitor with a Swedish cookie.
 */
export const TOO_MANY_REQUESTS = "Too many requests, try again in a few minutes."

export type WaitlistApi = Pick<ApiClient["waitlist"], "join">

/**
 * The waitlist welcome mail's language: the `locale` cookie, else `Accept-Language`, else
 * nothing — the English default is no real choice for `anonymousApi` to send as `x-locale`
 * (the api already answers in English without it). A plain function (not a server action, so
 * `actions.ts` — "use server" — only re-exports it) kept here so it runs under `bun test`.
 */
export function resolveWaitlistLocale(signals: {
  cookie?: string | null
  acceptLanguage?: string | null
}): string | undefined {
  const { locale, source } = resolveLocaleWithSource(signals)
  return source === "default" ? undefined : locale
}

/**
 * The waitlist form's logic, free of Next so it runs under `bun test`. The api answers the same
 * for a new and a repeated email, so neither does this: the list cannot be enumerated from here.
 */
export async function joinWaitlistCore(
  deps: { api: WaitlistApi },
  fd: FormData
): Promise<FormState> {
  const raw = fd.get("email")
  const email = typeof raw === "string" ? raw : ""
  const parsed = WaitlistJoinSchema.safeParse({ email, source: "www" })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values: { email } }
  }
  try {
    await deps.api.join(parsed.data)
    return { ok: true, message: JOINED }
  } catch (error) {
    const limited =
      error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS"
    if (!limited) logger.error("waitlist join failed", { error })
    return { ok: false, message: limited ? TOO_MANY_REQUESTS : GENERIC_FAILURE, values: { email } }
  }
}
