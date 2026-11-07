# Notification preferences and email delivery

Phase 13 B lets a person choose which of the in-app notifications in CLAUDE.md's **Notifications.**
paragraph also reach them by email — the in-app inbox always receives every type regardless of
this choice. See CLAUDE.md's **Notification preferences.** paragraph for the full behaviour in one
place and `apps/api/README.md`'s own section for the procedure-by-procedure reference; this guide
covers the locked/optional split, adding a new optional type, testing the one-click flow locally,
and deliverability.

## The locked/optional split

`NOTIFICATION_EMAIL` (`packages/api-contract/src/notifications.ts`, part of the Zod-free
`./notifications` subpath so a browser bundle never pulls in zod or the oRPC contract for it)
names two lists over the seven `NOTIFICATION_TYPES`:

- **`locked`** — `invitation.received`, `workspace.two_factor_required`, `export.ready`,
  `webhook.disabled`. Each already had its own dedicated mail before this phase, and each keeps an
  account or its workspaces working — the invitation link itself, a workspace newly requiring
  two-step verification, a finished data export, a webhook endpoint that just stopped delivering.
  These are never opt-out-able, and `account.notificationPreferences.set` cannot be called with a
  locked type's name — `SetNotificationPreferenceSchema` types its `type` field to
  `z.enum(NOTIFICATION_EMAIL.optional)`, so a locked type fails validation before any handler runs.
- **`optional`** — `member.role_changed`, `member.removed`, `plan.changed`. Mailed by default
  (`NOTIFICATION_EMAIL_DEFAULT = true`), and each can be turned off on its own, either from account
  settings or from the one-click link every such mail carries.

A locked type's email is unaffected by anything in this phase — it is exactly the mail that
shipped with Phase 13 A (or, for `invitation.received`, long before it) and does not go through
`notification-email.ts` at all.

## Adding a new optional type

1. Add the type to `NOTIFICATION_TYPES` (if it is not already a notification) and to
   `NOTIFICATION_EMAIL.optional` in `packages/api-contract/src/notifications.ts`. Decide the
   default — today every optional type defaults to on; a type that should default to off would
   need its own constant, not `NOTIFICATION_EMAIL_DEFAULT`, since that one applies to the whole
   list.
2. Add a `@repo/email` template that takes `NotificationLinks` (`inboxUrl`, `unsubscribeUrl`) and
   ends with `<NotificationFooter t={t} inboxUrl={inboxUrl} unsubscribeUrl={unsubscribeUrl} />` —
   copy `role-changed.tsx`. Add its English subject as a plain function
   (`<name>Subject(...)`), the en + sv catalog keys, a test, and a Storybook story — the usual
   "Adding a new email" four steps in `packages/email/README.md`, plus the footer.
3. Add a `case` to `enqueueNotificationEmail`'s `switch (sent.type)` in
   `apps/api/src/notification-email.ts` calling `enqueueMail` with the new template. The type-level
   `OptionalNotification` mapped type means a missing case fails the typecheck rather than
   silently rendering nothing.
4. Wherever the emitter that writes this notification's in-app row lives (an emitter in
   `apps/api/src/router.ts` calling `notifyUser`), nothing changes — `notifyUser` already calls
   `enqueueNotificationEmail` for every optional type inside the same transaction. You do not need
   to touch the emitter.
5. Add the type's checkbox label to `apps/account`'s `notification-email-form.tsx` (`typeLabel`'s
   `switch`, which also fails to typecheck on a missing case) and its en + sv catalog keys.
6. Add test coverage mirroring `apps/api/src/notification-email.test.ts`'s existing cases for the
   other two types: mailed when on, not when off, in-app row lands either way, rollback enqueues
   no mail, the token only ever verifies for this one type.

A locked type never needs any of this — it keeps using its own existing mail path, untouched by
`notification-email.ts`.

## Testing the one-click flow locally

The unsubscribe token never expires and is derived purely from `TWO_FACTOR_ENCRYPTION_KEY` (HKDF,
not the raw key — see CLAUDE.md), so there is nothing to seed: any dev environment with the usual
env vars can mint and verify one.

1. Run the api with `MAIL_PROVIDER=file` (or `log`) so you can read a mailed link without a real
   provider — see **Email** in `apps/api/README.md`. `apps/e2e` already does this
   (`apps/e2e/.tmp/mail`, `fixtures/mail.ts`).
2. Trigger an optional notification: change a workspace member's role or remove a member. A plan
   change mails only under `BILLING_PROVIDER=stripe` (the webhook mails every owner, the payer
   included); with the default mock provider it mails nobody — see **Known limitations** below.
3. Read the written mail's `headers` field (the `file` provider's JSON now includes it) for
   `List-Unsubscribe: <http://auth.brand.localhost:3002/email/unsubscribe/one-click?token=…>` and
   `List-Unsubscribe-Post: List-Unsubscribe=One-Click`.
