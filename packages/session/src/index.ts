import "server-only"

import { ORPCError, safe } from "@orpc/client"
import type {
  Entitlements,
  Me,
  Role,
  User,
  WorkspaceList,
  WorkspaceSummary,
} from "@repo/api-contract"
import { LOCALE_COOKIE, parseLocaleCookie } from "@repo/i18n/cookie"
import {
  DEFAULT_LOCALE,
  isLocale,
  type Locale,
  type LocaleSource,
  resolveLocale,
  resolveLocaleWithSource,
} from "@repo/i18n/locales"
import { createLogger, REQUEST_ID_HEADER, validRequestId } from "@repo/log"
import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"
import { cache } from "react"
import {
  anonymousClientId,
  createApiClient,
  getMeFromToken,
  getUserFromToken,
  requestIdFromRequest,
} from "./client"
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  localeCookieOptions,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./cookie"
import { assertSameOrigin, safeNextUrl } from "./origin"
import {
  pickWorkspace,
  readWorkspaceCookie,
  readWorkspaceId,
  WORKSPACE_COOKIE,
  workspaceCookieOptions,
} from "./workspace"

export { FEATURE_MESSAGES, hasFeature, seatsLeft } from "@repo/api-contract"

export {
  anonymousClientId,
  createApiClient,
  getMeFromToken,
  getUserFromToken,
  requestIdFromRequest,
  sessionClientId,
} from "./client"
export {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  adminSessionCookieOptions,
  localeCookieOptions,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./cookie"
export {
  AUTH_ENV_KEYS,
  type AuthEnv,
  assertAuthEnv,
  assertEnv,
  loadEnv,
  MissingEnvError,
} from "./env"
export { analyticsIdentity } from "./identity"
export { assertSameOrigin, safeNextUrl } from "./origin"
export { requestInfo } from "./request-info"
export {
  blockedByTwoFactor,
  pickWorkspace,
  readWorkspaceCookie,
  readWorkspaceId,
  WORKSPACE_COOKIE,
  WORKSPACE_MAX_AGE_SECONDS,
  workspaceCookieOptions,
} from "./workspace"
export type { Entitlements, Locale, Me, User }

/**
 * The locale a request names on its own, without asking who is signed in: the `locale` cookie,
 * else `Accept-Language`, else English. For a route handler holding a `Request`.
 */
export function localeFromRequest(req: Request): Locale {
  return resolveLocaleWithSource({
    cookie: parseLocaleCookie(req.headers.get("cookie")),
    acceptLanguage: req.headers.get("accept-language"),
  }).locale
}

/**
 * What `requireWorkspace()` resolves to: the user, their current workspace, their role in it and
 * what the workspace's plan allows (`hasFeature(entitlements, "chat")`).
 */
export type WorkspaceAccess = {
  user: User
  workspace: WorkspaceSummary
  role: Role
  entitlements: Entitlements
}

export type AuthOptions = {
  apiUrl: string
  serviceToken: string
  cookieDomain: string
  authUrl: string
  appUrl: string
  production?: boolean
  fetch?: typeof fetch
}

/** Whether a request the RPC link sends is `auth.me` (`<apiUrl>/rpc/auth/me`). */
function isMeCall(input: RequestInfo | URL): boolean {
  const url = input instanceof Request ? input.url : String(input)
  try {
    return new URL(url).pathname.endsWith("/rpc/auth/me")
  } catch {
    return false
  }
}

const logger = createLogger({ service: "session" })

/** How long the header's unread count may take before the bell renders without one. */
export const UNREAD_COUNT_TIMEOUT_MS = 2_000

/** One instance per app (`src/lib/auth.ts`). Everything here runs on the server only. */
export function createAuth(options: AuthOptions) {
  const production = options.production ?? process.env.NODE_ENV === "production"
  const cookie = sessionCookieOptions({ domain: options.cookieDomain, production })
  const workspaceCookie = workspaceCookieOptions({ domain: options.cookieDomain, production })
  const adminCookie = adminSessionCookieOptions({ production })
  const baseFetch = options.fetch ?? fetch
  // The per-request `auth.me` memo below (`meByRequest`), declared here so the fetch wrapper can
  // reach it.
  const meByRequest = new WeakMap<object, Map<string, Promise<Me | null>>>()
  // The resolved locale, memoized per request (the same `headers()` key) and session token ("" when
  // signed out) apart from `Me`: a write drops `Me` but never this, since only `setLocale` changes
  // the locale (it overwrites the entry); `invalidateMe()` clears both.
  type ResolvedLocale = { locale: Locale; source: LocaleSource }
  const localeByRequest = new WeakMap<object, Map<string, Promise<ResolvedLocale>>>()

  /**
   * Every client this instance builds goes through here. Any call that is not `auth.me` may have
   * changed what `auth.me` answers (a name, an avatar, a password, the locale), so once it has
   * answered — or failed: a write may have committed all the same — this request's memo entry is
   * dropped and the next `getMe()` asks again. Reads of `getMe()` with nothing in between stay
   * deduped, and React's `cache` still holds within one render.
   */
  const trackedFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      return await baseFetch(input, init)
    } finally {
      if (!isMeCall(input)) await dropMe()
    }
  }) as typeof fetch

  /** Drops this request's cached `Me`, whatever the session token. Never throws. */
  async function dropMe(): Promise<void> {
    try {
      meByRequest.delete(await headers())
    } catch {
      // Outside a request: nothing cached to drop.
    }
  }

  const clientOptions = {
    apiUrl: options.apiUrl,
    serviceToken: options.serviceToken,
    fetch: trackedFetch,
  }

  const readToken = async () => (await cookies()).get(SESSION_COOKIE)?.value ?? null

  /** The id the shared security proxy gave this request, forwarded to the api; never throws. */
  const readRequestId = async (): Promise<string | null> => {
    try {
      return validRequestId((await headers()).get(REQUEST_ID_HEADER))
    } catch {
      return null // outside a request
    }
  }

  /** The cookie and `Accept-Language` this request carries; never throws. */
  const readLocaleSignals = async (): Promise<{ cookie?: string; acceptLanguage?: string }> => {
    try {
      const [store, h] = await Promise.all([cookies(), headers()])
      return {
        cookie: store.get(LOCALE_COOKIE)?.value,
        acceptLanguage: h.get("accept-language") ?? undefined,
      }
    } catch {
      return {}
    }
  }

  // auth.me cannot wait for getLocale (which needs it), so it sends the request's own locale.
  const fetchMe = async (token: string): Promise<Me | null> =>
    getMeFromToken(
      {
        ...clientOptions,
        locale: resolveLocale(await readLocaleSignals()),
        requestId: await readRequestId(),
      },
      token
    )

  // React's cache memoizes only inside a render; a server action would ask auth.me on every
  // getUser/api() call. So also memoize per request: keyed on the request's own `headers()`
  // object (one per request store, in renders and actions alike; the WeakMap lets it go with the
  // request), then on the session token, so a sign-in or an impersonation swap within one action
  // asks again. Never keyed on this instance alone: it is module-level and shared by every user.
  // Any other api call through this instance drops the request's entry (`trackedFetch`).
  const memoizedMe = async (token: string): Promise<Me | null> => {
    let request: object | undefined
    try {
      request = await headers()
    } catch {
      return fetchMe(token) // outside a request: nothing to key on
    }
    let byToken = meByRequest.get(request)
    if (!byToken) {
      byToken = new Map()
      meByRequest.set(request, byToken)
    }
    let me = byToken.get(token)
    if (!me) {
      me = fetchMe(token)
      byToken.set(token, me)
    }
    return me
  }

  /**
   * Drops this request's cached `Me`, so the next `getMe()` fetches fresh. Every api call made
   * through this instance's clients already does this on its own (see `trackedFetch`); this is
   * the escape hatch for a write that reaches the api some other way.
   */
  async function invalidateMe(): Promise<void> {
    await dropMe()
    try {
      localeByRequest.delete(await headers())
    } catch {
      // Outside a request: nothing cached to drop.
    }
  }

  // Once per request, however many components ask: the user, their session, any impersonation.
  const getMe = cache(async (): Promise<Me | null> => {
    const token = await readToken()
    return token ? memoizedMe(token) : null
  })
  const getUser = cache(async (): Promise<User | null> => (await getMe())?.user ?? null)

  /**
   * The request's language: a signed-in user's saved preference (when one was ever stored —
   * `Me.localeChosen`), else the `locale` cookie, else `Accept-Language`, else English. Never
   * throws: an unreachable api reads as signed out.
   */
  const resolveRequestLocale = async (): Promise<ResolvedLocale> => {
    try {
      const [me, signals] = await Promise.all([getMe(), readLocaleSignals()])
      return resolveLocaleWithSource({
        saved: me?.localeChosen ? me.user.locale : null,
        ...signals,
      })
    } catch {
      return { locale: DEFAULT_LOCALE, source: "default" }
    }
  }

  /** This request's locale entry for the current session token; null outside a request. */
  const localeSlot = async (): Promise<{
    byToken: Map<string, Promise<ResolvedLocale>>
    token: string
  } | null> => {
    let request: object
    try {
      request = await headers()
    } catch {
      return null
    }
    let byToken = localeByRequest.get(request)
    if (!byToken) {
      byToken = new Map()
      localeByRequest.set(request, byToken)
    }
    let token = ""
    try {
      token = (await readToken()) ?? ""
    } catch {
      // No cookies to read: keyed as signed out.
    }
    return { byToken, token }
  }

  const getLocaleWithSource = cache(async (): Promise<ResolvedLocale> => {
    const slot = await localeSlot()
    if (!slot) return resolveRequestLocale() // outside a request: nothing to key on
    let resolved = slot.byToken.get(slot.token)
    if (!resolved) {
      resolved = resolveRequestLocale()
      slot.byToken.set(slot.token, resolved)
    }
    return resolved
  })
  const getLocale = cache(async (): Promise<Locale> => (await getLocaleWithSource()).locale)

  /**
   * The user, or a redirect to sign in. The post-login target is `next` if given, else the
   * `x-url` header the shared security proxy sets (overwriting any client value), else `appUrl`.
   * The auth app validates it with `safeNextUrl` before redirecting.
   */
  async function requireUser({ next }: { next?: string } = {}): Promise<User> {
    const user = await getUser()
    if (user) return user
    const target = next ?? (await headers()).get("x-url") ?? options.appUrl
    redirect(`${options.authUrl}/login?next=${encodeURIComponent(target)}`)
  }

  /** The api as the current user; for server components and actions after `requireUser()`. */
  const api = async () =>
    createApiClient({
      ...clientOptions,
      sessionToken: await readToken(),
      locale: await getLocale(),
      requestId: await readRequestId(),
    })

  // Once per request: the user's workspaces and pending invitations. Needs a session.
  const listWorkspaces = cache(async (): Promise<WorkspaceList> => (await api()).workspaces.list())

  /**
   * The header bell's unread count, once per request: `null` when signed out, or when the api
   * refuses, fails or does not answer within `UNREAD_COUNT_TIMEOUT_MS` — never throws, so a
   * layout renders the bell without a count rather than breaking the page. A read that cannot
   * change `Me`, so it goes through the plain fetch and keeps this request's `auth.me` memo, and
   * a bare number needs no `x-locale` (nor the `auth.me` call resolving one would cost). Not
   * workspace-scoped, so it answers on a page a workspace's two-step requirement blocks too.
   */
  const unreadNotificationCount = cache(async (): Promise<number | null> => {
    let requestId: string | null = null
    try {
      const sessionToken = await readToken()
      if (!sessionToken) return null
      requestId = await readRequestId()
      const { count } = await createApiClient({
        ...clientOptions,
        fetch: baseFetch,
        sessionToken,
        requestId,
        timeoutMs: UNREAD_COUNT_TIMEOUT_MS,
      }).notifications.unreadCount()
      return count
    } catch (error) {
      // An expired session is the normal signed-out case, as in getUserFromToken.
      if (!(error instanceof ORPCError && error.code === "UNAUTHORIZED")) {
        logger.error("notifications.unreadCount failed", {
          error,
          ...(requestId ? { requestId } : {}),
        })
      }
      return null
    }
  })

  /** The cookie's workspace if the user is a member of it, else their only one, else null. */
  const currentWorkspace = async (list: WorkspaceList): Promise<WorkspaceSummary | null> => {
    const wanted = readWorkspaceId((await cookies()).get(WORKSPACE_COOKIE)?.value)
    return pickWorkspace(list, wanted)
  }

  /**
   * `getWorkspaceFromRequest` with the reason kept: `error` is set only when the api could not be
   * asked (unreachable, 5xx), so a route can answer 503 instead of treating it as "no workspace".
   * Signed out, an expired session and no usable workspace are `{ workspace: null }`.
   */
  async function resolveWorkspaceFromRequest(
    req: Request
  ): Promise<{ workspace: WorkspaceSummary | null; error?: unknown }> {
    const cookieHeader = req.headers.get("cookie")
    const sessionToken = readSessionCookie(cookieHeader)
    if (!sessionToken) return { workspace: null }
    const requestId = requestIdFromRequest(req)
    const [error, list] = await safe(
      createApiClient({
        ...clientOptions,
        sessionToken,
        locale: localeFromRequest(req),
        requestId,
      }).workspaces.list()
    )
    if (error) {
      // As in getUserFromToken: an expired session is the normal signed-out case.
      if (error instanceof ORPCError && error.code === "UNAUTHORIZED") return { workspace: null }
      logger.error("workspaces.list failed", { error, ...(requestId ? { requestId } : {}) })
      return { workspace: null, error }
    }
    return { workspace: pickWorkspace(list, readWorkspaceCookie(cookieHeader)) }
  }

  const setSession = async (session: { token: string; expiresAt: string }) => {
    // `expires` alone, so the session's real expiry wins over the 30-day default.
    const { name, maxAge: _maxAge, ...rest } = cookie
    ;(await cookies()).set(name, session.token, { ...rest, expires: new Date(session.expiresAt) })
  }

  const clearSession = async () => {
    const { name, maxAge: _maxAge, ...rest } = cookie
    ;(await cookies()).set(name, "", { ...rest, maxAge: 0 })
  }

  return {
    getUser,
    getMe,
    getLocale,
    requireUser,
    listWorkspaces,
    currentWorkspace,
    unreadNotificationCount,
    invalidateMe,

    /**
     * The user and their current workspace, or a redirect: to sign in, or to the onboarding page
     * when no workspace is usable. Never writes the cookie (server components cannot).
     */
    async requireWorkspace(): Promise<WorkspaceAccess> {
      const user = await requireUser()
      const workspace = await currentWorkspace(await listWorkspaces())
      if (!workspace) redirect(`${options.appUrl}/workspaces/new`)
      return { user, workspace, role: workspace.role, entitlements: workspace.entitlements }
    },

    /** From a server action only: records the choice if the user is a member of it. */
    async setCurrentWorkspace(id: number): Promise<boolean> {
      const list = await listWorkspaces()
      if (!list.items.some((w) => w.id === id)) return false
      const { name, ...rest } = workspaceCookie
      ;(await cookies()).set(name, String(id), rest)
      return true
    },

    async clearCurrentWorkspace() {
      const { name, maxAge: _maxAge, ...rest } = workspaceCookie
      ;(await cookies()).set(name, "", { ...rest, maxAge: 0 })
    },

    async getUserFromRequest(req: Request): Promise<User | null> {
      return getUserFromToken(
        { ...clientOptions, locale: localeFromRequest(req), requestId: requestIdFromRequest(req) },
        readSessionCookie(req.headers.get("cookie"))
      )
    },

    /**
     * `getUserFromRequest`, but the full `Me` — session and `impersonation` included. For a
     * route handler that must tell an admin impersonating a user apart from that user signed in
     * themselves (an impersonation session's own activity is the admin's, not the user's) —
     * `getUserFromRequest` discards exactly that field. No extra round trip: both call the same
     * `auth.me` through `getMeFromToken`.
     */
    async getMeFromRequest(req: Request): Promise<Me | null> {
      return getMeFromToken(
        { ...clientOptions, locale: localeFromRequest(req), requestId: requestIdFromRequest(req) },
        readSessionCookie(req.headers.get("cookie"))
      )
    },

    /**
     * `currentWorkspace` for route handlers: the request's session and workspace cookies, by the
     * same rule. Null when signed out, when no workspace is usable, or when the api is unreachable
     * — never a thrown error and never a redirect.
     */
    async getWorkspaceFromRequest(req: Request): Promise<WorkspaceSummary | null> {
      return (await resolveWorkspaceFromRequest(req)).workspace
    },

    resolveWorkspaceFromRequest,

    setSession,
    clearSession,

    /** The admin's own token, parked while they impersonate (only sent under /admin). */
    async readAdminSession(): Promise<string | null> {
      return (await cookies()).get(ADMIN_SESSION_COOKIE)?.value ?? null
    },

    /**
     * From a server action on the auth app only: parks the admin's token in `admin_session`
     * (host-only, Path=/admin) and puts the impersonation token in the shared `session` cookie,
     * expiring with the session. Refuses when there is no session to park: nothing is written.
     */
    async startImpersonation(session: { token: string; expiresAt: string }): Promise<void> {
      const store = await cookies()
      const own = store.get(SESSION_COOKIE)?.value
      if (!own) throw new Error("startImpersonation: no session cookie to park")
      const { name, ...rest } = adminCookie
      store.set(name, own, rest)
      await setSession(session)
    },

    /**
     * Clears the parked token and restores it as `session`. Without a parked token (expired, or
     * never set) the browser is signed out instead — it must never stay signed in as the user.
     */
    async endImpersonation(): Promise<boolean> {
      const store = await cookies()
      const own = store.get(ADMIN_SESSION_COOKIE)?.value ?? null
      const { name, maxAge: _maxAge, ...rest } = adminCookie
      store.set(name, "", { ...rest, maxAge: 0 })
      if (!own) {
        await clearSession()
        return false
      }
      const { name: sessionName, ...sessionRest } = cookie
      store.set(sessionName, own, sessionRest)
      return true
    },

    assertSameOrigin,
    safeNextUrl: (candidate: string | null | undefined) =>
      safeNextUrl(candidate, { appUrl: options.appUrl, production, domain: options.cookieDomain }),

    api,

    /**
     * The api with the service token only, for sign-in/up and reset: keyed per browser ip. Sends
     * `x-locale` only from a real signal (cookie, browser language): the api stores it on account
     * creation, and the English fallback is no choice to store.
     */
    anonymousApi: async ({ ip }: { ip?: string | null } = {}) => {
      const { locale, source } = await getLocaleWithSource()
      return createApiClient({
        ...clientOptions,
        clientId: await anonymousClientId(ip),
        locale: source === "default" ? undefined : locale,
        requestId: await readRequestId(),
      })
    },

    /**
     * From a server action: when signed in, saves the preference through `account.setLocale`,
     * then writes the `locale` cookie (on `COOKIE_DOMAIN`, so every app sees it). Throws on an
     * unsupported locale, and when the api fails to save it — in both cases before writing
     * anything, so the caller should catch and report it. An expired session is just signed out:
     * the cookie alone is then the choice.
     */
    async setLocale(locale: Locale): Promise<void> {
      if (!isLocale(locale)) throw new Error(`setLocale: unsupported locale ${String(locale)}`)
      const sessionToken = await readToken()
      let saved = false
      if (sessionToken) {
        // The new choice, not the request's old one: the answer is already in the chosen language.
        const [error] = await safe(
          createApiClient({
            ...clientOptions,
            sessionToken,
            locale,
            requestId: await readRequestId(),
          }).account.setLocale({ locale })
        )
        if (error && !(error instanceof ORPCError && error.code === "UNAUTHORIZED")) throw error
        saved = !error
      }
      const written = localeCookieOptions(locale, { domain: options.cookieDomain, production })
      ;(await cookies()).set(written.name, written.value, written.options)
      // The rest of this request (a re-render after the action) answers the new choice.
      const slot = await localeSlot()
      slot?.byToken.set(slot.token, Promise.resolve({ locale, source: saved ? "saved" : "cookie" }))
    },
  }
}
