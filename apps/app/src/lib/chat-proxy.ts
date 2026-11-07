import { hasFeature, type WorkspaceSummary } from "@repo/api-contract"
import type { Locale } from "@repo/i18n/locales"
import { createLogger, REQUEST_ID_HEADER } from "@repo/log"
import { localeFromRequest, requestIdFromRequest } from "@repo/session"
import { type AppEnv, MissingEnvError } from "./env"
import { appTranslator } from "./i18n"

const logger = createLogger({ service: "app" })
const logError = (message: string, error: unknown) => logger.error(message, { error })

/**
 * The signed-in caller: its id keys the AI rate limit, and `locale` — the saved preference, set
 * only when the user chose one (`Me.localeChosen`) — outranks the request's cookie and
 * `Accept-Language` for every message after the user check. `twoFactorSatisfied` is
 * `User.twoFactorSatisfied` (two-step on, or a passkey): a workspace that requires two-step
 * verification refuses chat to a caller without it — and to one that does not say (fail closed).
 */
export type ChatUser = { id: number | string; locale?: Locale; twoFactorSatisfied?: boolean }

export type ChatProxyDeps = {
  /** CSRF check; runs before anything else. A `Response` refuses the request, `null` passes. */
  csrf?: (req: Request) => Response | null
  requireUser: (req: Request) => Promise<ChatUser | null>
  /**
   * Runs right after the user check, before the env or any upstream call: a `Response` refuses the request (e.g. a
   * 403 for a workspace whose plan lacks chat), `null` lets it through.
   */
  authorize?: (req: Request, user: ChatUser) => Promise<Response | null>
  env: () => Pick<AppEnv, "AI_SERVICE_URL" | "AI_SERVICE_TOKEN">
  log?: (message: string, error: unknown) => void
}

/** The user's saved locale when they chose one, else the request's (`locale` cookie, then `Accept-Language`). */
export function chatLocale(req: Request, user?: ChatUser | null): Locale {
  return user?.locale ?? localeFromRequest(req)
}

/**
 * The plan gate for `authorize`: no usable workspace, or one whose plan lacks chat, is 403 with
 * the upgrade message; a workspace that could not be resolved (the api is down) is 503, so a
 * paying user is never told to upgrade because of an outage. A workspace that requires two-step
 * verification of a caller who has neither it nor a passkey is 403 with that message instead,
 * checked before the plan (no upgrade would help). All are in the user's language
 * (`chatLocale`): `chat-view.tsx` shows the body's message as is.
 */
export function chatEntitlementGate(
  resolve: (req: Request) => Promise<{ workspace: WorkspaceSummary | null; error?: unknown }>
): NonNullable<ChatProxyDeps["authorize"]> {
  return async (req, user) => {
    const { workspace, error } = await resolve(req)
    const message = (key: string) => appTranslator(chatLocale(req, user))(`errors.${key}`)
    if (error !== undefined) return json(503, message("chatUnavailable"))
    if (workspace?.requireTwoFactor && user.twoFactorSatisfied !== true) {
      return json(403, message("chatTwoFactorRequired"))
    }
    return workspace && hasFeature(workspace.entitlements, "chat")
      ? null
      : json(403, message("chatUpgrade"))
  }
}

// Only what useChat needs crosses back to the browser. Anything else apps/ai (or a proxy in
// front of it) sets — cookies, internal ids, content-encoding/length that describe bytes fetch
// has already decoded — stays server-side.
const FORWARDED_HEADERS = [
  "content-type",
  "cache-control",
  "x-vercel-ai-ui-message-stream",
  "retry-after",
]

const json = (status: number, message: string) => Response.json({ message }, { status })

/**
 * The trust boundary between the browser and apps/ai: it authenticates the caller, adds the
 * service token (which never leaves the server) and keys the AI service's rate limit per user.
 */
export function createChatProxy({
  csrf,
  requireUser,
  authorize,
  env,
  log = logError,
}: ChatProxyDeps) {
  return async (req: Request): Promise<Response> => {
    const refused = csrf?.(req)
    if (refused) return refused

    // A cross-origin page can send a "simple" text/plain POST without a CORS preflight. Requiring
    // JSON forces the preflight, so such requests never reach the auth check.
    const contentType = req.headers.get("content-type")?.toLowerCase() ?? ""
    if (!contentType.startsWith("application/json")) {
      return json(415, "Expected application/json")
    }

    // Every refusal below reaches the browser verbatim (chat-view shows the body's message), so it
    // is in the user's language: the saved preference once the user is known, before that the
    // request's (`locale` cookie, then `Accept-Language`).
    const user = await requireUser(req)
    if (!user) return json(401, appTranslator(chatLocale(req))("errors.chatSignIn"))
    const t = appTranslator(chatLocale(req, user))

    const refusedBy = await authorize?.(req, user)
    if (refusedBy) return refusedBy

    let config: ReturnType<ChatProxyDeps["env"]>
    try {
      config = env()
    } catch (error) {
      if (!(error instanceof MissingEnvError)) throw error
      log("chat proxy is not configured", error)
      return json(503, t("errors.chatNotConfigured"))
    }

    const requestId = requestIdFromRequest(req)
    let upstream: Response
    try {
      // Read inside the try: a browser that leaves mid-body lands on the 499 branch below.
      const body = await req.text()
      upstream = await fetch(`${config.AI_SERVICE_URL}/chat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.AI_SERVICE_TOKEN}`,
          "content-type": "application/json",
          "x-ai-client-id": String(user.id),
          // The id the app's proxy gave this request, so apps/ai's log lines carry it too.
          ...(requestId ? { [REQUEST_ID_HEADER]: requestId } : {}),
        },
        body,
        // Bun and Next abort req.signal when the browser disconnects; passing it on cancels the
        // model call instead of paying for a reply nobody reads.
        signal: req.signal,
      })
    } catch (error) {
      if (req.signal.aborted) return new Response(null, { status: 499 })
      log("AI service unreachable", error)
      return json(502, t("errors.aiUnavailable"))
    }

    // apps/ai answers 401/403 only to a bad service token or origin — the app's configuration,
    // not the user's session — so the browser gets the generic outage message.
    if (upstream.status === 401 || upstream.status === 403) {
      await upstream.body?.cancel()
      log("AI service rejected the app's credentials", new Error(`status ${upstream.status}`))
      return json(502, t("errors.aiUnavailable"))
    }
    // Never apps/ai's own error text: it is English (service-kit's "Too many requests") and
    // describes the service, not the user's request. A 429 keeps its status and Retry-After with
    // the proxy's own message; anything else non-2xx is the generic outage message.
    if (upstream.status === 429) {
      await upstream.body?.cancel()
      const retryAfter = upstream.headers.get("retry-after")
      return Response.json(
        { message: t("errors.chatTooManyRequests") },
        { status: 429, headers: retryAfter === null ? {} : { "retry-after": retryAfter } }
      )
    }
    if (!upstream.ok) {
      await upstream.body?.cancel()
      log("AI service error", new Error(`status ${upstream.status}`))
      return json(502, t("errors.aiUnavailable"))
    }

    const headers = new Headers()
    for (const name of FORWARDED_HEADERS) {
      const value = upstream.headers.get(name)
      if (value !== null) headers.set(name, value)
    }
    return new Response(upstream.body, { status: upstream.status, headers })
  }
}
