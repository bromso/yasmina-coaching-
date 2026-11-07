import { ORPCError } from "@orpc/client"
import {
  isTwoFactorChallenge,
  type ProviderId,
  type SignInResult,
  TWO_FACTOR_REAUTH_REASON,
} from "@repo/api-contract"
import { LOCALES } from "@repo/i18n/locales"
import { createLogger } from "@repo/log"
import type { OauthErrorCode } from "@repo/ui/lib/oauth-errors"
import { authTranslator } from "./i18n"

const logger = createLogger({ service: "auth" })

// `auth.oauth.callback`'s FORBIDDEN declares one default message ("email not verified"), but the
// api also answers FORBIDDEN with `accountSuspended` (no `data`) for a suspended account — one
// declared default per code, so the contract keeps the older one. The redirect this callback
// issues loses whatever (already-translated) message the api actually sent, so telling the two
// apart has to happen here, by comparing that message against this app's own copy of it, in every
// locale the api could have answered in — not by code alone.
const SUSPENDED_MESSAGES = new Set(
  LOCALES.map((locale) => authTranslator(locale)("common.accountSuspended"))
)

function isSuspendedRefusal(error: unknown): boolean {
  return (
    error instanceof ORPCError &&
    error.defined &&
    error.code === "FORBIDDEN" &&
    SUSPENDED_MESSAGES.has(error.message)
  )
}

/**
 * The provider sign-in round trip, as cores the `/oauth/[provider]/*` route handlers wrap.
 *
 * The api trusts the caller's state check: it never sees the `state` it issued again. So the
 * state and PKCE verifier live in the HttpOnly `oauth` cookie, set on start and cleared on every
 * callback, and a callback whose cookie is missing, names another provider or holds another state
 * never reaches the api. That cookie is also the CSRF check for Apple's cross-site `form_post`.
 *
 * Apple's `form_post` is a cross-site POST, which the `SameSite=Lax` `session` cookie does not ride
 * on; so the POST only bounces (303) to the same callback as a GET on this origin
 * (`appleFormPostRedirect`), a top-level navigation that carries Lax cookies, and every provider
 * finishes on the GET with the session visible (connect, not a second account).
 */
export const OAUTH_COOKIE = "oauth"

/**
 * `SameSite=None` because Apple returns with a cross-site POST, which a Lax cookie would not ride
 * on; `Secure` is required for that (browsers treat `*.localhost` as secure, so dev works over
 * http). Host-only (no `domain`) and scoped to `/oauth`: no sibling subdomain or other route sees it.
 */
export const oauthCookieAttributes = {
  httpOnly: true,
  secure: true,
  sameSite: "none" as const,
  path: "/oauth",
  maxAge: 600,
}

export type OauthCookie = {
  provider: ProviderId
  state: string
  codeVerifier?: string
  next?: string
  /** Started from the sign-in form's "sign in again" mode: a fresh sign-in even for a browser that
   * holds a session, never a connect (that session is what is being replaced). */
  reauth?: boolean
}

export function encodeOauthCookie(value: OauthCookie): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url")
}

/** The cookie's value, or null for anything that is not one we wrote (it is never trusted further). */
export function decodeOauthCookie(raw: string | null | undefined): OauthCookie | null {
  if (!raw || raw.length > 4096) return null
  try {
    const v = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"))
    if (!v || typeof v !== "object") return null
    if (typeof v.provider !== "string" || typeof v.state !== "string" || !v.state) return null
    if (v.codeVerifier !== undefined && typeof v.codeVerifier !== "string") return null
    if (v.next !== undefined && v.next !== null && typeof v.next !== "string") return null
    if (v.reauth !== undefined && typeof v.reauth !== "boolean") return null
    return {
      provider: v.provider,
      state: v.state,
      codeVerifier: v.codeVerifier,
      next: v.next ?? undefined,
      ...(v.reauth ? { reauth: true } : {}),
    }
  } catch {
    return null
  }
}

type AppleUser = { name?: { firstName?: string; lastName?: string } }

export type OauthStartDeps = {
  providers: ProviderId[]
  start(provider: ProviderId): Promise<{ url: string; state: string; codeVerifier?: string }>
  /** Validates (and so bounds) `next` before it goes into the cookie. */
  safeNextUrl(candidate: string | null | undefined): string
}

