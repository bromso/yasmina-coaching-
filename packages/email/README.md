# @repo/email

Transactional email templates rendered to HTML and plain text; no provider knowledge. This package
only renders — sending (SMTP, a provider API, logging in dev) lives in `apps/api`.

```tsx
import { emails } from "@repo/email"

const mail = await emails.verifyEmail({ name: "Ada", link })
// mail: { subject: string, html: string, text: string } — English, the default locale

const svMail = await emails.verifyEmail({ name: "Ada", link }, "sv")
// the same shape, every visible string (subject included) in Swedish
```

## Locale

Every `emails.<name>(props, locale = "en")` takes the recipient's locale as a second, optional
argument (`Locale` from `@repo/i18n/locales`). Each template reads its strings through
`translatorFor(locale, "email")` (`@repo/i18n/translate`) over the `email` namespace
(`packages/i18n/messages/<locale>/email.json`); apps/api decides which locale to pass: the
recipient's saved locale (English if never chosen) for `passwordChanged`, `twoFactorEnabled`,
`twoFactorDisabled`, `twoFactorReset` and `accountReset`; for `resetPassword`, `magicLink` and
`verifyEmail` — mails the user asked for — the saved locale when chosen, else the request's own
locale, else English (so a magic link to an address with no account uses the request locale); for
`invitation` the invitee's saved locale when the address already has an account that chose one,
else the inviter's request locale; for `waitlistWelcome` the caller's request locale; for
`supportReceived` and `jobApplicationReceived` the request locale, else English — `supportRequest`
and `jobApplication` (both sent to an internal inbox, never a visitor) are always English. See
`apps/api/README.md`'s Locale section.

