# Notification preferences and email — design (Phase 13 B)

Phase 13 "notifications": A notification centre (#116) → **B notification preferences and email
delivery**. Approved in chat on 2026-10-21. One PR; it completes Phase 13 (and ticks A in
`docs/ROADMAP.md`).

## Intent

People choose which notifications also reach them by email; essential mail keeps arriving.
Decided with the owner:
- **Per type, email only.** The in-app inbox always receives every notification.
- **Essentials locked on:** the four types that already mail today — `invitation.received` (the
  invitation itself), `workspace.two_factor_required`, `export.ready`, `webhook.disabled` — and all
  security/account mail stay as they are, never opt-out-able.
- **Three new optional emails, on by default:** `member.role_changed`, `member.removed`,
  `plan.changed`, each with RFC 8058 one-click unsubscribe that turns off that type only.

## Basis (checked 2026-10-21)

- Context7 `/websites/resend`: RFC 8058 needs `List-Unsubscribe: <https URL>` plus
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`; the URL accepts a `POST` and answers
  `200`/`202` with a blank body, and shows the regular unsubscribe page on `GET`; honour requests
  within 48 hours; keep a visible unsubscribe link in the body; transactional mail is exempt but
  adding it is the safer choice.
- Context7 `/websites/nodemailer`: the `list` option writes RFC 2369 `List-*` headers; other
  headers (`List-Unsubscribe-Post`) go through `headers`. Resend takes both via `headers`.
- Legal Data Hunter: Directive 2002/58/EC (ePrivacy) Art. 13 governs unsolicited communications
  for direct marketing; these are service notifications about the recipient's own account, so the
  opt-out is a courtesy and a deliverability measure, and locking essential mail is lawful.
- Phase 13 A's notification research (Consensus) — control over notifications reduces strain —
  carries over.

## 1. Data and vocabulary

- Migration `0033_notification_preferences`: `notification_preferences(user_id, type,
  email_enabled, updated_at)`, primary key `(user_id, type)`, no FK. No row = the type's default.
- `NOTIFICATION_EMAIL` in `@repo/api-contract` (`./notifications` subpath): `locked` for
  `invitation.received`, `workspace.two_factor_required`, `export.ready`, `webhook.disabled`;
  `optional` (default on) for `member.role_changed`, `member.removed`, `plan.changed`.
- `account.notificationPreferences.get()` → `{ type, email: boolean, locked: boolean }[]` and
  `.set({ type, email })` (⚑; only `optional` types; refused while impersonating; audited
  `user.notification_email_changed` `{ type, email }`; a no-op writes nothing).
- The privacy export lists the preferences; `users.purge` deletes them.

## 2. Sending

- `notifyUser` (A) gains: for an `optional` type whose preference is on, enqueue a `mail.send` job
  in the same transaction (rolled back with the change). Locked types keep their existing mails
  exactly as today — no change to who receives them or how.
- New `@repo/email` templates (en + sv, saved locale else English, test + Storybook story):
  `roleChanged` (`workspaceName`, `role`), `removedFromWorkspace` (`workspaceName`), `planChanged`
  (`workspaceName`, `plan`) — no email addresses of others, a link to the inbox, and a visible
  "Turn off these emails" link.
- The mail seam's `Message` gains `headers?: Record<string, string>`, passed through by `smtp`
  (Nodemailer `headers`) and `resend` (`headers`), recorded by `log`/`file`. Optional-type mails
  carry `List-Unsubscribe: <${AUTH_URL}/email/unsubscribe/one-click?token=…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. Locked mails carry neither.

## 3. Unsubscribing

- Token: `base64url(userId.type.v).hmac`, HMAC-SHA256 under a key derived from
  `TWO_FACTOR_ENCRYPTION_KEY` with a fixed context label (no new env var); constant-time compare;
  no expiry (works until the key rotates); bound to one user and one type.
- `auth.notificationEmail.unsubscribe({ token })` (anonymous, service token, limited per client
  and api-wide): verifies, sets that type's email off, audits; answers success for any well-formed
  request so the outcome is not an oracle; a bad token changes nothing.
- `apps/auth`:
  - `POST /email/unsubscribe/one-click?token=…` (route handler): the RFC 8058 endpoint — accepts
    the `List-Unsubscribe=One-Click` body (any other body still works), calls the procedure,
    answers `200` with an empty body, no redirect, `Cache-Control: no-store`; outside the CSRF
    same-origin check by necessity (mail clients post cross-site) — safe because it only turns an
    email type off and is idempotent.
  - `GET /email/unsubscribe/one-click?token=…` redirects `303` to the page below.
  - `/email/unsubscribe?token=…` page: names the email type, a **Turn off these emails** button
    (server action; never acts on load, so link scanners cannot unsubscribe anyone), then "You
    won't get these emails any more. Change this any time in your notification settings." with a
    link to account `/notifications`. Added to `robotsFor`'s disallow (`/email/` already is) and
    the a11y manifest.

## 4. Settings UI

`apps/account` `/notifications` gains an **Email** section: a checkbox per optional type (label
per type, en + sv) and **Save email settings**; the locked types listed read-only under "Always
emailed — needed to keep your account and workspaces working."; read-only while impersonating.
Works without JavaScript.

## 5. Testing, docs

- api (SQLite + Postgres): optional type mailed when on, not when off, in-app row always written;
  locked mails unchanged; rollback enqueues nothing; preferences only for optional types; token
  bound to user+type, forged/tampered/other-user tokens change nothing and answer identically;
  impersonation refusal; export/purge.
- `@repo/email` templates; the mail seam passes `headers` through `smtp` and `resend` (fake
  transports) and only optional mails carry them.
- `apps/auth` route + page; `apps/account` section.
- e2e: a member turns off role-change email → an owner changes their role → the inbox shows it but
  no mail arrives; then a one-click `POST` to the `List-Unsubscribe` URL from the next
  `plan.changed` mail turns that type off (verified on the settings page).
- Docs: CLAUDE.md (**Notification preferences.** paragraph; migration; Email, Notifications
  cross-refs; e2e counts), READMEs (api, auth, account, email), a guide section, `/privacy` (email
  choices), ROADMAP (tick A as #116; B on merge).

## Out of scope

In-app muting per type; digests; marketing email; per-workspace preferences; push.

## Changed during implementation

Four rulings sharpened this spec once the tasks ran into real constraints:

- **A `peek` procedure was added.** §3 did not foresee that the confirm page needs to know which
  email type a token names *before* the person clicks anything, without itself unsubscribing them.
  `auth.notificationEmail.peek({ token })` (anonymous, read-only) answers `{ type } | null` —
  shaped identically for a bad token and for one whose user was purged — so loading the page never
  changes a preference and never tells a scanner more than a real click would.
- **The one-click POST keys its rate-limit bucket on a hash of the token, not the poster's ip.**
  §3's "limited per client and api-wide" assumed a per-ip client id like every other anonymous
  relay in this repo. Mail providers (Gmail, Yahoo, …) post RFC 8058 one-clicks from shared egress
  addresses, where a per-ip bucket would refuse real unsubscribes at scale once enough came from
  the same provider. `unsubscribeTokenClientId` (`@repo/session/client`) keys the POST route on
  `unsub:` + a hash of the token instead; the confirm page (a person's own browser) still uses the
  ordinary per-ip `unsubscribeClientId`. Because a caller can invent tokens, the api verifies the
  token (one HMAC, constant time) before spending any budget: a forged token answers at once,
  `{ ok: true }` / `null` as a good one would, and spends nothing, so the token-hash bucket is one
  bucket per real link and invented tokens can never drain the api-wide cap. Real tokens are
  bounded per link and api-wide.
- **Sending is verified-address-only.** §2 did not call this out. `enqueueNotificationEmail`
  skips an optional mail entirely when the recipient's own email is unverified — an address
  nobody has proven to own is never mailed anything it did not ask for, even an opt-out-able
  notice. The in-app row still lands either way.
- **`plan.changed` mail depends on the billing provider.** §5's e2e plan assumed an in-app plan
  change (the mock billing form) would produce a `plan.changed` mail to verify the one-click flow
  against. Under mock billing it cannot: a workspace has exactly one `owner`, the billing mirror
  never mails the actor, and only that one owner may call `billing.mockChange`, so the sole owner
  is the actor and is excluded. Under `BILLING_PROVIDER=stripe` it is the normal case: an in-app
  checkout goes through Stripe's webhook, whose actor is `{}`, so every owner is mailed —
  including the one who paid. e2e runs mock billing, so its journey
  substitutes `member.removed` for the one-click mechanics instead; `plan.changed` is covered at
  the api level with a directly-inserted second `owner` row. See
  `docs/guides/notification-preferences.md`'s **Known limitations** for the fuller account.