/** The sign-in form in its "sign in again" mode, returning to `next` afterwards. Relative. */
export function reauthLoginUrl(next: string | undefined): string {
  return withQuery("/login", { reauth: "1", next })
}

/** The api's refusal to connect a provider on a session past its re-auth window. */
const isReauthRefusal = (error: unknown) =>
  error instanceof ORPCError &&
  error.code === "FORBIDDEN" &&
  (error.data as { reason?: unknown } | undefined)?.reason === TWO_FACTOR_REAUTH_REASON

/**
 * `{ signInAgain }` when the api refuses to start a connect because the browser's session is past
 * the re-auth window: the route sends the browser to the sign-in form instead of the provider.
 * `reauth` (from that form's own buttons) is kept in the cookie so the callback signs in afresh.
 */
export async function oauthStartCore(
  deps: OauthStartDeps,
  {
    provider,
    next,
    reauth = false,
  }: { provider: string; next: string | undefined; reauth?: boolean }
): Promise<{ redirectTo: string; cookie: string } | { status: 404 } | { signInAgain: string }> {
  if (!deps.providers.includes(provider as ProviderId)) return { status: 404 }
  const p = provider as ProviderId
  // Stored validated: an arbitrary `next` could grow the cookie past what decodes (4096 bytes).
  const safe = next ? deps.safeNextUrl(next) : undefined
  let started: Awaited<ReturnType<OauthStartDeps["start"]>>
  try {
    started = await deps.start(p)
  } catch (error) {
    if (isReauthRefusal(error)) return { signInAgain: reauthLoginUrl(safe) }
    throw error
  }
  const { url, state, codeVerifier } = started
  return {
    redirectTo: url,
    cookie: encodeOauthCookie({
      provider: p,
      state,
      codeVerifier,
      next: safe,
      ...(reauth ? { reauth: true } : {}),
    }),
  }
}

/**
 * Apple's `form_post` callback, turned into a same-origin GET of the same route: `code`, `state`,
 * `user` (and `error`) move from the form body into the query, each URL-encoded, absent ones
 * omitted. The `oauth` cookie is left alone; the GET consumes it. Relative, so a rewritten Host
 * never reaches the Location.
 */
export function appleFormPostRedirect(provider: string, form: OauthCallbackParams): string {
  const query = new URLSearchParams()
  for (const key of ["code", "state", "user", "error"] as const) {
    const value = form[key]
    if (value !== undefined) query.set(key, value)
  }
  const qs = query.toString()
  return `/oauth/${encodeURIComponent(provider)}/callback${qs ? `?${qs}` : ""}`
}

export type OauthCallbackInput = {
  provider: ProviderId
  code: string
  codeVerifier?: string
  appleUser?: AppleUser
}

export type OauthCallbackDeps = {
  /**
   * The api's `auth.oauth.callback`, with the client info added by the route. `as: "user"` calls
   * it with the browser's session forwarded (the api connects the provider to that account);
   * `"anonymous"` with the service token alone.
   */
  callback(input: OauthCallbackInput, as: "user" | "anonymous"): Promise<SignInResult>
  safeNextUrl(candidate: string | null | undefined): string
}

export type OauthCallbackParams = { code?: string; state?: string; error?: string; user?: string }

export type OauthCallbackResult =
  | { redirectTo: string; clearCookie: true; session?: { token: string; expiresAt: string } }
  | { challenge: string; next: string; clearCookie: true }

export type { OauthErrorCode }

/** `url` with `params` added (an absolute URL keeps its own query; a relative one is built on). */
function withQuery(url: string, params: Record<string, string | undefined>): string {
  const absolute = /^https?:\/\//.test(url)
  const u = new URL(url, "http://relative.invalid")
  for (const [k, v] of Object.entries(params)) if (v !== undefined) u.searchParams.set(k, v)
  return absolute ? u.href : `${u.pathname}${u.search}`
}

const API_ERRORS: Record<string, OauthErrorCode> = {
  FORBIDDEN: "unverified",
  CONFLICT: "claimed",
  BAD_GATEWAY: "provider",
}

