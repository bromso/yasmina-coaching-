import { ORPCError } from "@orpc/client"
import type { ApiClient } from "@repo/api-contract"
import {
  isOptionalNotificationEmailType,
  NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH,
  type OptionalNotificationEmailType,
} from "@repo/api-contract/notifications"
import type { Locale } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import type { FormState } from "@repo/ui/components/form-feedback"
import { authTranslator } from "./i18n"

const logger = createLogger({ service: "auth" })

/**
 * The unsubscribe links an optional notification mail carries (Phase 13 B): the RFC 8058
 * one-click endpoint a mail client posts to, and the confirm page a person opens. Both call the
 * api anonymously under an `unsub:` client id — per token for the one-click POST, per ip for the
 * page (see `@repo/session/client`'s `unsubscribeTokenClientId`). The api verifies a token before
 * spending either budget, so a forged one costs one HMAC and spends nothing, while a real one is
 * bounded per link (or per ip, on the page) and api-wide. The cores here are plain functions over
 * an api getter, so they run under bun test without Next.
 */
export type UnsubscribeApi = Pick<ApiClient["auth"]["notificationEmail"], "unsubscribe" | "peek">

/**
 * Builds the api lazily, given the (plausible) token about to be sent — the one-click route keys
 * its rate-limit bucket on it. An env missing in production throws here, answered like an
 * unreachable api.
 */
export type UnsubscribeApiGetter = (token: string) => Promise<UnsubscribeApi>

export const ONE_CLICK_PATH = "/email/unsubscribe/one-click"
export const UNSUBSCRIBE_PAGE_PATH = "/email/unsubscribe"

/** The api's own token alphabet (base64url halves joined by a dot), within its length limit. */
const TOKEN = /^[A-Za-z0-9_.-]+$/

/**
 * Whether a token is worth a round trip. Anything else would only earn the api's `400`, which
 * every caller here answers exactly like a good token anyway — so skipping the call changes no
 * answer, and nothing that is not a token ever reaches a query string we build.
 */
export const isPlausibleUnsubscribeToken = (token: unknown): token is string =>
  typeof token === "string" &&
  token.length > 0 &&
  token.length <= NOTIFICATION_EMAIL_TOKEN_MAX_LENGTH &&
  TOKEN.test(token)

const isCode = (error: unknown, code: string) => error instanceof ORPCError && error.code === code

const NO_STORE = { "cache-control": "no-store", "x-content-type-options": "nosniff" }

/**
 * `POST /email/unsubscribe/one-click?token=…`'s answer. An empty `200` for a good token and for a
 * bad one alike (the api's own answer is the same for both, and its `400` for a malformed token
 * is folded in here too), so the response is never an oracle; `429` when the api's limits are
 * spent; `503` when the api cannot be asked. Never a redirect: RFC 8058 clients do not follow one.
 */
export async function oneClickResponse(
  getApi: UnsubscribeApiGetter,
  token: string | null
): Promise<Response> {
  const ok = () => new Response(null, { status: 200, headers: NO_STORE })
  if (!isPlausibleUnsubscribeToken(token)) return ok()
  try {
    await (await getApi(token)).unsubscribe({ token })
    return ok()
  } catch (error) {
    if (isCode(error, "BAD_REQUEST")) return ok()
    if (isCode(error, "TOO_MANY_REQUESTS"))
      return new Response(null, { status: 429, headers: NO_STORE })
    logger.error("one-click unsubscribe failed", { error })
    return new Response(null, { status: 503, headers: NO_STORE })
  }
}

/**
 * `GET /email/unsubscribe/one-click?token=…` (someone opened the header's link in a browser, or a
 * scanner fetched it): a `303` to the confirm page with the same token, and nothing else — a GET
 * never unsubscribes anyone. The `Location` is relative, so it stays on whatever public origin
 * the request came in on (never Next's internal host behind a proxy).
 */
export function oneClickRedirect(token: string | null): Response {
  const query = isPlausibleUnsubscribeToken(token)
    ? `?${new URLSearchParams({ token }).toString()}`
    : ""
  return new Response(null, {
    status: 303,
    headers: { ...NO_STORE, location: `${UNSUBSCRIBE_PAGE_PATH}${query}` },
  })
}

/**
 * What the confirm page found: the type a good link turns off; `invalid` for a link the api does
 * not recognise (or one too malformed to ask about); `unavailable` when the api could not answer
 * (rate-limited, down, misconfigured) — tokens never expire, so an outage must never read as a
 * dead link. Neither non-valid state says anything more about the token.
 */
export type UnsubscribeLink =
  | { status: "valid"; type: OptionalNotificationEmailType }
  | { status: "invalid" }
  | { status: "unavailable" }

/**
 * The confirm page's read. Read-only: `peek` never changes a preference, so loading the page
 * unsubscribes nobody.
 */
export async function peekUnsubscribe(
  getApi: UnsubscribeApiGetter,
  token: string | undefined
): Promise<UnsubscribeLink> {
  if (!isPlausibleUnsubscribeToken(token)) return { status: "invalid" }
  try {
    const result = await (await getApi(token)).peek({ token })
    return result && isOptionalNotificationEmailType(result.type)
      ? { status: "valid", type: result.type }
      : { status: "invalid" }
  } catch (error) {
    if (isCode(error, "BAD_REQUEST")) return { status: "invalid" }
    if (!(error instanceof ORPCError && error.defined))
      logger.error("unsubscribe peek failed", { error })
    return { status: "unavailable" }
  }
}

export type UnsubscribeState = FormState

export type UnsubscribeDeps = {
  getApi: UnsubscribeApiGetter
  /** The request's language for this app's own sentences; the api's 429 arrives in it already. */
  locale?: Locale
}

/**
 * **Turn off these emails**: the page's one action and its only `unsubscribe` call. The api
 * answers success for any well-formed token, so success here is what the page shows after the
 * button; a malformed token (never shown a button, but a hand-edited form could send one) gets
 * the same neutral message the page itself shows for a bad link.
 */
export async function unsubscribeCore(
  deps: UnsubscribeDeps,
  fd: FormData
): Promise<UnsubscribeState> {
  const t = authTranslator(deps.locale)
  const token = fd.get("token")
  if (!isPlausibleUnsubscribeToken(token))
    return { ok: false, message: t("emailUnsubscribe.invalid") }
  try {
    await (await deps.getApi(token)).unsubscribe({ token })
  } catch (error) {
    if (isCode(error, "BAD_REQUEST")) return { ok: false, message: t("emailUnsubscribe.invalid") }
    if (error instanceof ORPCError && error.defined && error.code === "TOO_MANY_REQUESTS")
      return { ok: false, message: error.message }
    logger.error("unsubscribe failed", { error })
    return { ok: false, message: t("common.unavailable") }
  }
  return { ok: true, message: t("emailUnsubscribe.success") }
}
