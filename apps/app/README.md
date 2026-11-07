# @repo/app

Application shell — Next.js 16 on app.brand.localhost:3001 in development, `app.brand.com` in production.

Where the product itself lives. Ships with a home view and two working examples of calling the
backend services — add routes under `src/app/` as the product takes shape.

```bash
bun --filter @repo/app dev       # http://app.brand.localhost:3001
bun --filter @repo/app build     # standalone output for docker/next.Dockerfile
bun --filter @repo/app analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` | http://app.brand.localhost:3001 |
| `/notes` | http://app.brand.localhost:3001/notes — the current workspace's notes, server-rendered from `apps/api` over typed RPC as the signed-in user (`src/lib/api.ts`). Members and above add notes (a server action); a note's author or an admin deletes it, after a confirmation. A note created through a workspace API key (`apps/api`'s public `/v1` surface — see CLAUDE.md's **API keys and /v1.**) has no author to delete it, and shows "via API key `<name>`" instead of "Deleted user" (`note-list.tsx`, from the note's `apiKey: {id, name} \| null`), the name staying even once the key is revoked. Signed out, it redirects to sign in and back; with no workspace, to `/workspaces/new`; a member the workspace's required two-step verification blocks sees `TwoFactorRequiredNotice` instead (see [Required two-step verification](#required-two-step-verification)). Live: notes created or deleted by anyone in the workspace — an API key included — appear and disappear without a reload, and **Here now** shows who has the page open (see [Live notes](#live-notes)) |
| `/chat` | http://app.brand.localhost:3001/chat — stock `useChat` streaming from `apps/ai` through this app's own route; signed-in only and needs a workspace, like `/notes` (the same blocked-member notice when the workspace requires two-step verification); a workspace whose plan lacks the `chat` feature sees an upsell (**See plans** → the account app's `/payments`) instead |
| `/workspaces/new` | http://app.brand.localhost:3001/workspaces/new — signed-in onboarding (`requireUser()`, not `requireWorkspace()`, which redirects here): a verified user names a workspace, an unverified one gets the verify notice with a resend button instead; below, the user's pending invitations, each with **Accept**. Either action sets the `workspace` cookie, then goes to `/notes` |
| `/invitations/[token]` | http://app.brand.localhost:3001/invitations/&lt;token&gt; — an invitation link's landing page, no session required: the anonymous `invitations.preview` (an invalid link renders "This invitation is no longer valid."), naming when the workspace requires two-step verification. Signed out, **Sign in** / **Create account** on the auth app with `next` back here, unless `preview.domainAllowed` is false — then neither link is shown, since they would lead nowhere; signed in, **Accept** (a server action; the page itself never consumes the token, and is hidden the same way) and **Sign out** for the wrong account. The action cores are Next-free in `src/lib/workspace-actions.ts`, tested with a fake api |
| `/api/events` | `GET` only — the workspace's event stream, relayed from `apps/api` by `createEventsRoute` (`@repo/session/events`; see [Live notes](#live-notes)) |
| `/api/events/me` | `GET` only — the signed-in user's own notification stream, relayed from `apps/api` by `createUserEventsRoute` (`@repo/session/events`; see [Notifications](#notifications)) |
| `/api/chat` | `POST` only — the trust boundary to `apps/ai`: same-origin check first, then the session user (401 without one), then the workspace's plan (403 `Upgrade to use chat` unless the request's current workspace — `resolveWorkspaceFromRequest`, through `chatEntitlementGate` — has the `chat` feature; a workspace that requires two-step verification of a caller without it is 403 too, checked first — see [Required two-step verification](#required-two-step-verification); no workspace is a 403, an unreachable api a 503 `Chat is temporarily unavailable`), then the service token (`src/lib/chat-proxy.ts`); the user's id keys the AI rate limit. apps/ai's own error text never reaches the browser: an upstream `429` keeps its status and `Retry-After` with the app's own message, any other non-2xx is a logged `502`. Every message is in the user's saved language when they chose one (`Me.localeChosen`), else the request's (`locale` cookie, then `Accept-Language`) |

## Sign-in

`src/lib/auth.ts` exports `getAuth()`, this app's `createAuth(...)` instance from
`@repo/session`: the session cookie shared on `COOKIE_DOMAIN`, resolved against `apps/api`.
Pages and server actions that need a user call `await getAuth().requireUser()`, which redirects
to `${AUTH_URL}/login?next=<this page>` when signed out; route handlers use
`getUserFromRequest(req)` and `assertSameOrigin(req)`. `src/lib/api.ts`'s `api()` is the api
client *as the signed-in user* — there is no service-only client for user data.

When a superadmin is impersonating, the root layout renders `ImpersonationBanner` above the header
(from `getAuth().getMe()`'s `impersonation`, with a **Stop impersonating** link to
`${AUTH_URL}/admin/stop`) and passes `UserMenu` a `note="(impersonating)"`.

Every page renders the shared `SiteHeader` and `SiteFooter` from `@repo/ui` (links from
`@repo/sites`). The header's `controls` slot holds the language switcher and the theme toggle (on
a second row below `sm`), and its `end` slot either the signed-in user's `UserMenu` — **Account** and **Sign out** (`src/app/actions.ts`: ends the session in `apps/api`,
clears the cookie, then goes to `${AUTH_URL}/login?signedout=1`) — or a **Sign in** link back to the
current page. The menu also carries the workspace switcher (its `workspaces` prop, from
`listWorkspaces()` and `currentWorkspace()`): the user's workspaces, the current one checked, each a
form posting to `switchWorkspace` (`src/app/actions.ts`: `setCurrentWorkspace`, which ignores an id
the user is no member of, then revalidates the layout); **Create a workspace** and **Invitations**
(when any are pending) link to `/workspaces/new`, **Manage members** (admins and owners) to
`apps/account`'s `/workspace`. The root layout renders that header with the user, so every page — `/offline`
included — renders per request. Serwist does not precache `/offline` today, so nothing breaks; when an offline
fallback is wired up, move the header (and the layout's `getUser()`) into an `(app)` route group
so `/offline` can stay static and be precached.

## Live notes

`/notes` renders its list on the server, then `LiveNotes` (`src/components/live-notes.tsx`) keeps it
live over `new EventSource("/api/events?workspace=<id>")` — the workspace it rendered, so a cookie
switch in another tab does not move this tab's stream. `src/app/api/events/route.ts` is a few lines over
`createEventsRoute` from `@repo/session/events` (with this app's `getAuth()`): it answers `401`
without a user, `503` when the workspace lookup cannot reach the api, `404` without a workspace,
and otherwise relays `apps/api`'s `GET /events/workspaces/:id` stream unbuffered with
`cache-control: no-store` (upstream `401` / `404` / `429` / `503` pass through, anything else is
`502`). Browsers never call `apps/api`, and `connect-src 'self'` covers it; the private service
worker leaves `/api/*` to the network.

- **Events.** Each message is parsed with `RealtimeEventSchema` (the client imports values only from
  `@repo/api-contract/realtime`, so the full contract stays out of the bundle) and folded in by the
  pure reducer `applyRealtimeEvent` (`src/lib/realtime.ts`, tested in `realtime.test.ts`):
  `note.created` prepends on the first page only, once (the author's own create is already there
  from the action's revalidation), `note.deleted` removes by id on any page, `presence` stores the
  replica's snapshot.
- **Resync.** Every connect sends a presence snapshot and a `resync`. The page passes a server
  `renderedAt`; the first `resync` after mount is skipped only when it arrives within 5 s of it
  (`shouldRefreshOnResync`), so a page restored from the back/forward or router cache still
  refreshes. One after a reconnect always calls `router.refresh()`, since events may have been
  missed. When the server props change (an action's revalidation, a refresh)
  the list is re-seeded from them and presence is kept.
- **Here now** (`src/components/here-now.tsx`). The merged presence across replicas, one avatar per
  user (`useImageFallback`, initials when the image fails, the name in `title`) and "1 person here" /
  "N people here", the viewer included; hidden until the first snapshot. A replica unheard for 60 s
  drops out (a 5 s tick re-evaluates that while presence exists).
- **Connection state.** "Reconnecting…" (`role="status"`) after 5 s in `CONNECTING`. A `CLOSED`
  source — a non-OK answer (`401` / `403` / `404` / `429` / `502` / `503`, an api restart or
  deploy, a sixth tab), which `EventSource` never retries — is probed once (`probeStream`, a plain
  `fetch` whose body is cancelled unread) to tell a permanent refusal apart from a transient one
  before deciding whether to reconnect: a `401` (signed out) stops reconnecting for good and shows
  the signed-out message with a sign-in link back to the page (`SignInLink`, built the same way as
  the header's own); a `404` (workspace deleted, or membership revoked) stops and shows "This
  workspace is no longer available."; a `403` (the workspace requires two-step verification and the
  member has neither it nor a passkey) stops and shows "This workspace requires two-step
  verification. Turn it on to see live updates." (see [Required two-step
  verification](#required-two-step-verification)); a 2xx (the transient condition already cleared by the time the probe
  landed) reconnects at once instead of sitting out the backoff queued for the error that
  triggered the probe; anything else — a `429`/`502`/`503`, or the probe itself failing over the
  network — keeps that backoff (5 s doubling to 60 s, ±20 %, reset by a successful open;
  `reconnectDelay`, `connectionOpened` / `connectionErrored`, `refusalFor`, `decideAfterProbe` in
  `src/lib/realtime.ts`), with "Reconnecting…" shown while it waits. The refusal clears on a
  successful (re)open and at the top of the connection effect, so switching workspaces (which
  re-targets the same effect) never leaves a stale refusal describing the previous one on screen.
  Unmounting stops it. The page works meanwhile, without live updates. The note list is memoised,
  so the 5 s presence tick does not re-render it.
- **Dates** are printed in UTC (`… UTC`), so the server render, the hydration and a live insert
  agree in any browser time zone.
- **Without JavaScript** the effect never runs and the page is exactly the server render.

`apps/e2e`'s `realtime.spec.ts` drives two members through it. Adding events or subscribing from
another page: `docs/guides/realtime.md`.

## Notifications

The signed-in header carries `@repo/ui`'s `NotificationBell` (count fetched server-side, per
request, through `getAuth().unreadNotificationCount()`), and this is the one app where the badge
also updates live: `LiveNotificationRefresh` (`src/components/live-notification-refresh.tsx`,
rendered in the root layout when signed in) follows `new EventSource("/api/events/me")` and calls
`router.refresh()` — debounced `NOTIFICATION_REFRESH_DEBOUNCE_MS` (1 s), so a burst of
notifications re-renders the server layout once — on `notification.created`, and on a reconnect's
`resync` except the one right after mount (`shouldRefreshOnResync`, the same rule `LiveNotes`
applies). `src/app/api/events/me/route.ts` is a few lines over `createUserEventsRoute`
(`@repo/session/events`): `401` without a user, no workspace involved, otherwise relaying
`apps/api`'s `GET /events/me` unbuffered (an upstream `401`/`403`/`404`/`429`/`503` passes
through, anything else is `502`). The event's type is checked by hand
(`src/lib/user-stream.ts`, tested against the contract schema) rather than importing the full
`@repo/api-contract`, so zod stays out of this bundle. A closed stream is probed once like
`LiveNotes`: a `401`/`403`/`404` stops it for good, a 2xx reconnects at once, anything else keeps
the existing capped, jittered backoff. The component renders nothing and never shows a toast — the
badge is the only signal. `apps/auth` and `apps/account` render the same bell but do not stream:
their count updates on a full load or after a server action's `refresh()` (e.g. marking a
notification read on `apps/account`'s `/notifications`), not on every client `<Link>` navigation,
since their layouts persist across one. See **Notifications** in `apps/api/README.md` for the
data model, emitters and retention, and `packages/ui/src/blocks/README.md` for the bell itself.

## Required two-step verification

A workspace owner can require every member to have two-step verification (or a passkey) before
they can open the workspace — see CLAUDE.md's **Required two-step.** paragraph and
`apps/api/README.md`'s **Required two-step verification** section for the full behaviour; this is
the app's part.

- **The notice.** `/notes` and `/chat` check `blockedByTwoFactor(workspace, user)` (`@repo/session`)
  right after `requireWorkspace()`, before any workspace-scoped api call, and render
  `TwoFactorRequiredView` (`src/views/two-factor-required-view.tsx`, over `@repo/ui/blocks/
  two-factor-required-notice`'s `TwoFactorRequiredNotice`) in place of the page for a blocked
  member: a link to the account app's `/security`, the user menu's own **Switch workspace** control
  for each other workspace (or a link to `${APP_URL}/workspaces/new` with none), and **Leave
  workspace**. The shared `TwoFactorRequiredNotice` block is server-rendered and props-only (no
  client hooks), though the app's view puts the client `LeaveWorkspaceForm` below in it; nothing
  redirects, so after setting up two-step, the member reloads the page themselves.
- **Leaving from the notice.** `LeaveWorkspaceForm` is a small `useActionState` client component
  (still a plain `<form>`, so it works without JavaScript) calling `leaveWorkspace`
  (`src/app/actions.ts`), which resolves the workspace on the server (checking the form's id
  against it), calls `leaveWorkspaceCore` (`src/lib/workspace-actions.ts`), clears the `workspace`
  cookie and redirects to `/workspaces/new`; a refusal (the last-owner `CONFLICT`) shows in the
  form in place.
- **Chat.** See the `/api/chat` row in [Routes](#routes) above and CLAUDE.md's **Billing**
  paragraph — the same `chatEntitlementGate` that answers the plan upsell answers this first.
- **Live notes.** See [Connection state](#live-notes) above: a blocked member's stream answers
  `403` and `LiveNotes` stops reconnecting.
- **Invitations.** `/invitations/[token]`'s page says "This workspace requires two-step
  verification." when `invitations.preview`'s `requireTwoFactor` is true — accepting is unaffected;
  the workspace blocks the new member only once they are in it.

## Invitation domains

A workspace owner can also limit who may be invited to its own email domains — see CLAUDE.md's
**Invitation domains.** paragraph and `apps/api/README.md`'s **Invitation domains** section for the
full behaviour; this is the app's part.

- **`/invitations/[token]`.** When `invitations.preview`'s `domainAllowed` is false — the list
  tightened after this invitation was sent — the page shows "This workspace no longer accepts
  invitations to this address." in place of **Accept**, and, for a signed-out visitor, in place of
  the **Sign in** / **Create account** links too (they would only lead to a refused accept); a
  signed-in visitor still sees **Sign out** for the wrong account. The invitation itself is
  untouched by this page load — it stays pending until it is accepted, revoked or expires.
- **`/workspaces/new`.** Unaffected: a pending invitation shown there with **Accept** can still be
  refused by the api with the same `invite_domain` reason, surfaced through the same action-core
  error path as any other refusal.

## Locale (English and Swedish)

Every page renders in English or Swedish, wired exactly as `apps/auth` is (see its README's
**Locale** section and `docs/guides/i18n.md`): `src/i18n/request.ts` resolves the locale from
`getAuth().getLocale()`, the layout renders `<html lang>`, the `LocaleSwitcher` (posting to
`setLocale` in `src/app/actions.ts`) and translated labels for every `@repo/ui` control, and
wraps the tree in `NextIntlClientProvider` with only the `app` namespace.

- **Action cores** take `locale` in their deps (`src/lib/workspace-actions.ts`), and the note
  actions read it from `getAuth().getLocale()`; this app's own messages come from
  `appTranslator(locale)` (`src/lib/i18n.ts`), the api's pass through as they arrive.
  `zodMessage(t)` maps note and workspace form issues by code and field, never by Zod's text.
- **The chat proxy's refusals** (401, 403 upgrade, 429, 502, 503; not the 415 only non-browser
  clients see) are translated with `chatLocale(req, user)`: the user's saved locale when they
  chose one (the route resolves `Me` through `getMeFromRequest`), else `localeFromRequest(req)`
  (the `locale` cookie, then `Accept-Language`; the 401 has no user, so it is always this). apps/ai's
  own error text is never forwarded, and `chat-view.tsx` shows the proxy's message as it comes.
- **Dates** in the note list and the pending invitations render under client components, so the
  server view passes its `locale` down as a prop; the zone stays `UTC`, so the server render and a
  live client update print the same string. `formatUtcDate` (`@repo/i18n/dates`, shared with
  `apps/account`) keeps English's `dateStyle` formatters and builds Swedish by hand — a fixed
  12-entry month table and a hand-padded 24-hour time — since both the combined pattern and
  CLDR's Swedish month abbreviations differ between ICU versions.
- **`describeApiError(error, { locale })`** gives its production "unavailable" message in the reader's language; the
  development-only diagnostics (the API's URL and status) stay English.
- **The guard.** `src/i18n-guard.test.ts` scans every `.tsx` under `src/` except tests and
  `global-error.tsx`; its allow-list (`i18n-guard.allowlist.json`) is empty.

## Environment

The loader is `@repo/session`'s `loadEnv` (`src/lib/env.ts` re-exports it): outside production
every key falls back to its development default. In production `src/instrumentation.ts` fails
the boot without `API_URL`, `API_SERVICE_TOKEN`, `COOKIE_DOMAIN`, `AUTH_URL` and `APP_URL`: Next
logs `Failed to prepare server … <KEY> is not set` and answers every request, `/api/health`
included, with 500 (it keeps listening rather than exiting). The AI pair is checked by the first
chat request. `.env.example` lists them all with their defaults.

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