/** Apple's one-time `user` field (form body, carried into the GET's query), reduced to the name fields the api accepts. */
function parseAppleUser(raw: string | undefined): AppleUser | undefined {
  if (!raw) return undefined
  try {
    const name = JSON.parse(raw)?.name
    if (!name || typeof name !== "object") return undefined
    const pick = (v: unknown) => (typeof v === "string" && v ? v.slice(0, 100) : undefined)
    return { name: { firstName: pick(name.firstName), lastName: pick(name.lastName) } }
  } catch {
    return undefined
  }
}

/**
 * Every outcome clears the cookie: a state is good for one callback, whatever happens in it. A
 * failure while signed in (connecting from the account page) goes back to the saved `next` with
 * `?error=…&provider=…`; signed out, to `/login?error=…&provider=…&next=…` so the form can resume.
 * A failed state check has no trusted `next` and always goes to `/login?error=state`. A connect
 * the api refuses because the session is past its re-auth window goes to
 * `/login?reauth=1&next=…`, the same place the start step sends it.
 */
export async function oauthCallbackCore(
  deps: OauthCallbackDeps,
  {
    provider,
    params,
    cookie,
    signedIn = false,
    currentToken,
  }: {
    provider: string
    params: OauthCallbackParams
    cookie: string | null | undefined
    /** The browser holds a session cookie: connect to that account rather than sign in — unless
     * the cookie says the round trip began on the "sign in again" form. */
    signedIn?: boolean
    /** That session cookie's token: when the api answers with this same session (a connect), the
     * result carries no `session`, so the route leaves the cookie alone. */
    currentToken?: string
  }
): Promise<OauthCallbackResult> {
  const saved = decodeOauthCookie(cookie)
  // The state check comes before anything else, including the provider's own error report.
  if (!saved || saved.provider !== provider || !params.state || params.state !== saved.state) {
    return { redirectTo: "/login?error=state", clearCookie: true }
  }
  const p = saved.provider
  const next = deps.safeNextUrl(saved.next)
  // Started from the "sign in again" form: a fresh sign-in replacing this browser's session.
  const connect = signedIn && !saved.reauth
  const fail = (error: OauthErrorCode | "suspended", named?: ProviderId): OauthCallbackResult => ({
    redirectTo: connect
      ? withQuery(next, { error, provider: named })
      : withQuery("/login", { error, provider: named, next }),
    clearCookie: true,
  })
  if (params.error === "access_denied") return fail("cancelled")
  if (params.error || !params.code) return fail("failed", p)
  let issued: SignInResult
  try {
    issued = await deps.callback(
      {
        provider: p,
        code: params.code,
        codeVerifier: saved.codeVerifier,
        appleUser: p === "apple" ? parseAppleUser(params.user) : undefined,
      },
      connect ? "user" : "anonymous"
    )
  } catch (error) {
    // The session aged past the re-auth window during the round trip (the start step checks too):
    // sign in again, then connect from `next`. Nothing was written.
    if (isReauthRefusal(error)) return { redirectTo: reauthLoginUrl(next), clearCookie: true }
    // The provider vouched for a suspended account: this app's own translated copy of the
    // message, since the redirect below cannot carry the api's own (see the module comment).
    if (isSuspendedRefusal(error)) return fail("suspended", p)
    const declared = error instanceof ORPCError && error.defined ? error.code : undefined
    // Declared errors are expected outcomes; anything else (api down, a bug) is logged. The error
    // carries no code, verifier or token: those are inputs, never part of the api's error.
    if (!declared) logger.error(`${p} oauth callback failed`, { error })
    return fail((declared && API_ERRORS[declared]) || "failed", p)
  }
  // Two-step verification is on: the code step finishes the sign-in, not this callback. The api
  // issues a challenge only when it saw no *live* session for this browser, so this always follows
  // it — including when `signedIn` is true from a stale cookie (revoked by "sign out other
  // devices", an admin, or plain expiry): the verify action's `endCurrentSession` already tolerates
  // trying to end a token that is no longer live.
  if (isTwoFactorChallenge(issued)) {
    return { challenge: issued.twoFactor.challenge, next, clearCookie: true }
  }
  // Connecting while signed in: the api answers with the caller's own session rather than a new
  // one (a fresh session would reset the re-auth window for a stolen cookie), so there is nothing
  // to set and nothing to end.
  if (currentToken && issued.session.token === currentToken) {
    return { redirectTo: next, clearCookie: true }
  }
  return { redirectTo: next, clearCookie: true, session: issued.session }
}