**English stays byte-identical.** Before any template read from the catalog, its pre-change
`{ subject, html, text }` for a representative set of props was captured as a committed fixture
(`src/__fixtures__/english-snapshots.json`); `src/index.test.tsx`'s "English render is
byte-for-byte unchanged" re-renders every template with the same props at the default locale and
asserts equality against it. `@react-email/render`'s SSR output inserts an `<!-- -->`
hydration-safe comment between two *adjacent* text-or-expression JSX children with nothing between
them, so a few templates (`VerifyEmail`'s `Welcome{name ? … : ""}` heading, `Layout`'s `{brand} ·
…` footer, `PasswordChanged`'s `…changed on {date}.`) keep a literal JSX child split in two or
three pieces — one translated fragment plus the raw value — purely to keep that comment's
placement (or its absence) exactly as it was; a comment next to one of those splits explains why
it is safe to merge once English is re-baselined. The `<name>Subject` exports below are plain
English string constants, unaffected by `locale` — they exist so a test or an e2e journey can
match a mail without repeating the string, never to render anything.

**The subjects are exported too** (`verifyEmailSubject`, `resetPasswordSubject`,
`passwordChangedSubject`, `accountResetSubject`, `magicLinkSubject`, `waitlistWelcomeSubject`,
`twoFactorEnabledSubject`, `twoFactorDisabledSubject`, `twoFactorResetSubject`;
`invitationSubject(workspaceName)`, `supportRequestSubject(reference, topic)`,
`supportReceivedSubject(reference)`, `jobApplicationSubject(reference, title)` and
`jobApplicationReceivedSubject(reference)` are functions, since each names something from the call
— always the English literal, regardless of `locale`. A Swedish e2e journey reads a mail by
recipient instead (`apps/e2e/fixtures/mail.ts`'s `latestMailTo`), never by guessing the translated
subject.

**`invitation.body`**'s `{role}` is a real ICU `select` in Swedish only (`viewer`/`member`/
`admin`/`owner` → their Swedish names, any other value falling back to the raw string) — English
keeps the plain `{role}` placeholder, so "member" stays "member" there.
`PasswordChanged`'s date (`at`) is locale-aware: `en` still renders `date.toUTCString()` verbatim
(so the original English fixture needed no change), `sv` renders
`Intl.DateTimeFormat("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "UTC" })` with an
explicit `" UTC"` suffix (the option picks which clock the parts are computed in, not a zone
label).

## Templates

- `VerifyEmail` (`emails.verifyEmail({ name?, link, brand? }, locale?)`) — subject
  `"Verify your email"`. Confirms a new account's email address; the link is said to work for 24
  hours.
- `ResetPassword` (`emails.resetPassword({ name?, link, brand? }, locale?)`) — subject
  `"Reset your password"`. Carries the reset link, usable within an hour.
- `PasswordChanged` (`emails.passwordChanged({ name?, at, accountUrl, resetUrl, brand? }, locale?)`)
  — subject `"Your password was changed"`. Notifies of a completed change; `at` is an ISO
  timestamp (see **Locale** above for how `at` renders per locale). For a recipient who did not
  make the change, `resetUrl` (the auth app's `/forgot-password`) is the actionable path — the
  only page they can still reach once the change has signed their other devices out — and
  `accountUrl` points at the signed-in-devices view.
- `AccountReset` (`emails.accountReset({ name?, accountUrl, brand? }, locale?)`) — subject
  `"Your account was reset"`. Sent after `apps/api` purges a never-verified account because its
  address was proven by a provider or a sign-in link: the password was removed and every device
  signed out. `accountUrl` is the account app's base URL; the mail links to `<accountUrl>/security`.
- `MagicLink` (`emails.magicLink({ link, brand? }, locale?)`) — subject `"Your sign-in link"`. The
  link from "Email me a sign-in link", usable within 15 minutes, once.
- `WaitlistWelcome` (`emails.waitlistWelcome({ siteUrl, brand? }, locale?)`) — subject
  `"You're on the list"`. Sent to a new waitlist address; links to `siteUrl` (the marketing site).
- `Invitation` (`emails.invitation({ workspaceName, inviterName, role, link, brand? }, locale?)`)
  — subject `"You're invited to <workspaceName>"`. Sent by `workspaces.invitations.create`:
  "<inviter> invited you to join <workspace> as a <role>. This link works for 7 days.", an
  **Accept invitation** button and the link spelled out; `link` is `apps/app`'s
  `/invitations/<token>`. Story: `Email/Invitation`.
- `TwoFactorEnabled` (`emails.twoFactorEnabled({ name?, accountUrl, brand? }, locale?)`) — subject
  `"Two-step verification turned on"`. Sent once the account turns on two-step verification.
- `TwoFactorDisabled` (`emails.twoFactorDisabled({ name?, accountUrl, brand? }, locale?)`) —
  subject `"Two-step verification turned off"`. Sent once it is turned off, by the account itself
  or an admin's reset.
- `TwoFactorReset` (`emails.twoFactorReset({ name?, accountUrl, brand? }, locale?)`) — subject
  `"Two-step verification was reset"`. Sent after a superadmin resets a user's two-step
  verification (`admin.users.resetTwoFactor`).
- `PasskeyAdded` (`emails.passkeyAdded({ name?, passkeyName, accountUrl, brand? }, locale?)`) —
  subject `"A new passkey was added to your account"`. Sent after `account.passkeys.register`;
  `passkeyName` is the passkey's own name (never key material).
- `PasskeyRemoved` (`emails.passkeyRemoved({ name?, passkeyName, accountUrl, brand? }, locale?)`)
  — subject `"A passkey was removed from your account"`. Sent after the account owner removes one
  of their own passkeys (`account.passkeys.delete`); for every passkey being removed by a
  superadmin instead, see `PasskeysRemoved`.
- `PasskeysRemoved` (`emails.passkeysRemoved({ name?, accountUrl, brand? }, locale?)`) — subject
  `"Your passkeys were removed"`. Sent after `admin.users.removePasskeys`: every passkey on the
  account is gone and every session ended — mirrors `TwoFactorReset`'s admin-initiated wording
  rather than `PasskeyRemoved`'s self-service one, and carries no passkey name since it always
  removes all of them.
- `DataExportReady` (`emails.dataExportReady({ name?, link, brand? }, locale?)`) — subject
  `"Your data export is ready"`. Sent once the `privacy.export` job finishes writing the archive;
  `link` is the account app's `/data-privacy`, where the download stays live for 7 days.
- `AccountDeletionScheduled` (`emails.accountDeletionScheduled({ name?, date, link, brand? },
  locale?)`) — subject `"Your account will be deleted"`. Sent when `account.delete` schedules the
  purge; `date` is the ISO timestamp it will run (rendered as a UTC date in the recipient's
  locale), `link` the auth app's `/login` — signing in before then cancels it.
- `AccountDeleted` (`emails.accountDeleted({ name?, brand? }, locale?)`) — subject `"Your account
  has been deleted"`. Sent once `privacy.purge` has run: the account and its data are gone, except
  notes in shared workspaces (kept, de-linked).
- `AccountSuspended` (`emails.accountSuspended({ name?, until, brand? }, locale?)`) — subject
  `"Your account has been suspended"`. Sent by `admin.users.suspend`: once per suspension, and
  again only when `until` changes on an already-suspended account (never for a reason-only edit).
  `until` is the ISO timestamp the suspension lifts itself, or `null` for indefinite — rendered as
  a UTC date in the recipient's locale when set. Never carries the admin's internal reason or
  identity, only that the account is suspended, until when (if ever), and a "contact support" line.
- `AccountUnsuspended` (`emails.accountUnsuspended({ name?, brand? }, locale?)`) — subject `"Your
  account is no longer suspended"`. Sent by `admin.users.unsuspend` once the suspension's columns
  are cleared; never sent for its no-op path (an account that was not suspended). Carries no admin
  detail either.
- `SupportRequest` (`emails.supportRequest({ reference, topic, email, name?, page?, message,
  adminUrl, brand? }, locale?)`) — subject `` `New support request <reference>: <topic>` ``. Sent
  to the support team (`SUPPORT_EMAIL`) when a visitor submits the help center's contact form; the
  submitter's own `message` renders as plain text in both `html` and `text` — never as HTML, since
  it is a stranger's input. Story: `Email/SupportRequest`.
- `SupportReceived` (`emails.supportReceived({ reference, brand? }, locale?)`) — subject
  `` `We've received your request (<reference>)` ``. Sent to whoever submitted the contact form,
  confirming receipt: only the reference and a generic greeting, never a copy of their message or
  name — the address is whatever was typed, and carrying their own text back would let the form
  send branded mail with arbitrary content to any address. Story: `Email/SupportReceived`.
- `JobApplication` (`emails.jobApplication({ reference, title, name, email, link?, note?,
  adminUrl, brand? }, locale?)`) — subject `` `New application <reference>: <title>` ``. Sent to
  the hiring inbox (`HIRING_EMAIL`) when a candidate applies for an open role; the applicant's own
  `link` and `note` render as plain text, never HTML or a clickable `href` — the admin view is
  where `link` is clickable. Story: `Email/JobApplication`.
- `JobApplicationReceived` (`emails.jobApplicationReceived({ reference, title, brand? },
  locale?)`) — subject `` `We've received your application (<reference>)` ``. Sent to whoever
  applied, confirming receipt: only the reference and the role title, never their name, link or
  note — the address is whatever was typed, and carrying their own text back would let the form
  send branded mail with arbitrary content to any address, the same reasoning as
  `SupportReceived`. Story: `Email/JobApplicationReceived`.
- `EmailChangeConfirm` (`emails.emailChangeConfirm({ name?, link, brand? }, locale?)`) — subject
  `"Confirm your new email address"`. Sent to the *new* address by
  `account.email.requestChange`; the confirm link works for 24 hours and is itself that address's
  verification. Story: `Email/EmailChangeConfirm`.
- `EmailChangeRequested` (`emails.emailChangeRequested({ name?, maskedEmail, link, brand? },
  locale?)`) — subject `"Your email address is changing"`. Sent to the account's *current*
  address alongside `EmailChangeConfirm`: `maskedEmail` is the requested new address, masked
  (`maskEmail`) — never the full address — and `link` is the 24-hour cancel link. Story:
  `Email/EmailChangeRequested`.
- `EmailChanged` (`emails.emailChanged({ name?, maskedEmail, link, brand? }, locale?)`) — subject
  `"Your email address was changed"`. Sent to the *old* address once
  `account.email.confirmChange` completes — its only remaining way to catch a change it did not
  make; `link` is the 7-day "This wasn't me" undo link. Story: `Email/EmailChanged`.
- `EmailChangeReverted` (`emails.emailChangeReverted({ name?, hasPassword?, passkeysRemoved?,
  identitiesRemoved?, twoFactorDisabled?, deletionCancelled?, brand? }, locale?)`) — subject
  `"Your email change was undone"`. Sent to the restored address once `auth.emailChange.revert`
  completes: every session ended, plus one line per other thing the undo rolled back (passkeys
  removed, sign-in providers connected since the change, two-step turned on since, a deletion
  requested since), a line asking the owner to review their sign-in providers and two-step
  verification, and a "contact support" line; carries no link of its own — a `resetPassword`
  mail follows separately when the account had a password. Story: `Email/EmailChangeReverted`.
- `WebhookDisabled` (`emails.webhookDisabled({ name?, workspaceName, host, reason, failures, link,
  brand? }, locale?)`) — subject `"A webhook endpoint was turned off"`. Sent to every owner of the
  workspace when `webhook.deliver` turns an endpoint off on its own — `WEBHOOK_MAX_CONSECUTIVE_FAILURES`
  (5) dead deliveries in a row (`reason: "failures"`, `failures` the count) or a `410 Gone`
  response (`reason: "gone"`) — never for an admin's own manual disable. Names the endpoint's
  `host` only, never its path or query (which may carry a token of the receiver's); says events
  from while it was off are not resent; `link` is the account app's `/workspace`. Story:
  `Email/WebhookDisabled`.
- `WorkspaceTwoFactorRequired` (`emails.workspaceTwoFactorRequired({ name?, workspaceName, link,
  brand? }, locale?)`) — subject `"Two-step verification is now required"`. Sent by
  `workspaces.security.set` when an owner turns the per-workspace two-step requirement on, to every
  member whose account has neither two-step verification on nor a passkey; `link` is the account
  app's `/security`. Names the workspace only — never the owner or any other member. Story:
  `Email/WorkspaceTwoFactorRequired`.
- `RoleChanged` (`emails.roleChanged({ name?, workspaceName, role, inboxUrl, unsubscribeUrl,
  brand? }, locale?)`) — subject `` `Your role in ${workspaceName} changed` `` (`roleChangedSubject`).
  An **optional** notification mail (Phase 13 B, `member.role_changed`): someone else changed the
  recipient's role in a workspace. Names the workspace and the new role only, never who changed it
  or any other member. Shares `NotificationFooter` (below) with the other two optional mails.
  Story: `Email/RoleChanged`.
- `RemovedFromWorkspace` (`emails.removedFromWorkspace({ name?, workspaceName, inboxUrl,
  unsubscribeUrl, brand? }, locale?)`) — subject `` `You were removed from ${workspaceName}` ``
  (`removedFromWorkspaceSubject`). An optional notification mail (`member.removed`): someone else
  removed the recipient from a workspace. Names the workspace only. Story:
  `Email/RemovedFromWorkspace`.
- `PlanChanged` (`emails.planChanged({ name?, workspaceName, plan, inboxUrl, unsubscribeUrl,
  brand? }, locale?)`) — subject `` `${workspaceName} is now on the ${Plan} plan` ``
  (`planChangedSubject(workspaceName, plan)`). An optional notification mail (`plan.changed`), to
  a workspace owner: the workspace's plan changed. Names the workspace and the plan only, never
  who changed it, a price or a payment detail. Story: `Email/PlanChanged`.

`RoleChanged`, `RemovedFromWorkspace` and `PlanChanged` are the three **optional** notification
emails (Phase 13 B — see `apps/api/README.md`'s **Notification preferences** section): each takes
`inboxUrl` (the account app's `/notifications`) and `unsubscribeUrl` (the one-click token's
confirm page) through the shared `NotificationLinks` type and ends with `NotificationFooter`
(`src/templates/notification-footer.tsx`) — an inbox button, the link spelled out, and a visible
"Turn off these emails" link (RFC 8058 still asks for a body link beside the `List-Unsubscribe`
header, which `apps/api` sets separately). The other 28 templates above carry no such
footer and no `headers` on their `Message` — only these three are ever opt-out-able; every locked
notification and every other mail in this package keeps arriving exactly as before. See
`docs/guides/notification-preferences.md`.

Each `emails.*` call returns `Promise<RenderedEmail>`, `{ subject, html, text }` — `apps/api` hands
that straight to its mailer.

## Brand

`Brand` from `packages/ui` is a React component and cannot render inside email HTML (no CSS modules,
no client JS, many clients strip `<svg>`/`<img>` by default). Every template instead takes a `brand`
prop — a plain string — defaulting to `BRAND` (`"Boilerplate"`), shown in the footer by `Layout`.

## Adding a new email

A new email is a template, a test and a story:

1. Add `src/templates/<name>.tsx` — compose `Layout` from `./layout` with `@react-email/components`,
   export the component, its `Props` type (including `locale?: Locale`), and a `<name>Subject`
   string constant (the English literal, unaffected by `locale`). Read every visible string through
   `const t = translatorFor(locale, "email")`; add the keys to
   `packages/i18n/messages/{en,sv}/email.json`.
2. Wire it into `emails` and the public exports in `src/index.tsx`: the subject passed to
   `rendered()` comes from `translatorFor(locale, "email")("<name>.subject", …)`, translated — not
   the `<name>Subject` constant.
3. Add cases to `src/index.test.tsx` covering the subject, the link/interpolated values appearing in
   both `html` and `text`, that `text` contains no HTML tags, and a Swedish render (at least one
   assertion on a translated string). If the template renders at all in the default English call
   path, add it to `src/__fixtures__/english-snapshots.json` and the byte-identity test once a
   baseline exists — a *new* template has no pre-i18n baseline to match, so this only applies when
   editing an existing one.
4. Add `apps/story/stories/email/<Name>.stories.tsx` rendering it through `EmailPreview` (copy
   `VerifyEmail.stories.tsx`), with a `Swedish` story variant asserting the Swedish subject.
