# @repo/session

Server-only helpers the Next apps share for sign-in state: the one definition of the session
cookie, `requireUser()`, CSRF and redirect-target checks, and the `apps/api` client acting as the
signed-in user.

**Never import this from a client component.** `src/index.ts` starts with `import "server-only"`,
so a client bundle that reaches it fails the build. The service token it carries must never reach
a browser.

## Setup

One instance per app, in `src/lib/auth.ts`:

```ts
import { createAuth, loadEnv } from "@repo/session"

let auth: ReturnType<typeof createAuth> | undefined

export function getAuth() {
  if (!auth) {
    const env = loadEnv(["API_URL", "API_SERVICE_TOKEN", "COOKIE_DOMAIN", "AUTH_URL", "APP_URL"])
    auth = createAuth({
      apiUrl: env.API_URL,
      serviceToken: env.API_SERVICE_TOKEN,
      cookieDomain: env.COOKIE_DOMAIN,
      authUrl: env.AUTH_URL,
      appUrl: env.APP_URL,
    })
  }
  return auth
}
```

Build it lazily, on the first request, not at module scope: `next build` imports these modules with
no env set, and `loadEnv` throws in production when a key is missing.

`createAuth` returns:

| Member | Use |
|---|---|
| `getUser()` | The signed-in `User` or `null`; one `auth.me` per request (see [Locale](#locale)) |
| `requireUser({ next }?)` | The `User`, or a redirect to `${authUrl}/login?next=…` |
| `getUserFromRequest(req)` | Same as `getUser`, for route handlers that hold a `Request` |
| `getWorkspaceFromRequest(req)` | The request's current `WorkspaceSummary` (entitlements included) or `null` — for route handlers; never throws or redirects |
| `resolveWorkspaceFromRequest(req)` | The same as `{ workspace, error? }`: `error` is set only when the api could not be asked, so a route can tell an outage (503) from "no workspace" (403) |
| `setSession({ token, expiresAt })` | Sets the session cookie after sign-in; it expires with the session |
| `clearSession()` | Expires the session cookie on sign-out |
| `assertSameOrigin(req)` | CSRF check for route handlers; a `403` `Response` or `null` |
| `safeNextUrl(candidate)` | A post-login target on a subdomain of `COOKIE_DOMAIN` (`https:` in production, `http:` otherwise — except a `.localhost` `COOKIE_DOMAIN`, which accepts `http:` even in production, since it has no real TLS available; credentials stripped), else `appUrl` |
| `api()` | The typed `ApiClient` as the current user |
| `anonymousApi({ ip }?)` | The typed `ApiClient` with the service token only, no session — for sign-in, sign-up and password-reset calls, keyed per browser ip |
| `listWorkspaces()` | The user's `WorkspaceList` (workspaces with their role, plus pending invitations); cached once per request; needs a session |
| `currentWorkspace(list)` | The current `WorkspaceSummary` or `null`, without redirecting — for layouts |
| `requireWorkspace()` | `{ user, workspace, role, entitlements }`, or a redirect (see [Current workspace](#current-workspace)) |
| `setCurrentWorkspace(id)` | From a server action: writes the workspace cookie if the user is a member; `false` otherwise |
| `clearCurrentWorkspace()` | Expires the workspace cookie |
| `getLocale()` | The request's `Locale` (see [Locale](#locale)); cached once per request; never throws |
| `setLocale(locale)` | From a server action: writes the `locale` cookie and, when signed in, saves the preference (`account.setLocale`) |

Every api call gives up after 5 s (`timeoutMs` on `createApiClient`), so a hung api reads as
signed out instead of hanging the page. With a session, the client sends
`x-api-client-id: session:<32 hex of SHA-256(token)>`: the api's `API_RATE_LIMIT` is per client
id, so one user cannot exhaust the bucket every other user of the app shares. Without a session,
`anonymousApi` sends `x-api-client-id: anon:<32 hex of SHA-256(ip)>` instead, via
`anonymousClientId(ip)` — `undefined` when there is no ip, so the header is omitted rather than
sent empty. The raw ip never becomes the key, same as the raw session token.

`requestInfo(headers)` (exported from `@repo/session`) reads `{ userAgent, ip }` off a request's
headers: the user agent capped at 500 characters, the ip from `x-real-ip`, else the first
`x-forwarded-for` hop. It feeds the `client` field of a sign-in (the sessions list) and the `ip`
that keys `anonymousApi`; it is informational and never trusted for auth, and the ip is the
browser's own only behind a proxy that sets or overwrites those headers. `apps/auth` and
`apps/www`'s waitlist action both use it.

`getUser` / `getUserFromRequest` never throw: an invalid session, a malformed cookie value and an
unreachable api all read as signed out (the last is logged). Any sibling subdomain can set a
cookie on the parent domain, so a garbage value must not be able to 500 a route handler.

## The cookie

`sessionCookieOptions({ domain, production })` is the single definition; every app that sets or
clears the cookie uses it:

| Option | Value |
|---|---|
| `name` | `session` |
| `httpOnly` | `true` |
| `path` | `/` |
| `sameSite` | `lax` — our subdomains are one site, so it flows between them |
| `secure` | `true` in production only (dev runs over `http`) |
| `domain` | `COOKIE_DOMAIN`, the parent domain (`.brand.com`) |
| `maxAge` | 30 days — the default; `setSession` sends the session's own `expires` instead |

`readSessionCookie(cookieHeader)` parses a raw `Cookie` header (the last `session=` wins, as in
Next's `cookies()`); a malformed value is `null`, never a thrown `URIError`.

Every host under `COOKIE_DOMAIN` is fully trusted. A compromised or dangling sibling subdomain
can set the `session` cookie for all of them (login CSRF / cookie tossing), and `__Host-` prefixed
cookies are unavailable by design, since the cookie must carry a `Domain`. Never serve
user-controlled content under the parent domain.

**Impersonation.** `startImpersonation({ token, expiresAt })` parks the admin's own token in
`admin_session` (host-only on the auth app, `HttpOnly`, `SameSite=Lax`, `Path=/admin`, one hour)
and sets `session` to the impersonation token; `endImpersonation()` restores it (or signs the
browser out when the parked token is gone) and returns whether it did. `getMe()` returns the
whole `Me` — `user`, `session`, `impersonation` — for the layouts' banner; `getUser()` is its
`user`.

## Current workspace

The user's chosen workspace lives in the `workspace` cookie. `workspaceCookieOptions({ domain,
production })` is its single definition:

| Option | Value |
|---|---|
| `name` | `workspace` (`WORKSPACE_COOKIE`) |
| `httpOnly` | `true` |
| `path` | `/` |
| `sameSite` | `lax` |
| `secure` | `true` in production only |
| `domain` | `COOKIE_DOMAIN`, so every app sees the same choice |
| `maxAge` | 365 days (`WORKSPACE_MAX_AGE_SECONDS`) |

The cookie is a hint, never trusted alone: any sibling subdomain can set it. `readWorkspaceId(value)`
accepts only a positive integer of at most 12 digits (anything else is `null`), and every read
re-checks membership against `workspaces.list` (`listWorkspaces()`, once per request).

`requireWorkspace()` calls `requireUser()` first, so a signed-out user gets the login redirect.
Signed in, it has three outcomes:

1. The cookie names a workspace the user is a member of: that one, with the user's `role` in it.
2. The cookie is missing, malformed or stale, and the user has exactly one workspace: that one.
3. Otherwise (no workspace, or several and no valid choice): a redirect to
   `${appUrl}/workspaces/new`.

It never writes the cookie — a server component cannot. The cookie is set only from server
actions, through `setCurrentWorkspace(id)`, which refuses (returns `false`, writes nothing) an id
the user is not a member of. `clearCurrentWorkspace()` expires it. Layouts that render the
workspace switcher call `currentWorkspace(await listWorkspaces())` instead, which applies rules 1
and 2 and returns `null` rather than redirecting. Both go through `pickWorkspace(list, wantedId)`,
the one pure statement of rules 1 and 2.

`requireWorkspace()` also returns `entitlements` (the workspace's `workspace.entitlements`: plan,
features, seats). Gate a feature with `hasFeature(entitlements, "chat")`; `hasFeature`,
`seatsLeft` and `FEATURE_MESSAGES` are re-exported from `@repo/session` so an app needs no
separate contract import.

`blockedByTwoFactor(workspace, user)` (`workspace.ts`) is the one function an app checks before
rendering a workspace page: whether `workspace.requireTwoFactor` is true and
`user.twoFactorSatisfied` is false. `apps/app`'s `/notes` and `/chat`, and `apps/account`'s
`/workspace` and `/payments`, call it right after `requireWorkspace()` and render
`@repo/ui/blocks/two-factor-required-notice`'s `TwoFactorRequiredNotice` in its place when it is
true — see CLAUDE.md's **Required two-step.** paragraph.

**Warning:** a feature authorised from `workspaces.list` entitlements alone (`requireWorkspace()`,
`resolveWorkspaceFromRequest`) bypasses the api's two-step block, since `workspaces.list` is
exempt from it — such a gate must check `blockedByTwoFactor` itself, as `/api/chat`'s
`chatEntitlementGate` does.

Route handlers hold a `Request`, not `cookies()`: `getWorkspaceFromRequest(req)` reads the
`session` cookie (none → `null`), calls `workspaces.list` as that user, and picks by the same rules
using `readWorkspaceCookie(cookieHeader)` (mirrors `readSessionCookie`: last `workspace=` wins,
decoded, then `readWorkspaceId`). An expired session or an unreachable api is `null` (the latter
logged), so a gate built on it fails closed. `resolveWorkspaceFromRequest(req)` keeps the
difference: `{ workspace, error }` with `error` set for the outage only. `apps/app`'s `/api/chat`
uses it to answer 403 to a workspace without chat and 503 when the api is unreachable.

## Locale

`getLocale()` resolves the request's language, in order:

1. Signed in, and the preference was ever stored (`Me.localeChosen`): the saved `User.locale`.
2. The `locale` cookie (`LOCALE_COOKIE` from `@repo/i18n/cookie`), when it names a supported locale.
3. `Accept-Language`, negotiated (`sv-SE` → `sv`).
4. `en`.

`User.locale` alone cannot tell "chose English" from "never chose" (a stored null reads as `en`),
so `auth.me` also answers `localeChosen` — true once sign-up stored the request's language or
`account.setLocale` ran. An account from before locales existed has it false, so its cookie and
browser language still win until the user picks one. It never throws: an unreachable api reads as
signed out, so the cookie and header still apply. While an admin impersonates a user, `getMe()` is
that user, so `getLocale()` answers the impersonated user's preference and `setLocale` updates
theirs (the api allows it, audited).

**One `auth.me` per request.** `getMe()` (and so `getUser`, `requireUser`, `requireWorkspace`,
`getLocale`, `api()`) is React `cache`d, which only memoizes inside a render. Under it sits a
per-request memo that also covers server actions: a `WeakMap` keyed on the request's own
`await headers()` object (one per request, in renders and actions alike), then on the session
token. It is per request, never per `createAuth` instance (module-level, shared by every user),
and a token swapped within one action (`setSession`, impersonation) asks again.

**The memo drops itself after any other api call.** Every client `createAuth` builds (`api()`,
`anonymousApi()`, `setLocale`'s, the `*FromRequest` helpers') goes through one `fetch` wrapper:
once a call whose RPC path is not `auth.me` has answered (or failed — a write may have committed
all the same), it drops this request's memo entry, so the next `getMe()` fetches fresh. Without
that, an action that calls `requireUser()` and then writes something `User` carries (the avatar,
the name, `hasPassword`, the locale) would re-render — via the `revalidatePath` it triggers, still
inside the same request — with the value it read *before* its own write. So `setLocale` followed by
`getLocale()` in the same action answers the new locale. `getMe()` reads with no other call between
them stay one `auth.me`, and React `cache` still holds within one render; the cost is one more
`auth.me` in an action that calls the api and then asks for the user again. **`invalidateMe()`**
remains as an escape hatch, for a write that reaches the api some other way than these clients.

**The locale is memoized apart from `Me`.** The resolved `{ locale, source }` sits in a second
per-request `WeakMap` (the same `headers()` key, then the session token, `""` signed out) that the
fetch wrapper never clears: a name, avatar or password write cannot change the locale, so `api()`
after a write does not pay another `auth.me` just to re-learn it. `setLocale` overwrites the entry
with the value it just saved (or wrote to the cookie), and `invalidateMe()` clears both memos.

**`x-locale`.** Every client `createAuth` builds sends `x-locale` (`ApiClientOptions.locale`; the
header is omitted when no locale is given, and the api then answers in English): `api()` sends
`await getLocale()`. `anonymousApi()` sends it only when it came from a real signal — the cookie
or a supported browser language (`resolveLocaleWithSource`'s `source` is not `"default"`) — since
the api stores the request's locale on the account a sign-up, magic link or provider sign-in
creates, and a `de` browser's English fallback is no choice to store. Two exceptions, both forced: `auth.me` itself (inside
`getMe()`) sends the cookie / `Accept-Language` locale, since `getLocale()` needs its answer; and
the `Request`-based helpers (`getUserFromRequest`, `getMeFromRequest`,
`resolveWorkspaceFromRequest`) send `localeFromRequest(req)` — the same cookie / `Accept-Language`
rule over the request's own headers — rather than spend a second `auth.me` per route call.
`localeFromRequest(req)` is exported for any other route handler holding a `Request`.
`createFileRoute`, `createEventsRoute` and `@repo/telemetry`'s route build their own clients and
send no `x-locale`: each answers with a bodyless status or a `204`, so nothing they return is shown
to anyone. `apps/www`'s actions build their own client too and send the page's own locale
(`getLocale()` in `apps/www/src/lib/locale.ts`: the `locale` cookie, else Swedish), since they are
not built from a `createAuth` instance.

`setLocale(locale)` throws on an unsupported value before doing anything. With a session it first
saves the preference (`account.setLocale`, sent with the new locale as `x-locale`); an expired
session is treated as signed out, and any other api failure throws **without writing the cookie**,
so the saved preference and the cookie never disagree — callers (server actions) should catch it
and show an error. Then it writes the cookie through `localeCookieOptions(locale, { domain,
production })` (`@repo/session/cookie`), Next's form of `@repo/i18n`'s `localeCookieAttributes`: one
year, `Path=/`, `SameSite=Lax`, `Domain` = `COOKIE_DOMAIN`, `Secure` in production (as the session
cookie), not `HttpOnly` — the static apps' switcher writes it from the browser.
`@repo/ui/components/locale-switcher` (`LocaleSwitcher`) is the control that posts to it: a select
and a button, applied only by the button (never on the select's `change`, which arrow keys fire on
every step).

## Environment

| Key | Dev default |
|---|---|
| `API_URL` | `http://api.brand.localhost:3007` |
| `API_SERVICE_TOKEN` | `DEV_API_TOKEN` from `@repo/api-contract` |
| `AI_SERVICE_URL` | `http://ai.brand.localhost:3008` |
| `AI_SERVICE_TOKEN` | `DEV_AI_TOKEN` (equal to `DEV_TOKEN` in `@repo/ai-contract`, checked by a test) |
| `COOKIE_DOMAIN` | `.brand.localhost` |
| `AUTH_URL` | `http://auth.brand.localhost:3002` |
| `APP_URL` | `http://app.brand.localhost:3001` |

Outside production every key falls back to its default; production requires each key asked for.
URLs lose a trailing slash.

### Boot-time check

`assertAuthEnv(source?)`, from `@repo/session/env` (also re-exported from `@repo/session`), is a
no-op outside production and otherwise throws `MissingEnvError` for the first of
`AUTH_ENV_KEYS` (`API_URL`, `API_SERVICE_TOKEN`, `COOKIE_DOMAIN`, `AUTH_URL`, `APP_URL`) that is
missing. Call it once from `instrumentation.ts` so a misconfigured production deploy fails at
boot instead of on the first request that reaches `getAuth()`. Next 16 does not exit when
`register()` throws: it logs `Failed to prepare server … <KEY> is not set` and answers every
request — `/api/health` included — with 500, so a health check catches it:

```ts
// src/instrumentation.ts
import { assertAuthEnv } from "@repo/session/env"

export function register() {
  // Runs once at `next start`; `next build` never calls it. Fail here, not on the first request.
  if (process.env.NEXT_RUNTIME === "nodejs") assertAuthEnv()
}
```

`assertEnv(keys, source?)` is the same check over any subset of the keys, for an app that needs
the api but has no sessions — `assertAuthEnv` is `assertEnv(AUTH_ENV_KEYS)`. `apps/www` calls
`assertEnv(["API_URL", "API_SERVICE_TOKEN"])` for its waitlist action.

## `requireUser`'s return target

The post-login destination is, in order: the `next` you pass, the `x-url` request header, then
`appUrl`. The shared security proxy (`createSecurityProxy` in `@repo/ui/lib/security-proxy`, each
app's `src/proxy.ts`) sets `x-url` to the request URL, overwriting any client value. `referer` is
never used. Pass `next` explicitly from a server action if you have it — there `x-url` is the
action's URL, not the page's. The auth app must still validate the target with `safeNextUrl`
before redirecting.

## Request id

The shared security proxy also gives every request an `x-request-id` (a well-formed incoming one
is kept, anything else replaced by 16 random bytes in base64url), on the forwarded request and on
the response. Every client this package builds sends it on to `apps/api`: `createAuth`'s `api()`,
`anonymousApi()`, `getMe()` and `setLocale()` read it from `headers()`; the `*FromRequest`
helpers, `createFileRoute` and `createEventsRoute` read it from `req.headers`. `createApiClient`
takes it as `requestId` and drops a malformed one (`validRequestId` from `@repo/log`). The api
accepts it only alongside the service bearer, so its log lines and jobs carry the same id as the
Next app's. Server-side failures here log through `@repo/log` (`service: "session"`), with the
same messages as before.

## File route

`createFileRoute()` (`@repo/session/files`) is the `GET` handler behind each signed-in app's
`src/app/files/[...key]/route.ts` — the whole file is two lines:

```ts
import { createFileRoute } from "@repo/session/files"

export const GET = createFileRoute()
```

It serves the avatars and workspace logos `apps/api` stores (`User.avatarUrl` /
`WorkspaceSummary.logoUrl` are `/files/<key>`, relative, so each app answers on its own origin; see
`apps/api/README.md` **Storage**). The key from the path is checked against `FILE_KEY_PATTERN`
first (anything else is a `404` without an api call), then fetched with `files.get` using the
service token alone — no session: an image URL is a capability, unguessable, and cacheable by any
browser. The call carries `x-api-client-id: files:<32 hex of SHA-256(ip)>` (`filesClientId`, from
`requestInfo(req.headers).ip`), so one browser hammering nonexistent keys exhausts only its own
bucket, not one every visitor of the route shares. The response streams the bytes with the stored
`Content-Type`, `Content-Length`, `Cache-Control: public, max-age=31536000, immutable` (keys never
change), `X-Content-Type-Options: nosniff`, `Content-Disposition: inline` and
`Content-Security-Policy: sandbox; default-src 'none'`. An unknown or unreferenced key is `404`;
any other failure — the api unreachable, or answering 401/429/5xx (logged with its code) — is `502`;
both with `cache-control: no-store` and the same safety headers. The apps' proxy matcher skips
image extensions, so these headers are the route's own. It needs `API_URL` and `API_SERVICE_TOKEN`
(through `loadEnv`, with the usual dev fallbacks); `createFileRoute({ client })` takes a fake
client for tests (`src/files.test.ts`). When `STORAGE_PUBLIC_URL` is set on the api, URLs point at
the bucket or CDN instead and the route goes unused.

## Events route

`createEventsRoute(options)` (`@repo/session/events`) is the `GET` handler behind a signed-in app's
`src/app/api/events/route.ts`, which relays `apps/api`'s Server-Sent Events stream for the current
workspace (see `apps/api/README.md` **Realtime** and `docs/guides/realtime.md`). `apps/app`'s:

```ts
import { readSessionCookie } from "@repo/session/cookie"
import { createEventsRoute } from "@repo/session/events"
import { getAuth } from "@/lib/auth"

export const dynamic = "force-dynamic"
export const GET = createEventsRoute({
  getUser: (req) => getAuth().getUserFromRequest(req),
  getWorkspace: (req) => getAuth().resolveWorkspaceFromRequest(req),
  readSessionToken: (req) => readSessionCookie(req.headers.get("cookie")),
})
```

No user → `401`. The workspace is `?workspace=<id>` when the page passes it (the one it rendered,
so a cookie switch in another tab does not move the stream; not a positive integer → `404` without
an upstream call, and `apps/api` checks the membership), else the `workspace` cookie's: a lookup
that could not reach the api (`error` set) → `503`, without an upstream call, so an outage never
reads as "not found"; no workspace → `404`. Then it opens `${API_URL}/events/workspaces/<id>` with
the service token and the caller's `x-session-token`. When the client's ip is known (`requestInfo`:
`x-real-ip`, else `x-forwarded-for`), it adds `x-api-client-id: events:<32 hex of SHA-256(ip)>`
(`eventsClientId`, like `files:`), so one browser's reconnects exhaust only its own rate-limit
bucket; without an ip it sends no client id, and the api keys every such stream on the Next
server's own address — one bucket shared by every browser behind it. The browser's disconnect (`req.signal`) aborts the
upstream request. An upstream `401` / `403` / `404` / `429` / `503` is relayed with that status —
`403` is a workspace whose required two-step verification the caller does not satisfy (see
CLAUDE.md's **Required two-step.** paragraph), a permanent refusal like `401` and `404` that the
client (`apps/app`'s `LiveNotes`) stops reconnecting on; any other
non-OK status, or a failure to reach the api, is `502` (all with `cache-control: no-store`). On
success the upstream body streams through unread, as `content-type: text/event-stream`,
`cache-control: no-store`, `x-accel-buffering: no`. `env` and `fetch` options take fakes for tests
(`src/events.test.ts`).

`createUserEventsRoute(options)` (same subpath) is `apps/app`'s `src/app/api/events/me/route.ts`:
the signed-in user's own notification stream, relaying `apps/api`'s `GET /events/me` exactly as
above (service token, session token, an `events:<ip hash>` client id, the request id, the
browser's disconnect aborting upstream) but with no workspace involved — `getWorkspace` is not a
parameter. No user → `401` without an upstream call. An upstream `401`/`403`/`404`/`429`/`503` is
relayed with that exact status (the same set `createEventsRoute` relays, so a client stops for
good on `401`/`403`/`404` either way), any other non-OK status or an unreachable api is `502`. See
`apps/api/README.md`'s **Notifications** section and `apps/app/README.md`'s own.

`unreadNotificationCount()` (`createAuth(...)`'s own method, not a subpath export) is the header
bell's count, read once per request (`cache`-wrapped): `null` when signed out, when the api
refuses (an expired session reads as the ordinary signed-out case, unlogged), fails or does not
answer within `UNREAD_COUNT_TIMEOUT_MS` (2 s) — logged in every other failure case — so a layout
always renders the bell, just without a badge, rather than breaking the page. It is a plain `fetch`
with no `x-locale` (a bare number needs none, and resolving one would cost an extra `auth.me`
read), so it never disturbs this request's `auth.me` memo.

## Subpath exports

`@repo/session/env`, `/cookie`, `/origin`, `/client`, `/files` and `/events` are plain modules with
no Next or React import, so they can be used (and tested with `bun test`) outside a Next request.