4. Simulate the RFC 8058 one-click POST a mail client would send:
   ```bash
   curl -i -X POST "http://auth.brand.localhost:3002/email/unsubscribe/one-click?token=<token>" \
     -d "List-Unsubscribe=One-Click"
   ```
   Expect a `200` with an empty body. A second identical POST answers the same `200` — the write
   is idempotent.
5. Open the body link instead (`${AUTH_URL}/email/unsubscribe?token=…`) in a browser to see the
   confirm page's `valid` state, and click **Turn off these emails** to see the success state.
6. Confirm the setting actually changed on account `/notifications`'s Email card, or with
   `account.notificationPreferences.get()`.

To see the **unavailable** state rather than **invalid**, stop the api (or start the auth app
with `API_URL` pointing at a port nothing listens on, such as `API_URL=http://127.0.0.1:1`) and
reload the confirm page with a real token. Simply unsetting `API_URL` is not enough outside
production, where `@repo/session`'s `loadEnv` falls back to the dev api URL. Repeating step 4 does
not get there: the one-click POST is keyed per token and the confirm page per ip, so they never
share a bucket. Reloading the page itself with a real token more than 60 times in 10 minutes does
(each load's `peek` spends the page's `unsub:<ip hash>` bucket), but a forged or garbled token
never will — it spends nothing and simply shows **invalid**. A `TOO_MANY_REQUESTS` or an
unreachable api must never look like a dead link, since the token itself never expires.

`apps/e2e/tests/notification-email.spec.ts` automates exactly this flow (a real `member.removed`
mail, because the e2e stack runs mock billing, where an in-app plan change mails nobody — see
below) and is the reference if you want a working end-to-end example rather than the manual steps
above.

## Deliverability notes

- **RFC 8058 compliance.** Both headers are required together: `List-Unsubscribe: <https URL>`
  and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. A mailbox provider that supports
  one-click (Gmail, Yahoo, Microsoft) uses the presence of both to show its own "Unsubscribe"
  affordance next to the message, which — done right — measurably reduces spam-button clicks
  (Context7 `/websites/resend`'s guidance, checked 2026-10-21).
- **The endpoint must answer fast and never redirect.** A one-click POST is not a browser
  navigation; it answers `200`/`202` with an empty body and nothing else. The route here never
  redirects, even on failure — it degrades to `429` or `503` instead — because an RFC 8058 sender
  does not follow one.
- **Idempotent and token-scoped.** A provider may retry a one-click POST. Because the token names
  exactly one user and one type and the write is `email_enabled = false` (not a toggle), a retried
  POST is a safe no-op.
- **Shared provider IPs.** Keying the one-click POST's rate-limit bucket on the poster's IP would
  have refused real unsubscribes at scale once enough of them came from the same mailbox
  provider's egress addresses, so it is keyed on the token's hash instead
  (`unsubscribeTokenClientId` in `@repo/session/client`). The api verifies the token before
  spending any budget, so that is one bucket per real link, and an invented token spends nothing.
- **A visible unsubscribe link stays in the body too** (`NotificationFooter`'s "Turn off these
  emails"), even though the header alone would satisfy most mailbox clients — some clients, and
  every browser opening the mail directly, only show the body link.
- **Locked mail carries neither header.** Do not add `List-Unsubscribe` to a locked template: it
  would tell a mailbox provider the message can be suppressed, when in fact turning it off is not
  possible, and "support honours unsubscribe within 48 hours" explicitly carves out transactional
  mail that a recipient cannot opt out of.

## Known limitations (documented, not fixed)

- **Unverified addresses get no optional email.** `enqueueNotificationEmail` checks
  `user.email_verified_at` before enqueueing; an address nobody has proven to own is never mailed
  anything beyond what already applies before this phase, even if its preference is on (the
  in-app row still lands).
- **`plan.changed` mail depends on the billing provider.** The billing mirror never mails the
  owner who made the change, and a workspace has exactly one `owner`, the only one who may call
  `billing.checkout` or `billing.mockChange`. So with the mock provider an in-app plan change
  never mails anyone: the sole owner is the actor and is excluded. With `BILLING_PROVIDER=stripe`,
  an in-app checkout goes through Stripe's webhook, whose actor is `{}`, so every owner is mailed —
  including the one who paid. `apps/api/src/notification-email.test.ts` covers the mail with a
  second, directly-inserted `owner` membership row, and `apps/api/src/notifications.test.ts` the
  webhook path that notifies every owner. The
  e2e stack runs mock billing, so its journey substitutes `member.removed` for the one-click
  mechanics instead (see `apps/e2e/tests/notification-email.spec.ts`'s own comment).
- **Forged tokens are cheap; real ones are bounded.** `peek` and `unsubscribe` verify the token
  (one HMAC, constant time) before spending any budget, so a forged token costs one HMAC and
  spends nothing — it can never drain the shared budget. Real tokens are bounded per link
  (`notification-email:<clientId>`, default 60/10 min) and api-wide (`notification-email:global`,
  default 1000/10 min, shared by both procedures), so a genuine burst of more than 1000 one-clicks
  in 10 minutes answers `429` until the window passes; RFC 8058 senders may retry.
