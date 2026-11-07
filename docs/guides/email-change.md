# Changing an account's email

A signed-in user can change the address they sign in with from `apps/account`'s Personal info —
the new address is proven by a confirm link before the switch takes effect, and the old address is
told before and after, with a single-use "This wasn't me" undo link. See CLAUDE.md's **Email
change** paragraph for the full behaviour in one place and `apps/api/README.md`'s own section for
the procedure-by-procedure reference; this guide covers the three design decisions behind it and
what they cost.

## Why no confirmation from the old mailbox

The OWASP Authentication Cheat Sheet's stricter option for "Changing A User's Registered Email
Address" holds a change until the *old* address confirms it too, not only the new one. This repo
deliberately does not do that: a user who has lost access to the old mailbox — the common reason
someone changes their email in the first place — must still be able to change it. Instead:

- A notice goes to the old address the moment the change is **requested**, with a **Cancel this
  change** link (`${AUTH_URL}/email/cancel?token=…`, 24 hours).
- A second notice goes to the old address once the change is **confirmed**, with a "This wasn't
  me" undo link (`${AUTH_URL}/email/revert?token=…`, 7 days).
- Confirming a change ends every other session at once, so a session hijacked to request the
  change does not get to keep using it once the address visibly changed.

These before/after notices and the 7-day undo window are the accepted mitigation in place of a
hard confirmation gate. Whoever still reads the old mailbox has a week to notice and undo; whoever
does not never had a way back in regardless.

## The taken-address ruling: no existence oracle

