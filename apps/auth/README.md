# @repo/auth

Authentication — Next.js 16 on auth.brand.localhost:3002 in development, `auth.brand.com` in production.

Sign-in, sign-up, forgot and reset password, built from `@repo/ui` components and wired to
`apps/api` through `@repo/session`. A successful sign-in sets the `session` cookie on
`COOKIE_DOMAIN`, so the user is signed in on every sibling subdomain (`app.`, `account.`). An
account with two-step verification on answers its code at `/login/verify` first, whichever way it
signed in (see **Two-step verification** below).

```bash
bun --filter @repo/auth dev       # http://auth.brand.localhost:3002
bun --filter @repo/auth test      # the action cores, against a fake api (bun test)
bun --filter @repo/auth build     # standalone output for docker/next.Dockerfile
bun --filter @repo/auth analyze   # bundle report in .next/analyze/
```

## Routes

| Route | What it does |
|---|---|
| `/` | Redirects to `/login` |
| `/login` | Sign-in form, with a button per provider the api has configured (`auth.providers`; none configured, no buttons and no divider). Above the password form, **Sign in with a passkey** (a client component, absent without JavaScript or on a browser with no WebAuthn support — the page is otherwise unchanged) skips the two-step code step even on an account that has it on (see **Passkeys**). Below the password form, a second divider and "Email me a sign-in link" send a one-time magic link — always "Check your inbox for a sign-in link.", whether or not the account exists. `?next=` is where to go afterwards (validated by `safeNextUrl`: a subdomain of `COOKIE_DOMAIN`, else `APP_URL`). `?reset=1`, `?signedout=1` and `?deleted=1` (an account's deletion was just scheduled —
`"Your account is scheduled for deletion. Sign in to cancel."`, the sign-in-again window for `account.cancelDeletion`) show a notice; `?error=two_factor_expired` shows "Your sign-in timed out. Sign in again."; `?error=suspended&provider=<id>` (a suspended account's provider sign-in — password, magic-link and passkey suspensions show the api's own message in place instead, no redirect needed) shows "This account is suspended. Contact support."; `?error=<code>&provider=<id>` from any other failed provider sign-in shows an alert (`OAUTH_ERROR_MESSAGES` in `@repo/ui/lib/oauth-errors`, shared with the account page), signed in or not. `?reauth=1` forces the sign-in form even for a signed-in visitor — the link `apps/account`'s two-step setup and set-password form show when their re-authentication window has lapsed, and where `/oauth/<provider>/start` and the callback send a connect refused for the same reason — with its own notice, skipping the signed-in card and the early `next` redirect (so signing in again replaces the session before continuing to `next`) and re-fetching the provider buttons as if signed out; those buttons carry `reauth=1`, so a provider sign-in there replaces the session rather than connecting to it. Otherwise, already signed in: with a `next` it redirects there; without one it shows the signed-in card (name, email, **Continue** to `APP_URL`, **Sign out**) |
| `/login/verify?next=&recovery=1` | The code step after any sign-in that answered a two-factor challenge: "Enter the 6-digit code from your authenticator app", or with `?recovery=1` (the "Use a recovery code instead" link, so no JavaScript needed) a **Recovery code** field. Without the `two_factor` cookie it redirects to `/login`. Disallowed in `robots.txt` |
| `/signup` | Sign-up form (with the same provider buttons); signs the new account in and redirects like `/login`. Already signed in: redirects to `safeNextUrl(next)` |
| `/oauth/<provider>/start?next=` | Asks the api for the provider's authorization URL, stores its state and PKCE verifier (and `next`) in the `oauth` cookie, redirects to the provider. Unconfigured provider: 404 |
| `/oauth/<provider>/callback` | The provider returns here (`GET` for Google and GitHub; Apple's cross-site `form_post` `POST` only answers 303 to the same path as a `GET`, see below). Checks state against the cookie, finishes sign-in through the api, redirects to `safeNextUrl(next)` — or, on failure, back to `next` with `?error=…&provider=…` when signed in (connecting), else `/login?error=…&provider=…&next=…` |
| `/forgot-password` | Asks for an email; always answers "If an account exists for that email, a reset link is on its way." |
| `/reset-password?token=` | Sets a new password from the emailed link, then `/login?reset=1`. Without a token it offers to request a new link |
| `/verify-email?token=` | Confirms the address from the emailed link: an implausible/expired/used token shows "This link has expired or was already used" with a sign-in link; otherwise "Email verified" with **Open the app** (signed in) or **Sign in**. A failed token for a signed-in user whose address is already verified (a mail scanner may have consumed the link first) shows "Your email is already verified" with **Open the app** instead (`verifyEmailState` in `src/lib/verify-email.ts`) |
| `/magic?token=&next=` | From the magic-link email. An implausible token (checked by shape alone, `isPlausibleToken`) shows "This link has expired or was already used" with **Request a new one** (`/login`) — no api call. A plausible one shows a "Continue to sign in" card: the page itself never calls the api, only the **Continue** button does (`consumeMagicLink`), so a mail scanner that prefetches the link cannot consume the one-time token on its own. Continue ends any prior session, sets the new one and redirects to `safeNextUrl(next)`; a failed consume (expired/used token, or the api being down) shows the message in place with **Request a new one** |
| `/email/cancel?token=` | From the `emailChangeRequested` mail sent to the current address when an email change is requested. An anonymous one-button card — the page never calls the api on load, only **Cancel this change** does (`cancelEmailChange`) — that cancels the pending change and ends every session of the account. Disallowed in `robots.txt`; see **Email change** below |
| `/email/revert?token=` | From the `emailChanged` mail sent to the old address once a change is confirmed, valid 7 days. **Restore my email** (`revertEmailChange`) restores and re-verifies the old address, ends every session, and rolls back whatever changed since the change was requested. Disallowed in `robots.txt`; see **Email change** below |
| `POST /email/unsubscribe/one-click?token=` | The RFC 8058 one-click endpoint an optional notification mail's `List-Unsubscribe` header names: `200` empty body for a good token and for a bad one alike, `429` when rate-limited, `503` when the api cannot be asked. Outside `assertSameOrigin` by design — see **Notification unsubscribe** below |
| `GET /email/unsubscribe/one-click?token=` | `303` to the confirm page below, with the same token. Makes no api call |
| `/email/unsubscribe?token=` | The confirm page: names the optional type the link turns off, then **Turn off these emails** (never on load). Disallowed in `robots.txt` (`/email/` already is); see **Notification unsubscribe** below |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Actions

Each form posts to a server action next to its page (`src/app/<route>/actions.ts`). The action is
a thin wrapper: it builds the deps and calls a core in `src/lib/actions.ts`, where the logic lives
and is tested.

| Action | Core | On success |
|---|---|---|
| `signIn` (`login/actions.ts`) | `signInCore` | `endCurrentSession`, `setSession`, redirect to `safeNextUrl(next)` — or, for a two-factor challenge, the `two_factor` cookie and `/login/verify?next=…` |
| `signUp` (`signup/actions.ts`) | `signUpCore` | `endCurrentSession`, `setSession`, redirect to `safeNextUrl(next)` |
| `forgotPassword` (`forgot-password/actions.ts`) | `forgotPasswordCore` | The same sentence whatever the api says — including nothing, because it is down |
| `resetPassword` (`reset-password/actions.ts`) | `resetPasswordCore` | Redirect to `/login?reset=1` |
| `requestMagicLink` (`login/actions.ts`) | `requestMagicLinkCore` | The same sentence whatever the api says: "Check your inbox for a sign-in link." |
| `consumeMagicLink` (`magic/actions.ts`) | `consumeMagicLinkCore` | `endCurrentSession`, `setSession`, redirect to `safeNextUrl(next)` — or the code step, like `signIn` |
| `cancelEmailChange` (`email/cancel/actions.ts`) | `cancelEmailChangeCore` | "The change was cancelled and every session was signed out." |
| `revertEmailChange` (`email/revert/actions.ts`) | `revertEmailChangeCore` | "Your email is restored. …" plus, only when the account had a password, a note to check for a reset link, and always a reminder to review connected providers and two-step |
| `turnOffEmails` (`email/unsubscribe/actions.ts`) | `unsubscribeCore` (`src/lib/unsubscribe.ts`) | "You won't get these emails any more. …" with a link to account `/notifications`; see **Notification unsubscribe** below |
| `verifyTwoFactor` (`login/verify/actions.ts`) | `verifyTwoFactorCore` (`src/lib/two-factor.ts`) | `endCurrentSession`, `setSession`, clear the `two_factor` cookie, redirect to `safeNextUrl(next)` |
| `signOut` (`src/app/actions.ts`) | — | `auth.signOut` as the user (skipped when there is no session cookie, e.g. already signed out in another tab), `clearSession()` whatever the api answered, redirect to `/login?signedout=1` |

The cores validate `FormData` with the contract's Zod schemas before any api call, show the api's
declared errors (wrong credentials, throttled, email taken, bad reset token) inline, and turn
anything else into "The sign-in service is unavailable right now." (logged). `consumeMagicLinkCore`
checks the token's shape (`isPlausibleToken`, shared with `/verify-email`) before any api call, and
never reveals *why* a sign-in link failed: both an expired/used token (the api's `BAD_REQUEST`) and
an implausible one show "This sign-in link has expired or was already used"; only an unrelated
failure (the api being unreachable) shows "unavailable" instead. The six anonymous calls go through
`getAuth().anonymousApi({ ip })`: the service token with no session, keyed by the request's ip for
the api's rate limit. Sign-in, sign-up and magic-link consume send `client: { userAgent, ip }` from
the request headers (`requestInfo` from `@repo/session`: `x-real-ip`, else the first `x-forwarded-for` hop)
for the sessions list on `account.`.

`endCurrentSession` runs only after the api has issued the new session and before its cookie is
written, so the cookie still holds the browser's previous token: that session is signed out
api-side rather than left live. A failed sign-in or sign-up never reaches it, so a wrong password
does not end the session you already had, and a failure to end it is logged, never a reason to
refuse the new sign-in. If the api issues a session but writing its cookie then fails, the form
shows "unavailable" and the issued session is an orphan: a device row nobody holds, live until it
expires (up to 30 days) and visible, and revocable, in `account.`'s Security → Your devices list.

That rate limit is per browser behind a proxy that sets `x-real-ip` / overwrites
`x-forwarded-for`. With no proxy, `next start` fills `x-forwarded-for` from the socket address when
it is absent, but a client talking to Next directly can send its own `x-real-ip` /
`x-forwarded-for`; behind a proxy that appends, the first hop is client-supplied too. In both cases
the key is best-effort. Behind a proxy that sets neither, every caller arrives from the proxy's
address and shares one bucket.

Sign-out is a server action in each app that shows a sign-out button (`apps/app` has its own),
not a shared `/logout` route: a POST from `app.` to `auth.` is cross-origin and
`assertSameOrigin` would refuse it.

## Provider sign-in (Google, GitHub, Apple)

The api issues `state` and the PKCE verifier on `auth.oauth.start` and **trusts the caller to check
the state** on callback: it never sees it again. The route handlers in `src/app/oauth/[provider]/`
do that, around cores in `src/lib/oauth.ts` (tested in `oauth.test.ts`):

- **Start**, for a browser holding a `session` cookie (a connect), calls `auth.oauth.start` with
  that session forwarded (`auth.api()`); the api refuses one past `REAUTH_WINDOW_MS` (`403`,
  `data.reason: "reauth"`) and the route answers `303` to `/login?reauth=1&next=<safeNextUrl(next)>`
  instead of sending the browser to the provider. Signed out, or from the `?reauth=1` form's own
  buttons (which add `reauth=1` to the start URL), it calls anonymously. It then writes the
  HttpOnly `oauth` cookie: `{ provider, state, codeVerifier, next, reauth? }` (`next`
  already through `safeNextUrl`, so it is validated and bounded),
  base64url JSON, `Secure; SameSite=None; Path=/oauth; Max-Age=600`, host-only (no `domain`:
  sibling subdomains never receive it). `SameSite=None` because Apple returns with a cross-site POST, which would not carry a Lax cookie; browsers treat
  `*.localhost` as a secure context, so it works over http in dev.
- **Callback** compares before any api call: no cookie, a cookie for another provider, or a
  different `state` redirects to `/login?error=state` and never reaches the api. The cookie is
  cleared on every outcome (single use). `error=access_denied` from the provider is
  `cancelled`; the api's `FORBIDDEN` (unverified email), `CONFLICT` (identity owned by another
  account, or a second identity of a provider the user already connected) and `BAD_GATEWAY`
  (provider down) become `unverified`, `claimed` and `provider`, anything else `failed` — each
  with `&provider=<id>`. Signed out, the failure goes to `/login?error=…&next=<safeNextUrl(next)>`
  so the form can resume; signed in, back to `next` itself (the account page when connecting)
  with `?error=…&provider=…` added. Undeclared errors are logged; the code, verifier and tokens
  never are.
- **Signed in already**: the callback forwards the session (`auth.api()`, `x-session-token`) —
  unless the cookie carries `reauth` (begun on the `?reauth=1` form), which signs in afresh
  anonymously, ending the old session and setting the new one. A session that aged past the re-auth window during the round trip is refused
  again there (`403` `reauth`, nothing written) and the browser goes to
  `/login?reauth=1&next=<next>`, as from Start. Otherwise the api connects the provider to that
  account and answers with that same session (it never mints a second one, which would restart
  the re-authentication window), so
  `oauthCallbackCore` — handed the cookie's token as `currentToken` — returns no `session` and the
  route leaves the cookie alone. Only when the api answers with a different session (the cookie was
  stale, so this ran as a sign-in) is the previous one signed out api-side, as password sign-in
  does, and the new cookie set.
- **Apple's `form_post` becomes a GET.** Apple returns with a cross-site `POST` from
  `appleid.apple.com`. The `session` cookie is `SameSite=Lax`, and Lax cookies ride top-level
  `GET` navigations, never cross-site POSTs — so a callback finished on the POST would not see the
  session, and "Connect Apple" from the account page would run as an anonymous sign-in (linking by
  email, purging an unverified account, or creating a second account). The `POST` handler
  therefore finishes nothing: it answers `303` to `GET /oauth/apple/callback?code=…&state=…&user=…`
  on this origin (each field URL-encoded, absent ones omitted) and leaves the `oauth` cookie
  (`SameSite=None`, so it did arrive) for the GET, which checks and clears it with the session
  cookie present. Codes are already URL-borne for Google and GitHub; this puts Apple's on the same
  footing.
- **CSRF**: the shared security proxy only adds headers, it never refuses a cross-site POST, so
  Apple's `form_post` needs no exemption. The state cookie is the CSRF check.

The provider glyphs are `simple-icons:*`, outside the offline lucide bundle, so Iconify fetches
them from `api.iconify.design` at runtime (allowed by the shared `connect-src`), as before.

### The reset limiter's trade

The api throttles reset requests **per email** (3 per 15 minutes) and a tripped limit answers
exactly like success, so the form never reveals whether an account exists. The cost: anyone who
knows a victim's address can send three requests and hold that address's reset emails for 15
minutes. That is the accepted trade for never confirming account existence.

## Email change

Two anonymous, button-consumed pages mirror `/magic`'s plumbing: the token only ever travels in
the button's own POST, never on page load, so a mail scanner that prefetches either link cannot
spend it. `src/lib/email-change.ts` has the two cores (`cancelEmailChangeCore`,
`revertEmailChangeCore`, tested in `email-change.test.ts` plus a Swedish describe block in
`actions-sv.test.ts`): an implausible token (`isPlausibleToken`, the same 43-char base64url shape
check `/magic` uses) never reaches the api and shows the same "invalid, expired or already used"
message a real `BAD_REQUEST` does; an unreachable api logs and shows "unavailable"; success calls
`clearSession()` (the same helper `signOut` uses) so a still-open tab on this browser does not
keep showing a now-dead session — best-effort, logged on failure, never blocking the success
state. `/email/revert`'s `CONFLICT` (the old address is now taken) shows the api's own, already
localized message verbatim (`x-locale` is forwarded by `anonymousApi` as usual) — the same
precedent `signUpCore`'s `CONFLICT` and `resetPasswordCore`'s `BAD_REQUEST` follow for api-owned
wording. Its success message adds, only when the response's `passwordReset` is true, a note to
check for a password-reset link, and always a line asking the owner to review their connected
sign-in providers and two-step verification, linked to `${siteUrl("account")}/security` — computed
in the server-rendered view (`src/views/email-revert-view.tsx`) and passed down as a plain
`securityUrl` prop, never read by the client form itself (see **A bundle-budget lesson** below for
why that distinction is enforced, not just convention). Both success panels move focus to their
own heading on mount (`email-change-focus.ts`'s `focusEmailCancelHeading` /
`focusEmailRevertHeading`), the same pattern `apps/account`'s `/email/confirm` uses.
`src/app/robots.ts` disallows `/email/` alongside `/oauth/`, `/magic`, `/verify-email`,
`/reset-password` and `/login/verify`.

**A bundle-budget lesson.** The heading-id/focus-fn pair for both pages lives in its own
zero-dependency `email-change-focus.ts`, not inside `email-change.ts` with the action cores: a
client component importing even one *value* from a module — the heading id constant, say — pulls
the module's whole import graph into the browser bundle, and `email-change.ts` imports
`@orpc/client`, `@repo/log` and the full i18n catalog loader through `./i18n`. The first attempt
put both pairs together and measured `/email/cancel` and `/email/revert` at ~30 KB over every
other auth route; splitting the pure heading-id/focus-fn pair out (mirroring `apps/account`'s own
`lib/email-confirm.ts`) brought them back in line, and `scripts/client-imports.test.ts`
now fails the build the same way if a `"use client"` file ever imports a *value* — `siteUrl`
included — from the bare `@repo/sites` specifier again, since its `process.env.SITE_DOMAIN` read
is never inlined into the browser bundle. The two client components import only a `type` from
`email-change.ts`.

Requesting a change and confirming it both happen on `apps/account` — see its README's **Email
change** section. See also CLAUDE.md's **Email change** paragraph, `apps/api/README.md`'s own
section and `docs/guides/email-change.md`.

## Notification unsubscribe

Phase 13 B: the one-click and confirm pages an optional notification mail's unsubscribe links
point at — `member.role_changed`, `member.removed` and `plan.changed` mail, never the four locked
types. The token names one user and one optional type and never expires; see the api's
**Notification preferences** section for its format.

- `src/app/email/unsubscribe/one-click/route.ts` — the `POST` the RFC 8058
  `List-Unsubscribe` header names (`lib/unsubscribe.ts`'s `oneClickResponse`). It reads only the
  `token` query parameter, never the body, so any body (or none) works the same. It calls
  `auth.notificationEmail.unsubscribe` with `unsubscribeTokenClientId(token)`
  (`@repo/session/client`: `unsub:` + the first 32 hex of `sha256(token)`) as its client id —
  **not** the poster's ip, because mail providers (Gmail, Yahoo, …) post one-clicks from shared
  egress addresses that would otherwise share one rate-limit bucket. The api verifies the token
  before spending any budget, so this is one bucket per real link: a forged token costs one HMAC
  and spends nothing, while a real one is bounded per link and by the api-wide cap. Status mapping: a good token or the
  api's own `BAD_REQUEST` both answer a blank `200` (so the response is never an oracle for which),
  `TOO_MANY_REQUESTS` answers `429` (honest — RFC 8058 senders may retry), and an unreachable api
  or missing env answers `503`. Deliberately outside `assertSameOrigin`: a mail provider's server
  posts cross-site, with no cookie and no Origin header to check against, and that is safe here
  because the only thing a forged POST could do is turn one optional email type off for the one
  user the HMAC-signed token names — idempotent, never a sign-in, never a locked type. (Next's own
  server-action Origin check does not apply to route handlers either way, and the shared security
  proxy only adds headers.) `GET` on the same path makes no api call and only `303`s to the confirm
  page below with the same token.
- `/email/unsubscribe?token=` (`src/app/email/unsubscribe/page.tsx`,
  `views/email-unsubscribe-view.tsx`) calls the read-only `auth.notificationEmail.peek` on load
  (`unsubscribeClientId(ip)` as its client id) and renders one of three states
  (`lib/unsubscribe.ts`'s `UnsubscribeLink`): **valid** (the type named in a sentence, then **Turn
  off these emails** — a server action, `turnOffEmails`, so the link itself, or a mail scanner
  that prefetches it, never unsubscribes anyone), **invalid** (a neutral "This link isn't valid any
  more." with a sign-in link — for a bad token, or the api's own `BAD_REQUEST`), or a distinct
  **unavailable** state (`peek` rate-limited, the api unreachable, or env missing: a short
  "couldn't load this right now, try again" note, no button, nothing about the token) — because
  `peek` shares the same two limits as `unsubscribe`, and tokens never expire, so an outage here
  must never be shown as if the link were dead.
- en + sv strings live under `auth.emailUnsubscribe.*` and `auth.pages.emailUnsubscribe`;
  `lib/unsubscribe-types.ts` maps each optional type to its own sentence key, kept dependency-free
  so the "use client" button component can import it without pulling in `@orpc/client` or the
  translator (the same split as `email-change-focus.ts` above).
- `/email/` is already disallowed in `robots.txt`, so this route needed no change there; the
  confirm page's invalid state is in the a11y manifest.

See `apps/api/README.md`'s **Notification preferences** section, `apps/account/README.md`'s
**Notifications** section and `docs/guides/notification-preferences.md`.

## Two-step verification

The api answers `auth.signIn`, `auth.magicLink.consume` and `auth.oauth.callback` with a challenge
instead of a session when the account has two-step verification on. The password action, the
magic link's **Continue** action and the provider callback route all handle it the same way: they
write the challenge to the `two_factor` cookie and redirect to `/login/verify?next=<next>`, with
`next` already through `safeNextUrl`. No session cookie is written until the code is right.

- **The cookie.** `two_factor` (`TWO_FACTOR_COOKIE` in `src/lib/two-factor.ts`): host-only on this
  app (no `Domain`, like `oauth`), HttpOnly, `SameSite=Lax`, `Path=/`, `Secure` in production,
  `Max-Age` 300 — the api's challenge lives 5 minutes too.
- **The action.** `verifyTwoFactorCore` checks the code's shape locally (6–20 characters, the
  contract's `TwoFactorVerifySchema`), then calls `auth.twoFactor.verify`. A wrong code is a field
  error ("That code didn't work. Check your authenticator app and try again.") and keeps the cookie,
  so a retry targets the same challenge; a dead challenge — expired, unknown, or burnt by the fifth
  wrong code — clears it and redirects to `/login?error=two_factor_expired` (keeping `next` when it
  is not the default); a throttled one shows the api's message. A missing or tampered cookie goes
  to `/login`. Success ends the browser's previous session, as password sign-in does, sets the new
  one and redirects to `next`.
- **Lost phone.** A recovery code works once in place of the 6-digit code — only the request that
  wins the challenge spends it; one a concurrent request already spent comes back as an ordinary
  wrong code, the challenge still live. With none left, a
  superadmin's **Reset two-step verification** on `/admin/users/<id>` (a reason, 3–200
  characters) turns it off, signs the user out everywhere and mails them; it is disabled on the
  admin's own page and for another superadmin ("A superadmin's two-step verification cannot be
  reset"), and audited as `user.two_factor_reset`
  (`resetTwoFactorCore` in `src/lib/admin-actions.ts`). There is no email bypass.

Turning it on, off and regenerating recovery codes lives on `account.`'s Security page.

## Passkeys

`/login` offers **Sign in with a passkey**, over `PasskeySignIn`
(`src/components/passkey-sign-in.tsx`), a client component. Before hydration it renders the same
button, message area and divider as an invisible, `aria-hidden`, `inert` placeholder of identical
size (a `useSyncExternalStore` hydration probe, `StaticLocaleSwitcher`'s trick), so the password
form below never shifts when the real block takes its place; the placeholder also carries
`[@media(scripting:none)]:hidden`, so without JavaScript it collapses to nothing and the page is
the pre-existing password form plus social buttons plus magic link, unchanged. Once hydrated the
real block shows at once — support is assumed while a mount effect checks
`window.PublicKeyCredential` — and it collapses only in the rare case that check finds no WebAuthn
at all. Where the browser supports conditional mediation (`browserSupportsWebAuthnAutofill()`), it
also starts a quiet autofill ceremony on mount, so a registered passkey can be offered from the
email field's own autofill dropdown with nothing clicked; the email input's `autoComplete` is
`"username webauthn"` for this. The explicit button calls the same `startAuthentication` path,
which aborts any still-pending autofill request (`@simplewebauthn/browser`'s own
`WebAuthnAbortService`, a module-level singleton — nothing in this component does the aborting
itself) and is cancelled in turn on unmount. The reverse never happens: a click while the quiet
ceremony is still fetching its options makes the quiet one stand down for good
(`quietCeremonyMayProceed` in `src/lib/passkey.ts`, over a count of clicks), so its own later
`startAuthentication` can never abort the ceremony the visitor asked for. After a successful
sign-in the button stays disabled until the browser has navigated away.

- **The action.** `passkeyOptionsCore` / `passkeySignInCore` (`src/lib/actions.ts`) call
  `auth.passkey.options` then `auth.passkey.verify`, and on success reuse `endCurrentSession` and
  `storeSession` exactly as the password action does, same order. The server action
  (`passkeySignIn` in `src/app/login/actions.ts`) hands back `{ redirectTo }` as data rather than
  calling `redirect()` — it's invoked from plain client code, not a form submission — and the
  component navigates with `window.location.href` once the cookie is already set.
- **Errors.** `classifyPasskeyError(error, fromAutofill)` (`src/lib/passkey.ts`) sorts every
  thrown error into `"none"` (an `AbortError` — a later ceremony replaced this one, nothing
  shown), `"cancelled"` (`NotAllowedError` — the user dismissed the prompt or it timed out, shown
  as a neutral `role="status"`, not an alert) or `"failed"` (anything else from the explicit
  button; the same case from the silent autofill ceremony is swallowed as `"none"` instead, so a
  background request never interrupts the page with an error the visitor never asked for). A
  server-side failure shows the api's own `passkeyFailed` sentence, word-for-word the same English
  and Swedish text `@repo/api-contract`'s `PASSKEY_FAILED_MESSAGE` carries, so a reader never sees
  two different sentences for "that didn't work" depending on whether the failure happened in the
  browser or on the api.
- **Admin.** `/admin/users/<id>` always shows a **Passkeys** card (the count, even at zero —
  `"No passkeys."` instead of a form when it is); once above zero, **Remove passkeys** (a reason,
  3–200 characters, the same shape as **Reset two-step verification**) calls
  `admin.users.removePasskeys`. Disabled, with a reason shown, on the admin's own page and for
  another superadmin — the same pattern **Reset two-step verification**'s card already uses.

See CLAUDE.md's **Passkeys** paragraph and `apps/api/README.md`'s **Passkeys** section for the
policy (the challenge, the counter rule, impersonation, the last-way-in rule, mail), and
`docs/guides/passkeys.md` for the relying party, subdomains and local dev.

## Admin (`/admin`)

The operator console lives here. It exists only for a **superadmin** — a verified account whose
email is in the api's `SUPERADMIN_EMAILS` — and only while they are not impersonating anyone.
Everyone else, signed in or impersonating, gets the app's 404 for every `/admin` page (signed out:
the sign-in redirect first). The gate is `canUseAdmin(me)` in `src/lib/admin.ts`, checked by the
`src/app/admin/(gated)/layout.tsx` layout and again by every admin server action; the api answers
`NOT_FOUND` to anyone else regardless. The header shows an **Admin** link only when it passes.

| Route | What it shows |
|---|---|
| `/admin` | Metrics: users, verified, sign-ups (7 and 30 days), active sessions, waitlist, workspaces by plan, past due, pending invitations; a **Health** section with the **Errors (24 h)** and **Web vitals (7 d)** cards, then the **Background jobs** card |
| `/admin/users?q=&suspended=true` | Users, newest first; `q` matches an email prefix or a name substring, `suspended=true` shows only accounts an active suspension blocks right now (a "Suspended" badge marks each one in the unfiltered list too). A GET form, so the query lives in the URL; **Older** pages back, carrying both |
| `/admin/users/<id>` | Profile (a **Deletion** row with the scheduled purge date when one is pending), sessions (**Sign out everywhere**, behind a confirm checkbox), workspaces, **Impersonate**, a **Suspension** card (status, reason, until, by — **Lift suspension** whenever a record exists, active or expired, **Suspend account** otherwise), **Reset two-step verification** (only when the user has it on), a **Passkeys** card (always shown, with the count — **Remove passkeys** once it's above zero), recent audit entries |
| `/admin/workspaces?q=` | Workspaces with owners, member count, plan and billing status |
| `/admin/workspaces/<id>` | Members, the mirrored subscription, recent audit entries |
| `/admin/support?status=open\|resolved\|all` | Help-center contact requests, newest first; the message as text in a `white-space: pre-wrap` block, never HTML; **Mark resolved** / **Reopen** per request |
| `/admin/applications?status=all\|new\|reviewing\|rejected\|hired&job=` | Job applications, newest first; status tabs (`all` first and the default) and a role-slug filter, both GET forms; **Download CV**, a **Set status** select and **Delete** per application |
| `/admin/leads?status=all\|new\|contacted\|call_booked\|won\|lost` | The coaching site's contact-form leads, newest first; a tab per status with its count (`all` first and the default), each lead linking its detail page (see **Leads.** in `CLAUDE.md`) |
| `/admin/leads/<id>` | One lead: every answer, the next step the visitor was shown, `mailto:` / `tel:` links, the message as text in a `white-space: pre-wrap` block, and one form for the status and Yasmina's notes (`updateLeadCore`, audited as `lead.updated` without the notes' text) |
| `/admin/audit?actorId=&targetType=&targetId=` | The audit log, filterable; the retention limits; an **Export** card (CSV or JSON Lines) |
| `/admin/analytics?days=7\|30\|90` | Visitors/pageviews chart and table, top pages, top referrers, events per day, and the sign-up funnel |
| `/admin/stop` | Outside the gate: the page the banner's **Stop impersonating** links to |

Every date is printed by `formatDateTime` (fixed `en` locale, UTC), so the server render never
depends on the host's zone.

**Health cards.** `/admin` loads `admin.telemetry.errors` and `admin.telemetry.vitals` in parallel
with `admin.metrics` and renders two cards (`src/components/admin/errors-card.tsx`,
`vitals-card.tsx`; see `apps/api/README.md`'s **Telemetry** section for where the rows come from).
**Errors (24 h)** shows the distinct-fingerprint and total-event counts, then a table of the five
busiest fingerprints — app, kind, message (truncated to 80 characters, the full text in the cell's
`title`), route, count, last seen — empty state "No errors in the last 24 hours." **Web vitals
(7 d)** shows one row per app — sample count (the app's LCP, INP and CLS samples summed), p75
LCP/INP/CLS — each value coloured and labelled by
the official web.dev thresholds (`rateVital`/`VITAL_THRESHOLDS` in `@repo/api-contract`: LCP 2.5 s /
4 s, INP 200 / 500 ms, CLS 0.1 / 0.25), `—` for no samples; empty state "No vitals reported yet."
A failure of either procedure (other than the non-admin `NOT_FOUND`, which is the page's 404)
does not fail the page: that card renders "Could not load errors." / "Could not load web vitals."
(a `role="status"` paragraph) and the metrics still show; a `admin.metrics` failure still fails the
page. Both procedures sit behind the same `superadmin` middleware as every other `admin.*` call.

**Background jobs card.** `/admin` also loads `admin.jobs.list` in the same parallel batch and renders
`src/components/admin/jobs-card.tsx` under its own **Background jobs** heading (see
`apps/api/README.md`'s **Jobs** section for the queue). The card's description is the
`queued · running · dead` counts; below it, the 20 most recently dead jobs — name, attempts
(`attempts/max`), last error (truncated to 200 characters, the full text in the cell's `title`),
when it died — or "No dead jobs." Payloads are never shown (the api never returns them). Each row
has **Retry** (back to the queue with its attempts reset; "Job requeued.", or the api's
"A newer copy of this job is already queued" when a newer live copy holds its dedupe key) and
**Discard** (the row deleted for good; "Job discarded."), each a plain form posting a server action
in `src/app/admin/(gated)/actions.ts` that re-checks `canUseAdmin` (anyone else gets the 404) and
revalidates `/admin`; both writes are audited api-side (`job.retried`, `job.discarded`). The cores
are `retryJobCore` / `discardJobCore` in `src/lib/admin-actions.ts`, tested in
`admin-actions.test.ts`. A failed `admin.jobs.list` renders "Could not load the job queue."
(`role="status"`) in place of the card without failing the page.

**Analytics dashboard.** `/admin/analytics?days=7|30|90` (`src/views/admin-analytics-view.tsx`,
`src/lib/admin.ts`'s `parseDays` — anything else falls back to 7 silently) calls
`admin.analytics.summary({ days })` (see `apps/api/README.md`'s **Analytics** section for where the
rows come from) and renders a range nav, an `AreaChart` (`@repo/ui/components/charts`) of daily
visitors and pageviews over a `<details>` holding the same numbers as a plain table, top-pages and
top-referrers tables, an events-per-day table, and the funnel table (each step's count and its
percentage of `signed_up`). The help text under the heading states the one thing to know reading
it: "Visitors are counted per app per day, so the same person using two apps counts twice. Nothing
here is per person." When the range is longer than `retentionDays` (`ANALYTICS_RETENTION_DAYS`), a
note under the range nav says the funnel and top referrers cover only the retained days. `AdminNav` carries the **Analytics** link on every admin page, same as **Audit
log**'s nav-only precedent — there is no stat tile for it on `/admin`'s home view. A non-admin or an
impersonation session gets the `NOT_FOUND` → 404 page like every other admin route.

**Impersonation.** On a user's page the admin gives a **Reason** (3–200 characters, "Shown to the
user in the audit log") and presses **Impersonate**; it is disabled on their own page ("This is
you") and for another superadmin ("Superadmins cannot be impersonated") — not for a suspended
target, which the form doesn't pre-check: submitting against one surfaces the api's own "A
suspended account cannot be impersonated" verbatim through the same generic error-passthrough the
other two refusals use, since its session could never act anyway. The api issues a one-hour
session as that user and records it in the audit log; `startImpersonation` parks the admin's own
token in the `admin_session` cookie — host-only on this app, `Path=/admin` — and sets `session`,
then the browser lands on `${APP_URL}/notes`. While it lasts, the signed-in layouts render the
amber `ImpersonationBanner` above the header and the user menu reads "(impersonating)". The api lets an
impersonator look, not touch: password and verification changes, connecting or disconnecting
providers, managing passkeys, session management, deleting or transferring a workspace and every billing mutation
answer `FORBIDDEN` "Not available while impersonating"; everything else is audited with both
identities. **Stop impersonating** on `/admin/stop` (reachable by anyone impersonating; otherwise it
redirects to `/admin`) revokes the impersonation session api-side first, then restores the parked
admin session and returns to `/admin/users/<id>`; with no parked token left it signs the browser
out (`/login?signedout=1`). The cores (`impersonateCore`, `stopImpersonationCore`,
`revokeSessionsCore`) are in `src/lib/admin-actions.ts`, tested in `admin-actions.test.ts`.

**Suspension.** The **Suspension** card on a user's page shows Status (Not suspended / Active /
Expired), and — once a record exists — Reason, Until (a date, or "Indefinite") and By (the
admin's email, or "Unknown (account purged)"). One form, `SuspensionForm`
(`src/components/admin/suspend-form.tsx`), renders as either side of the same suspension depending
on whether a record exists (`user.suspended` non-null): no record shows a **Reason for suspending**
textarea (3–200 characters) and an optional **End date** (`type="date"`, bounded client-side by
`suspendUntilBounds()` — tomorrow through the last day whose converted end, the next UTC midnight,
is still within 365 days, a hint only, the api decides) with a **Suspend account** button; a
record, active or expired, shows **Reason for lifting** and **Lift suspension** instead — lifting is
what clears an expired record, so suspending again after expiry means lifting first (an expired
record's card says so). The status still reads Active or Expired.
Every reason field's hint reads "Internal: kept in the audit log, never shown to the user." Both
post to one server action, `changeSuspension` (`src/app/admin/(gated)/users/[id]/actions.ts`), via
a hidden `intent` (`"suspend"` / `"unsuspend"`) field, dispatching to `suspendUserCore` /
`unsuspendUserCore` (`src/lib/admin-actions.ts`; `untilFromDateInput` turns the date input's
`"2026-11-01"` into the end of that UTC day, `"2026-11-02T00:00:00.000Z"` — "suspended through
Nov 1" — rejecting a calendar-invalid date by round-tripping it through `Date.UTC` rather than
letting it silently overflow into a different date) and `revalidatePath`-ing the page on success.
Disabled, with the same trailing reason, for yourself and a superadmin (`SELF_SUSPEND_MESSAGE` /
`SUPERADMIN_SUSPEND_MESSAGE`) — like Impersonate, it pre-checks yourself and superadmins (there
is no suspended-target case here). The form's field ids carry a `suspend-` / `unsuspend-` prefix
(the `FieldError` ids too, through `form-feedback`'s `idPrefix`), so they never collide with the
other admin forms' `reason` on the same page.
Every sign-in page that can answer the suspended `FORBIDDEN` — `/login` (password and passkey),
`/magic` and `/login/verify` — shows the api's own message verbatim, since it already answers in
the caller's locale. The one exception is the provider callback: its 303 redirect to `/login`
cannot carry the api's message, so `oauth.ts`'s `isSuspendedRefusal()` tells it apart from the
callback's other `FORBIDDEN` (`providerEmailUnverified`) by comparing the thrown message against
this app's own `common.accountSuspended` catalog entry in every locale (pinned equal to the api's
`accountSuspended` string, per locale, by a dedicated test) and redirects to
`/login?error=suspended&provider=<id>&next=<next>`, which the login page renders the same way it
already special-cases `error=two_factor_expired`.

**Audit log and export.** `/admin/audit?actorId=&targetType=&targetId=`
(`src/views/admin-audit-view.tsx`) shows, in order: a `<p>` reading "Network details (IP, browser)
are kept {piiDays} days; entries are kept {rowDays} days." — the live
`retention.piiDays`/`retention.rowDays` off `admin.audit.list`'s response (see `apps/api/README.md`'s
**Audit retention and export** section), never a fixed string — the filter form, an **Export**
card, then the filterable table (`AuditTable`) and pager. The card sits above the table so a
refusal notice is in view right after the redirect; it reads "Uses the filters above." and holds a
plain `<form method="post" action="/admin/audit/export">` (no JavaScript required) with **From** /
**To** (`<input type="date">`, defaulting to the last 30 UTC days via `auditExportDefaultRange()`,
with `min` — the oldest day an entry can still exist, today − `rowDays` — and `max` — tomorrow, the
latest `to` the api accepts — from `auditExportDateBounds()`, both in `src/lib/admin.ts` and
computed on the server), **Format** (a native `<select>` — CSV or JSON Lines, not the Radix-based
select, for the same no-JavaScript reason the Language card's `LocaleSelect` uses one), and the page's current
`actorId`/`targetType`/`targetId` filters carried as hidden fields.
`src/app/admin/(gated)/audit/export/route.ts` (`POST` only) runs `assertSameOrigin` first (`403` on
a cross-site post), resolves the signed-in admin and calls `admin.audit.export`. The `(gated)`
layout does not wrap route handlers, so the gate is the api's own `NOT_FOUND`. Every response —
the file, a `404`, a redirect — carries `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`
and `Content-Security-Policy: sandbox` (the CV route's `SAFE` set); success streams the file with
`Content-Disposition: attachment; filename="<file.name>"`, setting `Content-Type` itself from the
posted `format` (`text/csv; charset=utf-8` / `application/x-ndjson`) rather than trusting the
returned `File`'s own `.type`, which does not survive decode reliably. A signed-out caller, a
non-admin (the api's own `NOT_FOUND`) or any other 4xx answers a bare `404`, exactly like every
other `/admin` route; a validation/cap/rate-limit refusal (`BAD_REQUEST`/`CONFLICT`/
`TOO_MANY_REQUESTS`) redirects (303) to `/admin/audit?exportError=<code>` with the filters kept,
and so does an api 5xx or an unreachable api, as `exportError=unavailable` ("The export is
unavailable right now. Try again shortly."); the view shows the matching message inside a
destructive `Alert` (`auditExportErrorMessage` in `src/lib/audit-export.ts`; an unrecognised code
shows nothing). The submit produces a download, not a navigation. English only,
like the rest of `/admin`. The cores are `src/lib/audit-export.ts`'s pure helpers, tested in
`audit-export.test.ts` and `admin-audit-view.test.tsx`.

## Locale (English and Swedish)

Every non-admin page and form renders in English or Swedish — this was the first fully translated
app in the i18n foundation; `apps/app` and `apps/account` followed it (see `docs/guides/i18n.md`
and the root `CLAUDE.md`'s **i18n.** paragraph for the shared layer). `/admin/**` stays English on
purpose (internal tooling, out of scope).

- **Wiring.** `src/i18n/request.ts` (`next-intl`'s `getRequestConfig`, no routing, no
  `[locale]` segment) resolves the locale from `getAuth().getLocale()` — the request's saved
  preference, cookie or `Accept-Language`, see `packages/session/README.md` — defaulting to
  English if `getAuth()` itself throws (production with no env, during `next build`). The root
  layout renders `<html lang={locale}>` and wraps the tree in `NextIntlClientProvider` with only
  the `auth` namespace (client components read nothing else; `ui` strings reach `@repo/ui`
  components as props, computed server-side, so that namespace never ships to the browser).
- **The switcher.** `LocaleSwitcher` (`@repo/ui/components/locale-switcher`) sits in the header,
  before `ThemeToggle`: a language menu (the trigger shows the current language's flag and name;
  each language is a button, applied as soon as it is activated — an explicit choice, so WCAG
  3.2.2 holds; without JavaScript a `<details>` whose languages are submit buttons). It posts to
  the `setLocale` server action (`src/app/actions.ts`), which validates the value, calls
  `getAuth().setLocale(locale)` (saves the profile when signed in, then the cookie — see
  `packages/session/README.md`), revalidates the whole layout on success, and redirects to
  `localeReturnPath(referer, AUTH_URL, { failed })` (`src/lib/locale.ts`): the same-origin path the
  request came from (never an open redirect — anything else, or no `Referer`, goes to `/`), with
  `?locale_error=1` added on failure and dropped on success. `LocaleErrorNotice` (a client
  component reading `useSearchParams`, inside its own `Suspense fallback={null}`) renders that
  notice — a layout cannot read `searchParams`, and a JS server-action redirect's re-render still
  carries the posting request's headers, so an `x-url`-style read would miss the flag. Works with
  JavaScript off: the form is a plain POST.
- **Zod.** `zodMessage(t)` (`src/lib/i18n.ts`) maps a Zod issue to a translated message by its
  `code` (and, for a custom refine, `params.key`) — never by its English message text, so it
  survives any future rewording. English's own Zod messages are intentionally friendlier than
  Zod's defaults ("Enter a valid email address." rather than "Invalid email address"); there was no
  prior test or e2e journey pinned to the old wording. `fieldErrors(issues, zodMessage(t))` from
  `@repo/ui/components/form-feedback` renders them; without a `translate` argument that helper's
  behaviour is unchanged, for callers outside this app.
- **Action cores.** `ActionDeps.locale?` / `VerifyDeps.locale?` (both default to English) carry
  the request's locale into `src/lib/actions.ts` and `src/lib/two-factor.ts`, which build their own
  sentences through `authTranslator(locale)` (`src/lib/i18n.ts`, over `@repo/i18n/translate`). The
  api's own messages (sent back on `x-locale`, see `apps/api/README.md`'s **Locale** section) pass
  through untouched — this app only translates its *own* copy (unavailable notices, the identical
  known/unknown-email sentences, field validation).
- **Dates.** The impersonation banner's countdown uses `next-intl`'s `getFormatter` (`format.dateTime`
  with an explicit `UTC` zone), wrapped in the `ui.impersonation.endsAt` message — English output
  matches the plain `formatEndsAt` this replaced.
- **Status pages.** `error.tsx` is also rendered by `global-error.tsx`, outside the layout's
  `NextIntlClientProvider` (so `useTranslations` would throw there); a small `IntlReady` context
  (`src/components/intl-ready.tsx`) marks the tree under the provider, and `error.tsx` only
  translates there, falling back to English otherwise (both paths tested in
  `src/app/error.test.tsx`). `not-found.tsx` uses `getTranslations` directly. `global-error.tsx`
  itself is untouched and stays byte-identical across every app, translated or not.
  `apps/app` and `apps/account` copied this app's `error.tsx` and `not-found.tsx` (namespace
  changed to their own `status`), so `scripts/ci-plan.test.ts` now excludes all three apps from
  the plain cross-app identical-files check but asserts the three translated copies are one file
  once that namespace is normalized, and that each still calls
  `reportError(error, { kind: "boundary", … })` — the files are unified again, just parametrised
  by namespace instead of byte-identical.
- **Metadata.** The root layout's `description` is translated through `generateMetadata` (an
  `auth.meta.description` key), rather than the static string every other app still uses.
- **The guard.** The hard-coded-string check used to live entirely inside this app; it is now
  `packages/i18n-guard` (`@repo/i18n-guard`), a small workspace package every translated app
  depends on, and this app's own `src/i18n-guard.test.ts` is ~30 lines calling its `scanApp` with
  this app's `srcDir`, `label` and `isExcluded` (`app/admin/**`, `components/admin/**`, the
  `admin-*-view.tsx` files those pages render, tests and `global-error.tsx` — its English fallback
  is by design). A caught string either gets a catalog key or an entry in this app's own
  `i18n-guard.allowlist.json` (empty today) with a reason — see `docs/guides/i18n.md` for what
  `scanApp` flags and `packages/i18n-guard/README.md` for the package itself.

## Environment

`src/lib/auth.ts`'s `getAuth()` builds this app's `createAuth(...)` on the first request.
`.env.example` lists the keys with their defaults:

| Key | Dev default |
|---|---|
| `API_URL` | `http://api.brand.localhost:3007` |
| `API_SERVICE_TOKEN` | the dev token from `@repo/api-contract` |
| `COOKIE_DOMAIN` | `.brand.localhost` |
| `AUTH_URL` | `http://auth.brand.localhost:3002` |
| `APP_URL` | `http://app.brand.localhost:3001` |

Outside production every key falls back to its default. In production `src/instrumentation.ts`
calls `assertAuthEnv()`, so `next start` fails at boot while any of them is missing or empty: Next
logs `Failed to prepare server … COOKIE_DOMAIN is not set` (or whichever key) and keeps listening,
answering every request — `/api/health` included — with 500, so the Docker health check reports
the container unhealthy.

## Testing

```bash
bun --filter @repo/auth test
```

`src/lib/actions.test.ts` runs the cores against a fake api: validation, redirect targets, the
api's declared errors, an unreachable api, identical states for known and unknown emails on
forgot-password, and when the prior session is ended (after a successful sign-in or sign-up, never
after a failed one). For magic-link it also checks that an implausible token never reaches the
api, that a `BAD_REQUEST` and an implausible token show the identical message, that an unrelated
api failure shows "unavailable" instead, and the end-old/set-new/redirect order on success.
`src/lib/oauth.test.ts` pins the provider round trip: a callback with no
cookie, a mismatched state or another provider never calls the api; cancel, success and the api's
error codes map to the right redirect (the account page when signed in, the login page with `next`
when not); a signed-in callback calls the api as the user; Apple's POST bounces to the GET with its
fields preserved; and `next` is validated before it is stored. `src/lib/two-factor.test.ts` covers the
code step: a missing or tampered cookie, a wrong code as a field error, a dead challenge's
redirect (with and without `next`), throttling and the session order on success.
`src/lib/email-change.test.ts` covers `cancelEmailChangeCore` and `revertEmailChangeCore`: an
implausible token never reaches the api, a `BAD_REQUEST` and an implausible token show the
identical invalid-link message, an unreachable api shows "unavailable", `clearSession()` runs on
success and its own failure never blocks the success state, and revert's `CONFLICT` passes the
api's message straight through; `src/lib/email-change-focus.test.ts` covers the two focus-on-mount
helpers in isolation (a missing heading is not an error, same shape as `apps/account`'s own).
`src/lib/i18n.test.ts` covers the Zod mapping (English and Swedish), the English constants against
the catalog, and provider error messages against `OAUTH_ERROR_MESSAGES` for every code, named and
unnamed; `src/lib/actions-sv.test.ts` and `src/lib/locale.test.ts` cover the Swedish action cores
and `localeReturnPath`. All are part of `bun run test:services`, the hard-coded-string guard
(`src/i18n-guard.test.ts`) included.

To try the reset flow by hand, run `bun dev`, request a reset at `/forgot-password`, and copy the
link from the api's log: with no mailer configured, `apps/api` writes each email there as one `mail`
line (the masked address in `to`, the `subject`, and the body in `text`, which holds
`http://auth.brand.localhost:3002/reset-password?token=…`).
The link is valid for an hour and works once.

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md), [CLAUDE.md](../../CLAUDE.md) and
[`packages/session/README.md`](../../packages/session/README.md) for the conventions shared by all
apps.
