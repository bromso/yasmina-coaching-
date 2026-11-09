import { ORPCError } from "@orpc/client"
import { type ApiClient, WaitlistJoinSchema } from "@repo/api-contract"
import { createLogger } from "@repo/log"
import { type FormState, fieldErrors } from "@repo/ui/components/form-feedback"
import { type Locale, SITE_LOCALE } from "@/lib/site-locale"

const logger = createLogger({ service: "www" })

export const JOINED: Record<Locale, string> = {
  sv: "Tack. En bekräftelse är på väg, och Yasmina hör av sig.",
  en: "Thank you. A confirmation is on its way, and Yasmina will be in touch.",
}
export const GENERIC_FAILURE: Record<Locale, string> = {
  sv: "Något gick fel, försök igen senare.",
  en: "Something went wrong, please try again later.",
}
/**
 * The limiter's refusal in the page's own language. The api would answer in the `x-locale` it
 * was sent, which is the same language now, but the page keeps its own wording either way.
 */
export const TOO_MANY_REQUESTS: Record<Locale, string> = {
  sv: "För många förfrågningar, försök igen om några minuter.",
  en: "Too many requests, please try again in a few minutes.",
}

export type WaitlistApi = Pick<ApiClient["waitlist"], "join">

/**
 * The waitlist form's logic, free of Next so it runs under `bun test`. `locale` is the page's
 * (`getLocale()` in the action), Swedish when omitted; the action also sends it to the api as
 * `x-locale`, so the welcome mail matches the page the visitor read. The api answers the same
 * for a new and a repeated email, so neither does this: the list cannot be enumerated from here.
 */
export async function joinWaitlistCore(
  deps: { api: WaitlistApi; locale?: Locale },
  fd: FormData
): Promise<FormState> {
  const locale = deps.locale ?? SITE_LOCALE
  const raw = fd.get("email")
  const email = typeof raw === "string" ? raw : ""
  const parsed = WaitlistJoinSchema.safeParse({ email, source: "www" })
  if (!parsed.success) {
    return { ok: false, fieldErrors: fieldErrors(parsed.error.issues), values: { email } }
  }
  try {
    await deps.api.join(parsed.data)
    return { ok: true, message: JOINED[locale] }
  } catch (error) {
    const limited =
      error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS"
    if (!limited) logger.error("waitlist join failed", { error })
    return {
      ok: false,
      message: limited ? TOO_MANY_REQUESTS[locale] : GENERIC_FAILURE[locale],
      values: { email },
    }
  }
}