`account.email.requestChange` runs every step — the re-authentication check, the rate limit, the
token writes, the notice to the current address — identically whether `newEmail` belongs to no
account or to someone else's. The only difference is that the confirm mail to the taken address is
withheld. `account.email.get` therefore shows the same pending state either way, so neither
procedure can be used to probe whether an address has an account. The stored change simply expires
in 24 hours if nobody ever confirms it (they can't — it was never mailed the link), and if someone
pins a captured token onto it anyway, `confirmChange`'s own address re-check inside its transaction
(backed by the unique index) answers `409 CONFLICT`.

## An unverified account squatting the old address

A change frees the old address. Whoever made it (a stolen session and password are enough) could
sign that address up straight away — a sign-up needs no proof of the mailbox — so that the owner's
"This wasn't me" link would find the address taken and answer `CONFLICT`. The revert link itself
proves the old mailbox, so an account on that address whose email was **never verified** is a
squatter by the same rule `purgeUnverifiedAccount` already applies to a pre-registered address: the
revert displaces it inside its own transaction. Its row is locked after the reverting account's
(ascending id order — a sign-up after the change always has the higher id; a lower one is refused
rather than risk a deadlock), it is deleted with the privacy purge's own `users.purge` (sessions,
one-time tokens, identities, passkeys, files queued for deletion), audited `user.displaced_by_revert`
(the actor null — the system — with the address masked and the reverted account's id), and only then
is the address restored. A **verified** holder is never displaced: it answers `CONFLICT` as before,
and so does an unverified one that somehow belongs to a workspace (unreachable through the api,
since creating or joining one needs a verified email, so it owns no workspace and no billing). A
sign-up racing the revert loses on the unique index either way — a clean `CONFLICT` for whichever
request comes second, never a `500`, and a refused revert leaves its link usable.

The reverse case is covered too: someone who signed up with the owner's address, unverified, can
request a change to their own mailbox before the owner arrives. When the owner later proves the
address with a magic link or a provider's verified email, `purgeUnverifiedAccount` voids every
`email_change`, `email_change_cancel` and `email_change_revert` link of the account along with the
squatter's sessions and password — so the squatter's confirm link, which the owner could otherwise
be talked into pressing while signed in, is dead.

One case still needs support: if the owner signs in to the decoy account on the old address with a
magic link *before* pressing the undo link, that sign-in verifies the decoy, so it is no longer an
unverified squatter and the revert answers `CONFLICT`. Avoiding that would mean reserving the old
address on every sign-up path for the 7 days a revert link lives; that was judged not worth it.

## The rollback window on revert

`auth.emailChange.revert` is the undo link's destination. It restores the old address, ends every
session, deletes every passkey, and — this is the part that needed its own ruling — rolls back
whatever **security-relevant change happened since the email change was requested**, not since it
was confirmed:

- A sign-in provider linked since is disconnected.
- Two-step verification turned on since is turned off (one that was already on *before* the
  request stays on; a superadmin's reset at `apps/auth`'s `/admin/users/<id>` is the way to turn
  that off instead, same as for a lost authenticator).
- An account deletion requested since is cancelled.

The cutoff is the **request** time, not the confirm time, because an attacker holding the account
between those two moments (minutes, typically — but not bounded) could otherwise link a provider
or turn on their own two-step factor in the gap and have it survive the owner's revert. The cutoff
travels inside the revert token itself (a `requested_at` column, stamped from the consumed
`email_change` token's own `created_at`), so it needs no second lookup.

**Why only the attacker's identity link is undone, not every link.** A link created *before* the
request is the account owner's own, made in good faith; undoing it on every revert would punish
the legitimate owner for using the feature that is supposed to protect them.

**Why only newer revert tokens are voided, not every one.** Picture an account changed twice in a
row — A → B → C, with a revert link mailed to A after the first change and a second mailed to B
after the second. Voiding *every* other live revert token on each revert would let whoever holds B
(if it's an attacker who made both changes) consume the B-addressed link first and thereby kill the
owner's older A-addressed link before they ever see it — the undo would be defeated by making a
second change. The api voids only revert tokens issued **after** the one just used
(`tokens.invalidateForUserAfter`, ordered by row id, not by time), so the **oldest** link always
wins: using the A-link kills the B-link (and any other change made since), but the B-link can never
kill the A-link. The accepted cost: an older revert link — to an address the account held before
either change — stays live for the rest of its own 7 days even after a newer one is used. If that
older address was itself compromised, it stays a live attack surface for up to a week. That is the
trade for guaranteeing the owner's own, earliest undo link always works.

## Known, accepted races

Two narrow races are documented rather than closed, because closing them needs machinery (a global
serialisation point across unrelated writes) disproportionate to the risk:

- **A password sign-in racing a session-ending write.** Only a two-factor challenge checks
  `users.sessions_revoked_at` before turning into a session; a plain password sign-in does not, so
  one that lands at the same instant as a `confirmChange`, `cancel` or `revert` committing could in
  principle create a session a moment after the others were all ended. This is a pre-existing
  property of every session-ending write in this codebase (password reset, "sign out everywhere
  else", an admin's two-step reset), not specific to email change.
- **A two-step enable racing a revert.** `account.twoFactor.enable` already in flight when a
  `revert` commits can still stamp its factor with a time after the revert's cutoff — but it needs
  a live session on the account, which the revert's own transaction just ended, so the window is a
  single in-flight request, not an standing exposure.

## Testing

`apps/api/src/email-change.test.ts` drives every rule above directly against the database,
including seven Postgres-only overlap tests in three groups (confirm, cancel and revert under real
overlap; `overlapNextTransactions` holds two transactions open at once and fails the test after
5 s if one never opens, while the two sign-up-versus-revert races gate the competing transactions
with `patchTransactions` instead) that prove the taken-address, cancel-versus-confirm, second-change,
same-link and sign-up-versus-revert races each resolve one clean way.
`apps/e2e/tests/email-change.spec.ts` is the one browser journey: request a change, confirm it from
the mailed link while still signed in as the old account, sign in with the new address, then undo
it from the old address's mail and sign back in with a new password from the mailed reset link; a
second test requests a change and cancels it instead. See `apps/account/README.md` and
`apps/auth/README.md` for where each half of the UI lives.
