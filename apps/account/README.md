# @repo/account

Account management — Next.js 16 on account.brand.localhost:3003 in development, `account.brand.com`
in production.

A My-Account-style settings hub with six sections, grouped under the `(account)` route group and
wired to `apps/api` through `@repo/session`. Every page sits behind the signed-in session that
`apps/auth` sets on `COOKIE_DOMAIN`: signed out, any of them redirects to
`AUTH_URL/login?next=<this page>`, and the sign-in brings the user back.

```bash
bun --filter @repo/account dev       # http://account.brand.localhost:3003
bun --filter @repo/account test      # the action cores, against a fake api (bun test)
bun --filter @repo/account build     # standalone output for docker/next.Dockerfile
bun --filter @repo/account analyze   # bundle report in .next/analyze/
```

## Routes

All six sections are real.

| Route | Status | What it does |
|---|---|---|
| `/` | Real | "Welcome, <name>" with the user's initials, and cards linking to the other sections |
| `/notifications` | Real | The signed-in person's own notification inbox — a sentence per row, unread marked, **Mark all as read**, per-row **Mark as read**, an **Unread only** filter and **Older**/**Newest** paging; see Notifications below |
| `/personal-info` | Real | **Profile photo** (`account.avatar.set` / `remove`; see Images below), **Name** form (`account.updateProfile`; an empty name is allowed, at most 100 characters), and the **Email address** card — the current address next to a **Verified** / **Unverified** badge, and a change-email form; see Email change below |
| `/email/confirm?token=` | Real | Confirms a pending email change from the mailed link; see Email change below |
| `/security` | Real | **Password** (change form when `user.hasPassword`, else a **set a password** form — see Sign-in methods below), **Two-step verification** (see below), **Passkeys** (add, rename, remove — see below), **Connected accounts** (connect/disconnect Google, GitHub and Apple) and **Your devices**: the user's live sessions from `account.sessions.list`, the current one marked "This device", a **Sign out** button on every other row (`sessions.revoke`) and **Sign out all other devices** (`sessions.revokeOthers`) |
| `/data-privacy` | Real | **Your data** (request and download a data export), **Cookies and analytics** (the consent choice, changeable here) and **Delete account** (schedule the account's deletion). See Data & privacy below |
| `/workspace` | Real | The current workspace (`requireWorkspace()`; none → `APP_URL/workspaces/new`). A member the workspace's required two-step verification blocks sees `TwoFactorRequiredNotice` instead — see Security (workspace) below. **Logo** (admins upload or remove it; others see it read-only — see Images below). **Workspace**: name (admins rename it), slug and the caller's role. **Security** (owner: a checkbox requiring two-step verification of every member; admin: read-only state and count; below admin: state only) — see Security (workspace) below. **Members** (`workspaces.members.list`; emails only for admins): a role select over `ASSIGNABLE_ROLES` for admins on non-owner rows (an owner's role always reads as text), a "No two-step" badge for admin and up, **Remove** for admins (an owner's row only for owners), **Leave** on the caller's own row. **Invitations** (admins): pending invitations with **Revoke**, and an email + role invite form. **API keys** (admins, on a plan with the `api` feature; an upsell on Free) — see API keys below. **Webhooks** (admins; Free lists endpoints with Recent deliveries and Delete only) — see Webhooks below. **Danger zone** (owners): **Transfer ownership** to a member who is not already an owner, and **Delete workspace** once its name is typed. See Workspace below |
| `/payments` | Real | **Payments & subscriptions** for the current workspace (`requireWorkspace()`, then a fresh `billing.get`); a member the workspace's required two-step verification blocks sees `TwoFactorRequiredNotice` instead — see Security (workspace) below: the **Plan** card and an owner's **Change plan** card. See Payments below |

Every page is behind the session (the layout guards them). Every page shows the shared site header (`SiteHeader`, with the sidebar trigger
below `md`) with the user's `UserMenu` — the avatar (initials without one), the workspace switcher with each workspace's logo (posting to `switchWorkspace` in
`src/app/actions.ts`; **Create a workspace** and **Invitations** link to `APP_URL/workspaces/new`,
**Manage members** to `/workspace`), **Account** and **Sign out** — and the shared `SiteFooter`;
when a superadmin is impersonating, the layout renders `ImpersonationBanner` above the header (from
`getAuth().getMe()`'s `impersonation`, with a **Stop impersonating** link to `${AUTH_URL}/admin/stop`)
and passes `UserMenu` a `note="(impersonating)"`.

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Guarding

`src/app/(account)/layout.tsx` calls `getAuth().requireUser()` before rendering the header, so the
whole route group redirects to sign-in without a live session. Each page calls `requireUser()`
again — a layout does not re-run on every client navigation, and the page is what needs the user —
and so does every server action: an action is a public endpoint of its own and must not rely on the
page that rendered its form.

## Actions

Each form posts to a server action next to its page (`src/app/(account)/<route>/actions.ts`). The
action checks the session, builds the deps (`(await auth.api()).account`, the api acting as the
signed-in user) and calls a core in `src/lib/actions.ts`, where the logic lives and is tested. On
success it revalidates the affected paths, so the header and lists re-render with the new data.

| Action | Core | Success message |
|---|---|---|
| `updateProfile` (`personal-info/actions.ts`) | `updateProfileCore` | "Name updated." |
| `setAvatar` (`personal-info/actions.ts`) | `setAvatarCore` | "Profile photo updated." |
| `removeAvatar` (`personal-info/actions.ts`) | `removeAvatarCore` | "Profile photo removed." |
| `changePassword` (`security/actions.ts`) | `changePasswordCore` | "Password changed. Other devices were signed out." |
| `revokeSession` (`security/actions.ts`) | `revokeSessionCore` | "Device signed out." |
| `revokeOtherSessions` (`security/actions.ts`) | `revokeOtherSessionsCore` | "All other devices were signed out." |
| `resendVerification` (`personal-info/verification-actions.ts`) | `resendVerificationCore` | "Sent — check your inbox." (or "Your email is already verified.") |
| `requestEmailChange` (`personal-info/actions.ts`) | `requestEmailChangeCore` | the masked new address and when the confirm link expires; no revalidate — nothing commits until confirm |
| `confirmEmailChange` (`email/confirm/actions.ts`) | `confirmEmailChangeCore` | the new address; revalidates the whole layout |
| `setPassword` (`security/actions.ts`) | `setPasswordCore` | "Password set. You can now sign in with it." |
| `disconnectIdentity` (`security/actions.ts`) | `disconnectIdentityCore` | "`<Provider>` disconnected." |
| `setupTwoFactor` (`security/actions.ts`) | `setupTwoFactorCore` | the QR and the key |
| `enableTwoFactor` (`security/actions.ts`) | `enableTwoFactorCore` | the ten recovery codes, once |
| `regenerateRecoveryCodes` (`security/actions.ts`) | `regenerateRecoveryCodesCore` | ten new recovery codes, once |
| `disableTwoFactor` (`security/actions.ts`) | `disableTwoFactorCore` | "Two-step verification is off." |
| `requestExport` (`data-privacy/actions.ts`) | `requestExportCore` | "Preparing your export…" (or the api's "You can request a new export later." inside `EXPORT_REQUEST_INTERVAL_MS`) |
| `setConsent` (`data-privacy/actions.ts`) | `setConsentCore` | "Saved" — writes the `consent` cookie the banner writes and revalidates the layout |
| `deleteAccount` (`data-privacy/actions.ts`) | `deleteAccountCore` | schedules the deletion (typed email must match), ends every session, redirects to `AUTH_URL/login?deleted=1` |
| `cancelDeletion` (`src/app/actions.ts`) | `cancelDeletionCore` | the deletion banner's **Cancel deletion**; re-renders the layout without it |
| `renameWorkspace` (`workspace/actions.ts`) | `renameWorkspaceCore` | "Workspace renamed." |
| `setLogo` (`workspace/actions.ts`) | `setLogoCore` | "Logo updated." |
| `removeLogo` (`workspace/actions.ts`) | `removeLogoCore` | "Logo removed." |
| `invite` (`workspace/actions.ts`) | `inviteCore` | "Invitation sent to `<email>`." |
| `revokeInvitation` (`workspace/actions.ts`) | `revokeInvitationCore` | "Invitation revoked." |
| `setRole` (`workspace/actions.ts`) | `setRoleCore` | "Role updated." |
| `removeMember` (`workspace/actions.ts`) | `removeMemberCore` | "Member removed." |
| `transferOwnership` (`workspace/actions.ts`) | `transferOwnershipCore` | "Ownership transferred." |
| `leave` (`workspace/actions.ts`) | `leaveCore` | clears the workspace cookie, redirects to `APP_URL/workspaces/new` |
| `deleteWorkspace` (`workspace/actions.ts`) | `deleteWorkspaceCore` | clears the workspace cookie, redirects to `APP_URL/workspaces/new` |
| `startCheckout` (`payments/actions.ts`) | `startCheckoutCore` | redirects to the provider's checkout URL |
| `openPortal` (`payments/actions.ts`) | `openPortalCore` | redirects to the billing portal URL |
| `changeMockPlan` (`payments/actions.ts`) | `changeMockPlanCore` | "You're on `<Plan>`." (or "Subscription cancelled.") |
| `signOut` (`src/app/actions.ts`) | — | `auth.signOut` as the user (skipped without a session cookie), `clearSession()` whatever the api answered, redirect to `AUTH_URL/login?signedout=1` |

The cores validate `FormData` with the contract's Zod schemas before any api call
(`UpdateProfileSchema`, `ChangePasswordSchema`, `SessionIdSchema`; "Passwords do not match" is
checked first, in the core), show the api's declared errors inline (a wrong current password under
its field, a foreign or unknown session id as "Session not found"), and turn anything else into
"The account service is unavailable right now." (logged). Passwords are never handed back to the
form. Results render through `FormMessage` / `FieldError` from `@repo/ui/components/form-feedback`,
the same helpers `apps/auth` uses.

## Notifications

`/notifications` (second in the sidebar, after Home) is the signed-in person's own in-app
notification inbox (Phase 13 A — the things that happened *to* them, never another member's).
`src/lib/notifications.ts` holds the page's logic: `notificationsParams` reads `?unread=1`,
`?cursor=…` and `?error=open` from the URL (a malformed cursor is dropped, not passed on);
`notificationSentence(item, t)` turns each `Notification` into one translated sentence from its
own `data` (a workspace name, a role, a plan, an endpoint's host — never an email, since none is
ever stored); `notificationTarget(item, context)` decides where a row links: this app's own page
(`/workspace`, `/payments`, `/security`, `/data-privacy`), `${APP_URL}/workspaces/new` for an
invitation (the notification carries no token — the onboarding page lists and accepts pending
ones), nothing for `member.removed`, or — when the row's workspace is not the current one — a
`switchTo` form button that switches first (`openInWorkspace`, like `switchWorkspace`) rather than
a plain link; a row whose `workspaceId` came back `null` (the user has since left that workspace)
links nowhere. `markReadCore` backs both **Mark all as read** and a row's **Mark as read**: it
calls `notifications.markRead`, shows "Not available while impersonating" on that refusal, and
otherwise succeeds silently — the list and the header's bell both re-render through the action's
`refresh()` from `next/cache`. A refused **Open** (the workspace switch failed) redirects to
`/notifications?error=open#notifications-heading`, shown as a `role="alert"` at the top of the
card. After a per-row mark re-renders that row as read, focus that would otherwise fall to `<body>`
moves to the heading instead (`focusHeadingIfLost` in `src/lib/notifications-focus.ts`). The whole
page works with no JavaScript. See **Notifications** in `apps/api/README.md` for the data model,
emitters and retention, and `packages/ui/src/blocks/README.md` for the header's bell.

**Email section (Phase 13 B).** Below the inbox, a second `SettingsCard` titled "Email" lets the
person choose which optional notification types also reach them by email —
`member.role_changed`, `member.removed` and `plan.changed`, each on by default — while the four
locked types (`invitation.received`, `workspace.two_factor_required`, `export.ready`,
`webhook.disabled`) are listed read-only underneath, "Always emailed — needed to keep your
account and workspaces working.". `NotificationEmailForm` (`src/components/
notification-email-form.tsx`, "use client" for `useActionState` feedback) renders one checkbox
per optional type and works with no JavaScript: every type is also posted as a hidden `type`
field, and a hidden `wasEmail` field for whichever were on when the page rendered, so a missing
checkbox always reads as off and `setNotificationEmailCore`
(`src/lib/notifications.ts`) sends only `account.notificationPreferences.set` calls for the types
that actually changed. The fieldset's sr-only legend names the choice ("Also send me an
email"), not the card's title. **Save email settings** shows "Email settings saved."; the action
calls `refresh()` whatever the outcome, since React 19 resets the form to its render-time
defaults and only a fresh render shows what a failed or partial save left on the server.
Impersonating disables the fieldset and swaps the button for the page's existing impersonation
note. An unverified address — mailed none of these — sees "Verify your email address to get
these emails." with a link to Personal info's resend.
`readNotificationPreferences` wraps `account.notificationPreferences.get()` in a try/catch like
`readNotifications` does for the inbox, showing "Your email settings couldn't be loaded. Try
again shortly." in its place rather than throwing. See `apps/api/README.md`'s **Notification
preferences** section, `apps/auth/README.md`'s **Notification unsubscribe** section (the mailed
link's one-click and confirm pages) and `docs/guides/notification-preferences.md`.

## Email verification

`src/components/verify-email-notice.tsx` (`<VerifyEmailNotice user />`) renders an amber notice —
one sentence naming the address plus a **Resend verification email** button — while
`user.emailVerified` is false, and nothing once it is true. It shows on `/` above the overview cards
and on `/personal-info` below the Contact info card, next to a **Verified** / **Unverified**
`Badge` (`@repo/ui/components/badge`) beside the email. The button posts to
`resendVerification` (`personal-info/verification-actions.ts`), which calls
`account.resendVerification()` as the signed-in user; the api rate-limits it to 3 sends per 15
minutes per user and the notice surfaces that error's message ("Too many requests, try again in a
few minutes") through `FormMessage` unchanged.

## Email change

The **Email address** card on `/personal-info` (`src/components/email-change-card.tsx`, replacing
the old read-only "Contact info" card) shows the current address, its **Verified** / **Unverified**
badge, and one persistent form: a new address, the current password (only when `hasPassword`) and a
two-step code (only when `twoFactorEnabled`) — submitting calls `requestEmailChange` →
`requestEmailChangeCore`, which follows `setupTwoFactorCore`'s exact shape (field errors on a
malformed address, the current-password field or the code field by `(code, data.reason)`; a stale
session renders `ReauthNotice` in place of `FormMessage`). A pending change — from the action's own
result, or carried over from the page's `account.email.get()` prop when the form hasn't been
submitted this visit — shows in an always-mounted `role="status" aria-live="polite"` paragraph
(`Check n***@example.com — the link expires at …`) and relabels the button **Send again**; nothing
in the form resets after a submit, so resubmitting with the same typed values genuinely resends.
Read-only while impersonating, like every other write-capable card.

`/email/confirm?token=` (`src/app/(account)/email/confirm/`) is where the mailed confirm link
lands: `requireUser()` with no explicit `next` (its default is the request's own URL, token
included, so a signed-out visitor returns to this exact link after signing in). `EmailConfirmForm`
never submits on load — only its **Confirm new email** button calls `confirmEmailChange` →
`confirmEmailChangeCore` — and a refusal (wrong account, an invalid/expired/used or now-taken
token, impersonating) shows the api's own message in place. On success the form is replaced by the
new address and a **Back to Personal info** link, the whole layout revalidates (the header picks
up the new address), and focus moves to the success heading (`focusEmailConfirmHeading` in
`src/lib/email-confirm.ts`) so a screen reader announces the change.

Cancelling a pending change, or undoing a confirmed one from the old mailbox, both happen on
`apps/auth` — see its README's **Email change** section — since the links in those two mails are
meant for whoever holds the old mailbox, not necessarily this browser.

## Sign-in methods

`/security` also covers how the account signs in, driven by `User.hasPassword` and
`account.identities.list()`:

- **Password** — a signed-in account that signed up through a provider or a magic link has no
  password yet (`hasPassword: false`). The Password card then shows `SetPasswordForm` (password +
  confirm, `SetPasswordSchema`) instead of the change-password form. Its action,
  `setPassword` → `setPasswordCore`, mirrors `changePasswordCore`'s mismatch-first check
  ("Passwords do not match" on `confirm`) but calls `account.setPassword`, never echoes the
  password back, and on success revalidates `/security` **and** `/` (`layout`) so the layout's
  cached user picks up `hasPassword: true` and the Password card switches forms without a
  reload. A `CONFLICT` (password already set, e.g. a second tab) surfaces the api's message. The
  api wants a recent sign-in for this, as for two-step setup (there is no password to re-check): a
  session older than `REAUTH_WINDOW_MS` is refused (`FORBIDDEN`, `data.reason: "reauth"`), and the
  form shows the message with the same **Go to sign-in** link (`ReauthNotice`, `reauthHref` built
  once in `security/actions.ts`).
- **Connected accounts** — `ConnectedAccounts` lists every provider `auth.providers()` reports
  configured (`PROVIDER_LABELS` in `lib/actions.ts`: Google, GitHub, Apple), matched against
  `account.identities.list()`. A connected row shows the linked email (or "connected") and when it
  was linked, with a **Disconnect** button (`disconnectIdentity` → `disconnectIdentityCore`,
  validated against `ProviderIdSchema` before any api call); an unconnected row is a **Connect**
  link straight to `${AUTH_URL}/oauth/<provider>/start?next=<this page, URL-encoded>` — the same
  `/oauth` flow `apps/auth` uses, which redirects back here once linked. Connecting needs a recent
  sign-in (`REAUTH_WINDOW_MS`, as for two-step setup and setting a password): on an older session
  `apps/auth` sends the browser to `${AUTH_URL}/login?reauth=1&next=<this page>` instead of the
  provider (its own notice, "Sign in again to continue."), and once signed in again **Connect** works.
  It comes back here on a failure too, with `?error=<code>&provider=<id>`, which the card renders as an alert
  (`connectErrorMessage`, over the shared `@repo/ui/lib/oauth-errors` copy the login page also
  uses; `error=suspended` is this app's own special case, outside that shared map, for the narrow
  race where a browser still holds a stale session cookie for an account suspended since it was
  issued; the next Disconnect result replaces it). The api allows one identity per provider: a
  second Google account is refused (`claimed`) until the first is disconnected. Disconnecting the
  account's only sign-in method (no password, no passkey and exactly one identity — the button's
  `onlySignIn` check, fed `hasPasskeys` by the Security view, since a passkey is a way in too) is
  disabled with a visible hint ("This is your only way to sign in — set a password or add a passkey
  first") rather than left to fail server round-trip; the api enforces the same rule (`FORBIDDEN`)
  as defense in depth. No configured
  providers renders "No sign-in providers are configured." instead of an empty list.

## Two-step verification

The **Two-step verification** card on `/security` (`src/components/two-factor-card.tsx`, status from
`account.twoFactor.get`) turns on authenticator-app codes for every way the account signs in; the
code step itself is `apps/auth`'s `/login/verify`. Server-rendered, and every form works without
JavaScript.

- **Unverified email** — no **Turn on**: "Verify your email first", pointing at Personal info's
  resend link. The api refuses `setup` and `enable` for an unverified email (`403` "Verify your
  email to turn on two-step verification"), since whoever proves the mailbox takes such an
  account over; a 2FA that is already on still shows the **On** controls.
- **Off** — the api re-checks who is asking before it mints a secret, so **Turn on** first asks for
  the current password (`hasPassword`: the field is always in the form, so setup works without
  JavaScript too) on an account that has one, calling `account.twoFactor.setup` with it. A wrong or
  missing password comes back as a field error on that input (`data.reason: "password"`); on a
  passwordless account there is nothing to re-verify a password against, so the check is instead
  the current session's age — past `REAUTH_WINDOW_MS` (10 minutes) it is refused
  (`data.reason: "reauth"`) with a notice carrying a `reauthHref` the card renders (`ReauthNotice`)
  as the message plus a **Go to sign-in** link to `apps/auth`'s sign-in form
  (`?reauth=1&next=<account>/security`).
  Once `setup` succeeds, the card shows the QR, rendered on this server as an inline SVG from the
  `otpauth://` URL with `uqr` (the secret never goes to a third-party QR service), and the key in
  groups of four for typing by hand. A **Code** from the app and **Turn on** confirm it
  (`account.twoFactor.enable`). Reloading restarts setup (and its password/reauth check): nothing is
  on until a code confirms it, and without JavaScript a wrong code comes back to **Turn on** with
  "… Start setup again.", since the secret is not readable afterwards.
- **Recovery codes** — ten `xxxxx-xxxxx` codes, shown once under "Your recovery codes", with
  **Copy**, **Download .txt** (a `data:` link, no script) and **Done**. Each signs in once in place
  of a code.
- **On** — "Two-step verification is on." and how many recovery codes are left (red, "regenerate
  soon", at 3 or fewer). **Regenerate recovery codes** and **Turn off** each ask for a current code;
  turning off also accepts a recovery code. Turning it on or off ends no session.
- **Impersonating** — read-only: the status and "Not available while impersonating." (once, in
  the card body); the api refuses all four writes for an impersonation session anyway, and
  declares that `FORBIDDEN` on each, so the cores show its message as they do any other.

All four `useActionState` hooks live in `TwoFactorCard` itself, and `resolveTwoFactorView`
(`src/lib/two-factor-view.ts`, tested in `two-factor-view.test.ts`) picks the branch, a successful
enable or regenerate first: each of those results flips `enabled` in the same update that carries
it, and choosing by `enabled` first would unmount the branch holding the codes before they show.
With JavaScript every hook keeps its last result, so the card also tracks which action answered
last and `resolveTwoFactorView` shows that one (a setup refused after a turn-off shows the refusal,
not the old "is off"). A wrong code is a field error ("That code didn't work. Check your
authenticator app and try again.", matched by message — an expired session's `UNAUTHORIZED` "Sign
in required" is a form message instead); a lost phone with no recovery codes left needs a superadmin's reset in `apps/auth`'s
`/admin`.

- **Workspace requirement.** Turning two-step off when the account has no passkey, and at least
  one of its workspaces requires two-step verification (or a passkey), shows a warning above
  **Turn off** naming those workspaces — the turn-off is still allowed; see Security (workspace)
  below.

## Passkeys

The **Passkeys** card on `/security` (`src/components/passkeys-card.tsx`, backed by
`account.passkeys.list/registerOptions/register/rename/delete`) sits between **Two-step
verification** and **Connected accounts**: "Sign in without a password, using your device's
fingerprint, face or screen lock." A passkey signs in on its own — it counts as both factors, so
it skips the two-step code step even on an account that has two-step verification on (see
`apps/api/README.md`'s **Passkeys** section).

- **The list.** Each row shows the passkey's name (inline-renamable — a text input defaulting to
  the current name, with its own **Save**), when it was added and, if ever, last used
  (`"Added {date} · Last used {date}"` or `"… · Never used"`), and **Remove**. Every row is a
  plain `useActionState` form, so rename and remove both work without JavaScript. No passkeys yet
  shows "You don't have any passkeys yet." instead of a list.
- **Remove confirmation.** A first click on **Remove** arms that row — the button turns
  destructive and relabels **Confirm removal**, with a **Cancel** beside it; a second click
  submits. Arming is announced through a polite, visually hidden status naming the passkey;
  **Cancel** or Escape disarms and puts focus back on that row's **Remove**, and any answer to a
  removal (a refusal included — the last-way-in conflict, or a passkey already gone) disarms the
  row. Without JavaScript this guard never runs, so the plain button removes on the first
  click, the same no-confirmation behaviour **Sign out** already has on a device row. A
  **successful** removal moves focus to the card's own title (`SettingsCard`'s `titleId`, which
  gives the title `id` + `tabIndex={-1}` — focusable from script, never a tab stop) rather than
  leaving it on the now-removed row's button; a refusal leaves focus exactly where it was.
- **The cap.** An account may hold at most `MAX_PASSKEYS` (10) passkeys. At the cap the **Add a
  passkey** section is replaced by a sentence saying so (`account.passkeys.limitReached`, en and
  sv, interpolating the number); one passkey below the cap, the form is back. A request past the
  cap from `registerOptions` or `register` (a stale page, or two tabs racing each other) surfaces
  the api's own `CONFLICT` `PASSKEY_LIMIT_MESSAGE` the same way the last-way-in conflict does,
  below.
- **Add a passkey.** `AddPasskeyForm` needs JavaScript, since the browser ceremony between
  `registerOptions` and `register` has no single-RPC server action to post to. Before hydration it
  renders the same form as an invisible, `aria-hidden`, `inert` placeholder of identical size —
  `apps/auth`'s `PasskeySignIn` placeholder — so the cards below never shift when the real form
  takes its place; the placeholder carries `[@media(scripting:none)]:hidden`, so without
  JavaScript the section is absent with no gap and no dead control. Once hydrated it shows at
  once, and collapses only if a mount effect finds no `window.PublicKeyCredential`. It asks for the current password (an account that has
  one) or, on a passwordless account, needs a session under `REAUTH_WINDOW_MS` — exactly the same
  re-check **Turn on** uses for two-step setup, with the same `ReauthNotice` and **Go to sign-in**
  link on a stale session. A blank **Name** field gets a server-chosen default ("This device" for
  a platform/hybrid passkey, "Security key" otherwise).
- **Errors.** A cancelled or dismissed browser prompt shows a neutral status message, never a
  destructive alert — the same distinction `apps/auth`'s sign-in button makes. A device that
  already holds a passkey for the account (`InvalidStateError`, from the options'
  `excludeCredentials`) says so — "This device already has a passkey for your account." — rather
  than "try again", which could never succeed there; a server action that rejects outright (a
  dropped connection, deploy skew) shows the translated failure message. Any other failure
  (including the api's own `PASSKEY_LAST_WAY_IN_MESSAGE` conflict — a passwordless,
  provider-less account trying to delete its only passkey — and `PASSKEY_LIMIT_MESSAGE` at the
  cap) shows in place.
- **Impersonating.** Read-only: every row (name, dates, rename input, remove button) stays
  visible but disabled, and the **Add a passkey** section is replaced by "Not available while
  impersonating."
- **Workspace requirement.** Removing the account's only remaining passkey when two-step
  verification is off, and at least one of its workspaces requires two-step verification (or a
  passkey), shows a warning above every **Remove** naming those workspaces — removal is still
  allowed; see Security (workspace) below.

## Images

The **Profile photo** card (Personal info) and the **Logo** card (Workspace) are one component,
`src/components/image-upload-card.tsx`: the current image — or the initials (`initialsOf` from
`@repo/ui/lib/initials`) — a file input (`accept` `IMAGE_ACCEPT`: PNG, JPEG, WebP), **Upload**, and
**Remove** while there is an image. Both forms are plain `<form action>` posts
(`multipart/form-data`), so they work without JavaScript; once hydrated, a chosen file previews
locally (an object URL, revoked when replaced) and a file over 2 MB is refused in the browser with
`IMAGE_UPLOAD_MESSAGE` before anything is sent. `src/lib/image-upload-view.ts` decides what the card
shows (a preview wins over the stored URL; **Remove** follows the stored URL only), and the remove
message renders even once the image is gone. The image is a plain `<img>` under
`useImageFallback` (`@repo/ui/components/image-fallback`), so a stale URL falls back to the
initials, even when its 404 lands before hydration. Below admin the Logo card shows the image and
"Only admins can change the logo." instead of the forms.

The cores (`setAvatarCore` / `removeAvatarCore` in `src/lib/actions.ts`, `setLogoCore` /
`removeLogoCore` in `src/lib/workspace-actions.ts`) run `checkImageFile` first — no file is "Choose
an image.", one over `MAX_IMAGE_BYTES` is `IMAGE_UPLOAD_MESSAGE`, both field errors, no api call —
then pass the `File` to the api, which decides the type by its bytes, strips metadata and stores it
(see `apps/api/README.md` **Storage**). The api's `BAD_REQUEST` (`IMAGE_UPLOAD_MESSAGE`) is a field
error under the input; "Too many uploads, try again later" (the two `set` cores) is a form message,
and so are `FORBIDDEN` and `NOT_FOUND` in the logo cores only (a non-admin, a workspace that is gone;
the avatar cores have neither to pass through). The logo actions also refuse a form rendered for another workspace (`sameWorkspace`), like
every Workspace action. All four revalidate the layout, so the header's avatar and the switcher's
logo update with the page.

`next.config.mjs` sets `experimental.serverActions.bodySizeLimit: "10mb"`. Next's default 1 MB would
refuse a 1.5 MB photo before the action ran; 10 MB rather than just above 2 MB is deliberate, so an
oversized photo still reaches `checkImageFile` and gets the form's message instead of Next's error
page. The api never receives more than 2 MB from this app.

Images are served by `src/app/files/[...key]/route.ts`, two lines over `createFileRoute()` from
`@repo/session/files` (see `packages/session/README.md`): `/files/<key>` on this app's own origin,
with long-lived caching and locked-down headers.

## Data & privacy

`/data-privacy` (`src/views/data-privacy-view.tsx`, the forms in `src/components/privacy-forms.tsx`)
has three cards. See `apps/api/README.md`'s **Privacy** section for the export's contents and the
purge itself.

- **Your data** (`ExportForm`) shows the latest `account.export.get()` row: nothing yet, "Preparing
  your export…" while `pending`, a **Download** link (`/data-privacy/export?id=<id>`) and "Available
  until `<date>`" while `ready`, or "Expired" (also for a request still `pending` a day later,
  whose job died — the api reports it as `expired`). **Request an export** (hidden while one is
  `pending`)
  posts to `requestExport`; the api refuses a second request inside `EXPORT_REQUEST_INTERVAL_MS` (24
  hours) with its own "You can request a new export later." message, surfaced as is. The export
  itself is built by the api's `privacy.export` job, so the page only polls (a reload) rather than
  waiting on it.
- **`/data-privacy/export`** (`src/app/(account)/data-privacy/export/route.ts`, over
  `exportDownloadResponse` in `src/lib/export-download.ts`) streams the ready file as the signed-in
  user, `Content-Disposition: attachment` so the browser saves it rather than opening it inline;
  `404` for a signed-out visitor, someone else's id, or an export that is not (or no longer) `ready`,
  `502` when the api cannot be asked.
- **Cookies and analytics** (`ConsentForm`) is the same `all` / `necessary` choice as the cookie
  banner, changeable here without re-showing it; `setConsent` writes the `consent` cookie exactly as
  `CookieConsent` does (same `consentCookie()` helper, `COOKIE_DOMAIN`, `Secure` when the request
  arrived over https) and revalidates the whole layout, since the banner reads the same cookie.
- **Delete account** (`DeleteAccountForm`) schedules the deletion once the typed email matches the
  account's own (case-insensitively); its help text warns that workspaces where the user is the
  only member are deleted too, their paid plans cancelled. A mismatch is a field error, and a session older than the
  re-authentication window gets the same **Go to sign-in** notice as setting a password or two-step
  setup (`ReauthNotice`, `reauthHref` built in `data-privacy/actions.ts`). A sole owner of a
  workspace with other members is refused (`CONFLICT`, the api names the workspaces) rather than
  silently orphaning one. On success the action ends this browser's session (the api already ended
  every one of the account's) and redirects to `${AUTH_URL}/login?deleted=1`, whose notice says
  "Your account is scheduled for deletion. Sign in to cancel." — signing in during the 7-day grace
  period is how it is cancelled. A second `account.delete` call while one is already scheduled is a
  no-op: the same date comes back, with no new mail and no second sign-out.
- **The deletion banner.** While `me.user.deletionScheduledAt` is set, the `(account)` layout (and
  `apps/app`'s layout) renders `@repo/ui`'s `DeletionBanner` above the header — the red bar with the
  scheduled date and a **Cancel deletion** button, a plain form posting to `cancelDeletion` in
  `src/app/actions.ts` (core `cancelDeletionCore`), which calls `account.cancelDeletion()` and
  revalidates the layout so the banner disappears at once. A refusal (impersonating) or an outage is
  logged and leaves the banner up.
- **Deleted authors.** Once a user is purged, `apps/app`'s notes they wrote keep their text and
  workspace (`Note.authorId` turns `null`), rendered there as "Deleted user" — nothing here shows a
  deleted account's data, since the row itself is gone.

## Workspace

`/workspace` manages the workspace the user is in now — the one the header's workspace switcher
shows. The page and every action call `requireWorkspace()`, so the workspace acted on is always the
one the server resolved from the `workspace` cookie, never an id from the form; the cores in
`src/lib/workspace-actions.ts` take `{ api, workspaceId }` and read only the target (member id,
invitation id, role, email) from the form, validated with the contract's schemas
(`UpdateWorkspaceSchema`, `CreateInvitationSchema`, `SetRoleSchema`, `MemberTargetSchema`,
`InvitationIdSchema`) before any api call.

The controls follow the api's role rules, which still decide: an admin sees no controls on an
owner's row (`FORBIDDEN` "Requires the owner role" otherwise), nobody can *set* the owner role
(only **Transfer ownership** makes an owner, and the previous owner becomes an admin), and the last
owner's **Leave** is rendered anyway — the api refuses it with "Transfer ownership before leaving.",
shown as is. "Already a member" and "Too many invitations, try again in an hour" pass through the
same way. Once the page has hydrated, **Delete workspace** stays disabled until the typed name
matches; the server HTML renders it enabled, so the form still works without JavaScript, and
`deleteWorkspaceCore` compares the typed value with the name `requireWorkspace()` returned
("Type the workspace name to confirm" on mismatch). After a successful **Leave** or delete the
action clears the workspace cookie (`clearCurrentWorkspace()`) and redirects to
`APP_URL/workspaces/new`. Rename, role changes and transfer also revalidate the layout, so the
switcher shows the new name or role.

Every form is a plain `<form action>` with native `<select>`s (`NativeSelect`), so it works without
JavaScript.

## Security (workspace)

A card on `/workspace`, directly above API keys: whether the workspace requires every member to
have two-step verification (or a passkey) before they can open it — owner only, every plan (a
security baseline, not an upsell; see CLAUDE.md's **Required two-step.** paragraph and
`apps/api/README.md`'s **Required two-step verification** section for the api side; this section
is the card).

- **`WorkspaceSecurityCard`** (`src/components/workspace-security-card.tsx`).
  - **Owner:** a checkbox and **Save security setting**. Unchecking applies at once
    (`setWorkspaceSecurityCore` in `src/lib/workspace-actions.ts` calls `security.set(false)`
    directly); checking it is a two-click, no-JavaScript confirmation — the first submission
    (`stage=save`) only reads `security.get` for how many members it would block and renders that
    sentence, never applying anything, and the confirmation's own form (`stage=confirm`) applies
    it, beside a separate **Keep it off** form (`stage=cancel`) — named apart from the API
    keys/webhooks rows' own armed **Cancel**, since all three can be on screen on the same page at
    once. An owner without two-step verification is refused by the api (`FORBIDDEN`
    `data.reason: "owner_two_factor"`); the card shows that refusal with a **Set up two-step
    verification** link to `/security`.
  - **Admin:** the state and the count (`membersWithoutTwoFactor`, read only for admin and up),
    read-only, with "Only the owner can change this."
  - **Below admin:** the state only — `security.get` is never called for them, since the api
    refuses it.
  - **Impersonating owner:** read-only, with the impersonation note.
- **Members list.** An outline "No two-step" badge next to a member's row, shown only when
  `member.twoFactor === false` (`twoFactor` is `null` below admin — the api never tells a viewer or
  member, the same rule as email — so the badge never renders for them either).
- **Security page warning.** `requirementWarnings({ twoFactorEnabled, passkeyCount, workspaces })`
  (`src/lib/two-factor-requirement.ts`) computes, server-side, which of the account's workspaces
  require two-step verification and would therefore block the account if it turned two-step off
  (with no passkey) or removed its last passkey (with two-step off); the Security page shows that
  warning above the relevant action, naming the workspaces — the action itself stays allowed, the
  api never refuses it, this is only a heads-up.

## Invitation domains

A section in the Security card, below the two-step requirement: the workspace's own allowed
invitation domains — owner only, every plan (see CLAUDE.md's **Invitation domains.** paragraph and
`apps/api/README.md`'s **Invitation domains** section for the full behaviour; this is the card).

- **`src/lib/invite-domains.ts`** (server only — `node:url`'s `domainToUnicode` exists on the
  server alone, so the view converts and formats before handing props to any component):
  `conjunction(format)` wraps next-intl's `format.list(…, { type: "conjunction" })` as a
  `FormatList`; `displayDomain`/`displayDomains` convert a stored A-label domain to its Unicode form
  for reading (falling back to the stored value when the converter cannot read it);
  `outsideInvitationIds(domains, invitations)` names, over `inviteDomainAllowed`, the pending
  invitations whose address the current list no longer admits.
- **`InviteDomainsForm`** (`src/components/invite-domains-form.tsx`): a plain `<form>`, so it works
  without JavaScript — a textarea (`#invite-domains`, label "Allowed invitation domains", hint
  "Leave empty to allow any address.") and **Save invitation domains**. `setInviteDomainsCore`
  (`src/lib/workspace-actions.ts`) splits the textarea on CR/LF, sends every non-blank line as
  typed, and maps the api's returned invalid indexes back to textarea line numbers (blank lines
  counted) for a per-line "Line N: not a valid domain." error; input beyond the api's own bounds
  (over 100 lines, or a line over 1000 characters) is judged locally with the very same
  `normalizeInviteDomains` the api uses, without a round trip. Success: "Invitations are now
  limited to: …" or "Invitations are open to any address."
- **`workspace-view.tsx`.** The owner (not impersonating) gets the form; an admin, or an owner
  while impersonating, gets a read-only `<h3>Invitation domains</h3>` plus the list (Unicode,
  list-formatted) or "Any address.", then the two-step section's own note — "Only the owner can
  change this.", or "Not available while impersonating." for an impersonating owner; below admin,
  nothing. The list, the invite hint and both forms' messages wrap a long domain
  (`wrap-anywhere`) rather than letting the card clip it at 320 px.
- **Invite form.** A hint under the email field (`#invite-email-hint`, tied to it through
  `aria-describedby`), "Invitations are limited to: …", shown only when the list is non-empty. A
  refused invite (the api's own `inviteDomainRestricted` message) shows through the existing
  `FormMessage` path.
- **Pending invitations list.** An outline `Badge`, "Outside allowed domains", on a pending
  invitation whose address no longer matches the current list.
- **Activity.** `workspace.invite_domains_changed` gets its own sentence (added/removed domains,
  list-formatted) and its own filter option, "Invitation domain changes" (named apart from this
  section's own heading) — see **Activity** below.
- **i18n.** `account.inviteDomains.*`, `account.invite.limitedTo`, `account.invitations.outside`
  and `account.activity.actions/filters.inviteDomainsChanged`, en and sv, covered by the i18n guard.

## API keys

A card on `/workspace`, below Invitations: workspace API keys for connecting outside tools and
scripts, without sharing anyone's sign-in (see CLAUDE.md's **API keys and /v1.** paragraph,
`apps/api/README.md` and `docs/guides/api-keys.md` for how the keys and `/v1` itself work; this
section is the card).

- **Gating** (`src/lib/api-keys.ts`'s `apiKeysGate(role, entitlements)`, the one function both
  `page.tsx`'s fetch and `workspace-view.tsx`'s render call, so the two can never disagree): below
  admin, a one-line note that admins manage keys; an admin on a paid plan, the card itself; an
  admin on Free, an upsell paragraph with a link to `/payments` in place of the create form. Only
  creating needs the `api` feature: `page.tsx` fetches `workspaces.apiKeys.list` for every admin
  (`listsApiKeys`), so a workspace that dropped to Free still lists the keys it made, each with
  **Revoke**, under "These keys don't work until the workspace is on Pro or Team again. You can
  still revoke them." — a downgrade pauses keys (the api answers `401`), re-upgrading resumes them,
  and a key you no longer trust can be retired before that. With no keys, Free shows the upsell
  alone.
- **The list** (`src/components/api-keys-card.tsx`): name, the display prefix
  (`bb_live_<prefix>_…`, in the `account.apiKeys.keyPrefix` catalog entry rather than hard-coded,
  since it is real user-facing text the i18n guard would otherwise flag), scopes joined with ", ",
  status (**Active** / **Expired** / **Revoked**), and one line: `Created <date> by <creator or
  "Former member"> · Last used <date or "Never"> · Expires <date or "Never">`.
- **Create** — Name (1–60 chars; labelled "Key name", since the workspace-rename field above is
  already labelled "Name"), a `<fieldset>` of four scope checkboxes (none checked by default),
  and an Expires `<select>` (30 / 90 / 365 days, default 90, or "No expiry" — a pure-CSS warning
  under the select, `group-has-[option[value=none]:checked]:block`, shows with no JavaScript when
  "No expiry" is picked). Submitting replaces the form with a show-once panel: the full key in a
  read-only input labelled "API key", a **Copy** button, "Copy this key now. You won't see it
  again.", and **Done**. Done is a plain link to `/workspace`: without JavaScript that GET discards
  the form's POST result and the key with it (and, unlike a reload, never re-submits the form);
  hydrated, it cancels the navigation and remounts the create section (`dismissCreatedKey`), which
  drops the key from React state, then moves focus to the card's title. The key is never written to
  a cookie, the URL, or anywhere a later `revalidatePath` would re-fetch it. `expiresInDays` is
  converted from the select's string value to `number | null` *before* validation, so a tampered
  value is a field error, never a bad call to the api.
- **Revoke** — the same two-click arm/confirm/Escape-to-cancel pattern as the Passkeys card's
  **Remove**; only rendered for an `active` key. The row's form carries both `id` and
  `workspaceId` as hidden inputs (every sibling row-form on this page — Members, Invitations, the
  danger zone — does the same, since `revokeApiKey`'s `sameWorkspace` check needs it). A
  successful revoke unmounts the row's form, so focus moves to the card's title
  (`focusApiKeysHeadingAfterRevoke`, as the Passkeys card does after a removal); a refusal leaves
  it on the row's button.
- **Impersonation.** The list stays visible, read-only (every control disabled); the create form
  is replaced by "Not available while impersonating." — matching the api's own refusal.
- **i18n.** A dedicated `account.apiKeys` namespace plus six `account.workspace` keys
  (`apiKeys`, `apiKeysDescription`, `apiKeysMembersNote`, `apiKeysUpsell`, `apiKeysUpsellPlans`,
  `apiKeysPaused`),
  en and sv, covered by the i18n guard like every other string on this page.

## Webhooks

A card on `/workspace`, directly below API keys, gated the same way: workspace admins and owners
push their own events to URLs they choose (see CLAUDE.md's **Webhooks** paragraph,
`apps/api/README.md`'s **Webhooks** section and `docs/guides/webhooks.md` for how deliveries, the
SSRF guard and auto-disable work; this section is the card).

- **Gating** (`src/lib/webhooks.ts`'s `webhooksGate(role, entitlements)`, mirroring
  `apiKeysGate`): below admin, a read-only note, no list, no upsell. Admin/owner on Free: the list
  with **Recent deliveries** and **Delete** only, plus an upsell link to `/payments` in place of
  **Add endpoint** — and, per existing endpoint, an **Edit** disclosure, **Rotate secret** and
  **Send test event** are not rendered at all (never merely disabled), replaced by one line,
  "Upgrade to change webhooks." Admin/owner on Pro/Team: the full card. While impersonating: every
  write control disabled, a note in place of the add form. `page.tsx` fetches
  `workspaces.webhooks.list` under the same condition as the API keys list (`listsWebhooks`), then,
  for each listed endpoint, its `deliveries` (up to `MAX_WEBHOOK_ENDPOINTS` = 10 extra reads,
  bounded) — pre-fetched server-side, so **Recent deliveries** works with no JavaScript at all
  (closed by default, its content already in the DOM).
- **The list** (`src/components/webhooks-card.tsx`): per endpoint, the URL, description, the
  events it is subscribed to, status (**Active**, or disabled — `Disabled — too many failed
  deliveries` / `Disabled — the endpoint answered 410 Gone` / `Disabled` for `manual`), and a
  "Last delivery" line (`<event label> · Attempt <n> · <status-or-error-class> · <ms> ms · <UTC
  date+time>`, or "No deliveries yet.").
- **Add endpoint** — Endpoint URL, an optional description, and a `<fieldset>` of eight event
  checkboxes (`Events`, none ticked by default). Submitting replaces the form with a show-once
  panel ("Your new webhook endpoint"): the secret in a read-only input labelled "Signing secret",
  a **Copy webhook secret** button (toggles to **Copied webhook secret** for 2 s) and **Done with
  webhook secret** — a plain link to `/workspace` so a no-JavaScript GET discards the form's POST
  result and the secret with it; hydrated, it cancels the navigation, drops the secret from state,
  and moves focus to the card's title (`id="webhooks-heading"`). The secret is never written to a
  cookie, the URL, or anywhere a later `revalidatePath` would re-fetch it.
- **Edit** — a per-row `<summary>` disclosure (not a button) over one submit carrying URL,
  description, events and the **Enabled** checkbox together, always explicit — unchecking
  **Enabled** always disables the endpoint (`manual`), never relying on the api's own "omitted
  field = no change" semantics via a stray missing checkbox.
- **Rotate secret** — two clicks once hydrated, like **Delete**: the first arms it (**Confirm
  rotate**, **Cancel**, Escape to disarm) and says that the current secret stops working at once;
  without JavaScript the first click submits. Then the same show-once panel as **Add endpoint**
  ("New signing secret"), whose **Done with webhook secret** remounts the row's section and puts
  focus back on that row's own **Rotate secret** button.
- **Back-forward cache.** Going into the bfcache (`pagehide` with `persisted`) remounts every
  show-once section synchronously (`discardOnPersistedPageHide`, `flushSync`), so pressing Back
  never shows a created or rotated secret again; the API keys card does the same for a created key.
- **Row names.** Every row's **Edit**, **Rotate secret**, **Send test event**, **Recent
  deliveries** and **Delete** carry `aria-describedby` pointing at the row's visually hidden URL,
  so several endpoints' identically named controls can be told apart. One endpoint deleted between
  the list and its deliveries read (another admin) shows no deliveries rather than failing the
  page (`deliveriesByEndpoint` in `src/lib/webhooks.ts`).
- **Send test event** — queues a `ping` to that endpoint alone; on success shows `Test event
  queued ({eventId}).` next to the button, on refusal the api's own message (e.g. "Turn this
  endpoint on before sending a test event.").
- **Recent deliveries** — a per-row `<summary>` disclosure over the pre-fetched rows (event,
  attempt, status/error class, duration, time — the same line format as "Last delivery"); "No
  deliveries have been recorded yet." when empty. Never a response body.
- **Delete** — the same two-click arm/confirm/Escape-to-cancel pattern as API keys' **Revoke**,
  unconditional (works on every plan, even while the rest of the row is read-only). Every row
  form (edit, rotate, test, delete) carries `workspaceId` and `id` as hidden inputs, the same
  lesson the API keys card's shipped bug taught.
- **i18n.** An `account.webhooks` namespace (card copy) plus six `account.workspace.webhooks*`
  keys (header/description/membersNote/upsell/upsellPlans/paused), en and sv, covered by the i18n
  guard.

## Activity

A card on `/workspace`, below Webhooks: who changed what in the workspace — membership, roles,
invitations, API keys, webhooks, plan — for admins and owners on every plan (a safety feature, not
an upsell; see CLAUDE.md's **Activity log.** paragraph and `apps/api/README.md`'s **Activity log**
section for the api side; this section is the card). Below admin the page renders nothing — no
note, no upsell, the card is simply absent.

- **Data.** `page.tsx` calls `workspaces.activity.list({ workspaceId, ...activityParams(searchParams) })`
  for admins only, inside the existing `Promise.all`, wrapped in `readActivity` (`src/lib/activity.ts`)
  so a failed read shows the card's own "Couldn't load the activity right now. Try again
  shortly." message instead of taking the whole page down. `workspace-view.tsx` renders
  `<ActivityCard>` when `isAdmin && activity`.
- **`src/lib/activity.ts`** is the pure helper, importing only the contract's Zod-free
  `workspace-activity`, `billing-plans` and `roles` subpaths (so nothing here pulls zod or the
  whole contract into the client bundle — the card itself ships no client JS at all):
  - `activityParams(searchParams)` reads the `activityAction` / `activityCursor` query
    parameters, dropping an unknown action or a cursor that fails the contract's own pattern and
    round-trip check — a hand-edited URL falls back to the first page of everything rather than a
    failed card.
  - `activityHref({ action?, cursor? })` builds `/workspace?…#activity-heading`, keeping the
    filter; every paging link and the filter form's submit land on the card's own heading.
  - `actorLabel` renders a member's name (or "Unnamed member"), "API key `<name>`", "System" or
    "Deleted user" per the api's four actor kinds; a member's email (shown only while they are a
    *current* member — the api already withholds it otherwise) and the "by support" badge render
    beside the label, not inside it.
  - `activitySentence` builds one ICU sentence per row from its `details` and its target's label.
    Every value an action's message can use is always passed — a missing one as `""` with its
    own `has…` flag `"no"`, which the message uses to drop that clause — so a row with less
    metadata (an older row, or a purged key/endpoint) still reads as a full sentence, never a raw
    key or a `{placeholder}`.
- **The card** (`src/components/activity-card.tsx`) is a server component with no `"use client"`:
  - A **Type of activity** filter — a `<select>` of the same 21 actions plus "All activity" — and
    a submit button, a plain `method="get"` form to `/workspace#activity-heading`.
  - Each row: the actor label, the email (when shown), a "by support" `Badge` when the row was an
    impersonated action, the sentence, and the time via `formatUtcDate(…, { time: true })` (UTC,
    like every other date on this page).
  - Empty state: "No activity in the last 90 days.". Failed load: "Couldn't load the activity
    right now. Try again shortly.".
  - Paging is a `<nav aria-label="Activity pages">` with **Older** (only when the api returned a
    `nextCursor`) and **Newest** (only once a cursor is in the URL — there is no "Newer": the
    cursor only pages toward older rows, so going back is simply the first page again, filter
    kept). Both are plain `<Link prefetch={false}>`s, so the whole card — filter and paging alike
    — works with no JavaScript.
- **i18n.** A top-level `account.activity` block (`packages/i18n/messages/{en,sv}/account.json`):
  card copy, actor labels, interval/status words, and one ICU sentence plus one filter-option
  label per action (20 of each) — covered by the i18n guard like every other string on this page.

## Payments

`/payments` shows the plan of the workspace the user is in now. The page reads `billing.get` on
every request rather than the entitlements cached on the workspace summary, so reloading after a
checkout shows the plan the webhook just wrote. The provider (`billing.provider`, `stripe` or
`mock`) decides what the **Change plan** card offers:

| Card | Who | Stripe | Mock |
|---|---|---|---|
| **Plan** (`PlanCard`) | everyone | Plan name and a status badge: "Active", "Trial", "Past due — update your payment method", "Canceled, ends `<date>`" (cancel at period end) or "Free plan"; the renewal date (UTC); the interval; `<used> of <limit> seats used` (or `<used> seats` on an unlimited plan) | same |
| **Change plan**, free | owner | `PlanPicker`: Pro / Team radios with both prices and seat limit from `PLANS`, a Monthly / Yearly radio, **Continue to checkout** → `startCheckout` → redirect to Stripe Checkout; plus **Manage billing** when `portalAvailable` (a former subscriber's card and invoices) | `MockBillingForm`: the same picker ("Mock billing — no charges") posts to `startCheckout` too (via `mockBilling`, `intent=checkout`); the mock activates the plan and returns to `?checkout=success` |
| **Change plan**, paid | owner | `ManageBillingButton`: **Manage billing** → `openPortal` → redirect to Stripe's billing portal (plan, payment method, invoices, cancel) | `MockBillingForm`: the picker preselected with **Switch plan**, and a separate **Cancel subscription** form (back to Free at once); both post to `mockBilling` → `changeMockPlan` and share one message region |
| **Change plan** | below owner | "This workspace is on `<Plan>`. Ask an owner to change the plan." | same |

Back from Stripe, `?checkout=success` shows "You're on `<Plan>`." once the webhook has landed, else
"Checkout complete — your plan updates within a minute."; `?checkout=cancelled` shows "Checkout
cancelled — nothing changed." Both render in a polite status region above the cards.

The cores in `src/lib/billing-actions.ts` take `{ api, workspaceId }` like the Workspace ones and
validate the picker with `CheckoutSchema` / `MockChangeSchema` before any api call (a bad plan or
interval is a field error). Every action resolves `requireWorkspace()` and refuses a form rendered
for another workspace ("Switch to that workspace first", `sameWorkspace`). Owner-only is the api's
rule — the UI only hides the controls — so a non-owner who posts anyway gets its "Requires the owner
role"; "Use the billing portal to change your plan", "This plan is not available" and "No billing
account yet" pass through the same way. `changeMockPlan` revalidates `/payments` and the layout (the
header's workspace summary carries the entitlements); a successful `startCheckout` revalidates the
layout before redirecting, for the mock's in-app return. `src/proxy.ts` adds Stripe Checkout and the
portal to `form-action`, so the redirect also works for a form posted without JavaScript.

`/workspace` shows the seats too: the **Members** description ends with the seats line, and when no
seat is left the invite form's button is disabled with "This workspace has reached its member limit."
and a link to `/payments`. That is informative only; the api refuses the invitation regardless.

## Locale (English and Swedish)

Every page (home, Personal info, Security, Data & privacy, Workspace, Payments), the sidebar, the
header and the status pages render in English or Swedish, wired as `apps/auth` and `apps/app` are (see
`docs/guides/i18n.md`): `src/i18n/request.ts` resolves the locale from `getAuth().getLocale()`,
the root layout renders `<html lang>` and wraps the tree in `NextIntlClientProvider` with only the
`account` namespace (there rather than in the `(account)` layout, so `error.tsx` and
`not-found.tsx` are covered too), and the `(account)` layout passes translated labels to every
`@repo/ui` control.

- **Two switchers.** The header's `LocaleSwitcher` posts to `setLocale` (`src/app/actions.ts`),
  which redirects back to the page (`localeReturnPath`, this origin only) with `?locale_error=1`
  on failure. Personal info's **Language** card (`LanguageForm`) posts a `LocaleSelect` (a
  select and a **Save language** button, a settings field rather than the header's menu) to
  `setLanguage` (`personal-info/actions.ts`, core `setLocaleCore`) through `useActionState`: an
  unsupported value is a field error, a failed save a form message, and a success revalidates the
  whole layout and confirms in the language just chosen.
- **Action cores** take `locale` in their deps (`ActionDeps.locale`, and `WorkspaceDeps.locale` /
  `BillingDeps.locale` for the Workspace and Payments cores); this app's own messages come
  from `accountTranslator(locale)` (`src/lib/i18n.ts`), the api's pass through as they arrive, and
  `zodMessage(t)` maps form issues by code and field (the reused-password refine by its
  `params.key`). The wrong-2FA-code check stays on `data.reason`. The image size message is the
  `image.tooLarge` key on both the client and the server check, never `IMAGE_UPLOAD_MESSAGE`.
- **Contract constants are never copy.** The invite form's full-workspace notice is
  `account.invite.seatLimit` and the plan picker's feature labels `account.features.<feature>`,
  never `SEAT_LIMIT_MESSAGE` / `featureCopy`; `src/lib/i18n.test.ts` keeps their English equal.
  Roles render through `account.roles` (the api's role words, capitalised). Plan names stay the
  product names ("Free", "Pro", "Team").
- **Prices** are `Intl.NumberFormat(locale, { style: "currency", currency: "USD" })`, whole dollars
  without decimals (`formatPrice` in `src/lib/plans.ts`: "$19", "19 US$"). The `plans.ts` helpers
  take the `account.plans` translator and the locale rather than importing a catalog, so the
  client plan picker never bundles one.
- **OAuth connect errors** on Security come from `oauthErrorMessageIn(t, code, label)` over
  `account.oauthErrors.*`, as in `apps/auth`.
- **Dates** in the devices, connected-accounts, members and invitations lists and on the Plan card
  render with the page's `locale`, passed down to the client components; the zone stays `UTC` and Swedish is built by hand
  from a fixed month table (`formatUtcDate` from `@repo/i18n/dates`, shared with `apps/app`),
  English keeps its old formatter.
- **The guard.** `src/i18n-guard.test.ts` scans every `.tsx` under `src/` except tests and
  `global-error.tsx`; its allow-list is empty.

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
calls `assertAuthEnv()`, so `next start` fails at boot while any of them is missing or empty (Next
logs `Failed to prepare server … <KEY> is not set` and answers every request, `/api/health`
included, with 500, so the Docker health check reports the container unhealthy).

## Testing

```bash
bun --filter @repo/account test
```

`src/lib/actions.test.ts` runs the cores against a fake api: trimming and the 100-character limit on
the name, the precedence of password errors (mismatch, reuse, too short, wrong current), that
passwords are never echoed, revoking one or all other sessions, `initialsOf`, `setPasswordCore`
(mismatch is a field error that never calls the api; success and `CONFLICT`) and
`disconnectIdentityCore` (an unrecognised provider is rejected before the api; success, `FORBIDDEN`
and `NOT_FOUND` pass the api's message through), and the four two-step verification cores (a
wrong code as a field error, impersonation's `FORBIDDEN` passed through, the QR rendered from the
URL). `requestEmailChangeCore` and `confirmEmailChangeCore` are covered the same way (a malformed
address, the password/code field errors, the reauth notice, the same-address `BAD_REQUEST`, a
taken-address `CONFLICT`, the rate limit and impersonating messages, confirm's token forwarding and
its wrong-account/invalid/taken passthrough), with `email-change-card.test.tsx` and
`email-confirm-form.test.tsx` pinning what the two components render (the two-step code field, the
pending notice and its **Send again** relabel, impersonation read-only, the success heading that
takes focus). `src/lib/two-factor-view.test.ts` pins which branch the card shows. `src/lib/workspace-actions.test.ts` covers each
Workspace core: success, one declared api error passed through, input rejected before the api, and
the delete confirmation checked against the server-known name rather than any form field.
`src/lib/billing-actions.test.ts` covers the Payments cores: success for each, a declared api error
passed through, and an invalid plan or interval rejected as a field error before the api. The image
cores are covered in `actions.test.ts` and `workspace-actions.test.ts` (an oversized file refused before the api,
success, the api's `BAD_REQUEST` as a field error, `TOO_MANY_REQUESTS` as a form message, and
`FORBIDDEN` / `NOT_FOUND` as form messages for the logo cores), and
`src/lib/image-upload-view.test.ts` pins what the card shows. The same file covers the Data &
privacy cores: `requestExportCore` (success and the api's `CONFLICT` passed through),
`setConsentCore` (an invalid value is a field error before the cookie is written), `deleteAccountCore`
(an email mismatch, the reauth refusal, the sole-owner `CONFLICT`, and success clearing the session
and redirecting to `?deleted=1`) and `cancelDeletionCore` (true on success, false and logged on any
error). `src/lib/actions-sv.test.ts` re-runs every core in Swedish, pinning that the api's own
messages pass through unchanged while this app's messages translate. `src/lib/export-download.test.ts`
covers `exportDownloadResponse`: a missing or malformed id and a signed-out caller are `404` before
any api call, a declared api error is `404`, an unexpected one is `502`, and success streams the
file with `Content-Disposition: attachment` and a sanitised filename. All of them are part of
`bun run test:services`.

To try it by hand, run `bun dev`, sign up at `http://auth.brand.localhost:3002/signup`, then open
`http://account.brand.localhost:3003/security`. Sign in again from a second browser (or a private
window) to see a second row under **Your devices**.

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin: they load the user or data and render a view.
- **App-only components** — `src/components/` (the sidebar, forms, sessions and members lists; the header and footer come from `@repo/ui`).
  Anything shared by two apps belongs in `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md), [CLAUDE.md](../../CLAUDE.md) and
[`packages/session/README.md`](../../packages/session/README.md) for the conventions shared by all
apps.
