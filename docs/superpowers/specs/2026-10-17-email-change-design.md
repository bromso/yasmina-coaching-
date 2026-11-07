# Email change — design (Phase 10 A)

Phase 10 "deepen what exists" (owner, 2026-10-17): A email change → B suspend users → C audit
retention and export. Each its own spec, plan and PR. This is A.

## Intent

Let a signed-in user change their account email from `apps/account` → Personal info, safely: the
new address is proven before the switch, the old address is told before and after, and someone who
changed it with a stolen session can be undone from the old mailbox. Today there is no way to change
an email at all (`apps/api/README.md` already names what such a flow must do: reset verification
and send a new verify link — here the confirmation link *is* the verification).

Decided with the owner:
- Old-address protection: a notice when the change is requested (with **Cancel this change**) and
  a notice when it is confirmed with a single-use **This wasn't me** undo link valid 7 days.
- On confirmation every *other* session ends; the confirming browser stays signed in.
- Accounts without two-step are **not** asked to confirm from the old mailbox (OWASP's stricter
  option): users who lost the old mailbox must still be able to change it. The before/after notices
  and the undo link are the mitigation. A deliberate departure from the OWASP Authentication Cheat
  Sheet's "Changing A User's Registered Email Address" (checked via Context7, 2026-10-17).

## 1. Data and policy (`apps/api`)

- Migration `0025_email_change`: two new `tokens` purposes, `email_change` (holds the user id and the
  new address, 24 h) and `email_change_revert` (holds the user id and the old address, 7 days), plus
  `email_change_cancel` (holds the user id, 24 h — the request-time cancel link). Hashed, single use,
  like every one-time token. No new table.
- `account.email.requestChange({ newEmail, password?, code? })` (⚑):
  - refused while impersonating (`FORBIDDEN` "Not available while impersonating");
  - re-authentication: the shared fresh-credential rule (current password on an account with one —
    `UNAUTHORIZED` `data.reason: "password"`; else a session under `REAUTH_WINDOW_MS` —
    `FORBIDDEN` `data.reason: "reauth"`), **and**, when two-step verification is on, a current
    authenticator or recovery code checked like `account.twoFactor.disable` (same limiter
    `2fa:manage:<id>`; `UNAUTHORIZED` with `data.reason: "code"` on a wrong code);
  - `newEmail` normalised like sign-up, must differ from the current address (`BAD_REQUEST`);
  - limiter `email-change:<userId>` 3 per 15 minutes (`TOO_MANY_REQUESTS`);
  - a new request replaces a pending one (its `email_change` and `email_change_cancel` tokens are
    voided);
  - if the address belongs to another account: nothing is created or sent, and the answer is the
    same as success — no account-existence oracle;
  - otherwise: an `email_change` token, mail `emailChangeConfirm` to the new address
    (`${ACCOUNT_URL}/email/confirm?token=…`), an `email_change_cancel` token and mail
    `emailChangeRequested` to the current address (masked new address; `${AUTH_URL}/email/cancel?token=…`);
  - answers `{ pending: maskedNewEmail, expiresAt }`.
- `account.email.get()` (⚑): `{ email, pending: { maskedEmail, expiresAt } | null }` for the card.
- `account.email.confirmChange({ token })` (⚑, the user the token names must be the caller, else
  `BAD_REQUEST` "This link is for another account"): one transaction, user row locked first:
  - an unknown, used or expired token → `BAD_REQUEST`;
  - re-check the address is still free (`CONFLICT` "That address is now in use");
  - set `email`, mark it verified (`email_verified_at = now`), void the account's open
    `password_reset` / `email_verify` / `magic_link` / `email_change_cancel` tokens, end every other
    session (`stampSessionsRevoked` semantics: every session except the caller's);
  - issue an `email_change_revert` token for the old address; mail `emailChanged` to the old address
    with `${AUTH_URL}/email/revert?token=…`;
  - audit `user.email_changed` (old and new address masked in metadata);
  - billing: `billing_customers.email` that held the old address follows the new one (the provider
    is not told — documented, like the privacy purge's handling).
- `auth.emailChange.cancel({ token })` (anonymous, button-consumed): voids the pending
  `email_change`, ends every session of the account (the request may have come from a stolen one),
  audit `user.email_change_cancelled`.
- `auth.emailChange.revert({ token })` (anonymous, button-consumed): one transaction, user row
  first: restores the old address if still free (`CONFLICT` otherwise — then the user must contact
  support), marks it verified, ends every session, deletes every passkey and every pending one-time
  token of the account, and when the account has a password clears it and mails a
  `resetPassword` link to the restored address (whoever changed the email may know the password);
  two-step stays as it was (an admin reset covers a planted factor); audit `user.email_change_reverted`;
  mail `emailChangeReverted` to the restored address.
- Provider identities stay linked through every step (they key on provider user id, not email).
- Locale per mail as for the existing mails: the account's saved locale, else the request locale.
- Templates (en + sv, test + story each): `emailChangeConfirm`, `emailChangeRequested`,
  `emailChanged`, `emailChangeReverted`.

## 2. UI

- `apps/account` Personal info: an **Email address** card — the current address and its verified
  state; **Change email** form (new address; current password when the account has one, otherwise
  the reauth link like two-step's; an authenticator code field when two-step is on); after a request
  "Check n***@… — the link expires at …" with **Send again**. Read-only while impersonating.
- `apps/account` `/email/confirm?token=…`: a **Confirm new email** button (never consumed on load);
  success shows the new address; errors in place.
- `apps/auth` `/email/cancel?token=…` and `/email/revert?token=…`: anonymous pages with one button
  each (**Cancel this change** / **Restore my email**), consumed only by the button; after a revert,
  "Your email is restored. Check it for a link to set a new password." All translated (en + sv);
  i18n guards stay green. `/email/*` is disallowed in auth's robots like `/magic`.

## 3. Testing

- api (SQLite and Postgres): request rules (reauth, 2FA code, impersonation, limiter, same address,
  taken address answers identically and sends nothing); confirm (wrong account, expired, address
  taken meanwhile, sessions ended except the caller's, other tokens voided, revert token issued);
  cancel; revert (restores, ends sessions, deletes passkeys, clears password and mails a reset link,
  conflict when the old address was taken); a confirm racing a revert and a confirm racing a second
  request (both on Postgres with the overlap helper); mails and their locales; audit rows.
- account / auth action cores, i18n guards; templates' tests; stories.
- e2e: request → confirm from the mailbox (`apps/e2e` reads `MAIL_DIR`) → sign in with the new
  address; then revert from the old address's mail → sign in with the old address via the reset link.
- Docs: CLAUDE.md (an **Email change.** paragraph under Authentication), apps/api, account, auth
  READMEs, `docs/guides/` (a section in the auth or account guide), help center article on changing
  your email, ROADMAP Phase 10 list with A ticked on merge.

## Out of scope

Changing email for provider-only identities' *provider* email; letting admins change a user's email
(Phase 10 B's admin tooling may revisit); confirmation from the old address (see Intent).
