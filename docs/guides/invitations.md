# Invitations: the allowed-domains list

A workspace owner can limit who may be invited to addresses on the organisation's own email
domains — `acme.com`, say, so a teammate can invite `new-hire@acme.com` but not their personal
Gmail address by mistake. See CLAUDE.md's **Invitation domains.** paragraph and
`apps/api/README.md`'s own section for the full mechanism (the normaliser, the fixed refusal order,
the fail-closed rule); this is the short, practical version for whoever is turning it on.

## Setting the list

An owner opens `apps/account`'s Workspace page, the **Security** card, **Invitation domains**
section — below the two-step requirement. One domain per line (`acme.com`, not `@acme.com` or a
URL; a leading `@` is trimmed for you, and an uppercase or internationalised domain is accepted and
stored in its normalised form). **Save invitation domains** applies the list at once, confirmed by
"Invitations are now limited to: acme.com." A line that is not a domain is refused by line number
("Line 2: not a valid domain."); nothing is saved until every line is valid. Leaving the textarea
empty and saving removes the restriction — "Invitations are open to any address." — exactly the
behaviour every workspace had before this feature existed.

**Matching is exact.** `acme.com` admits `a@acme.com`, never `a@eu.acme.com` or
`a@acme.com.evil.com` — a subdomain is its own, separate entry if it should be allowed too. Up to
20 domains.

## What admins and invitees see

- **Admins** (and an owner who is impersonating) see the same list, read-only, on the same card —
  or "Any address." when none is set. Only the owner can change it.
- **The invite form** shows a hint under the email field, "Invitations are limited to: acme.com.",
  whenever a list is set, so an admin sees the restriction before typing an address that would be
  refused.
- **A refused invite** shows the api's own message in place, naming the allowed domains — the
  admin sending it can already see the list on the same page, so naming it again leaks nothing.
- **An invitee** who opens the invitation link (`apps/app`'s `/invitations/[token]`) sees nothing
  different *unless* the workspace's list changed after the invitation was sent and now excludes
  their address — see below.

## Pending invitations

Tightening the list does not touch an invitation already sent. It stays pending, and:

- The account's Workspace page shows it with an **Outside allowed domains** badge, so an admin can
  see at a glance which pending invitations the current list would no longer allow.
- Opening the invitation link shows "This workspace no longer accepts invitations to this
  address." in place of **Accept** — and, for a visitor who is not yet signed in, the **Sign in** /
  **Create account** links are hidden too, since signing in would only lead to the same refusal.
  A signed-in visitor still sees **Sign out**, the page's usual control — switching accounts
  would not help, since the refusal is about the invitation's address, not who is signed in.
- The invitation is never silently revoked: an admin can still **Revoke** it, it still expires on
  its own schedule, or the owner can widen the list again and the same link starts working.
- Re-inviting an address outside the current list is refused the same way a fresh invite is — the
  old pending row (and its link) is left exactly as it was.

## Out of scope

- **No domain auto-join.** Owning a domain on this list never lets anyone with an address on it
  join on their own — an invitation (or an accepted one already in the workspace) is still
  required. There is no DNS ownership proof to set the list up, precisely because it restricts
  invitations rather than granting membership.
- **No subdomain wildcards.** `acme.com` does not also admit `eu.acme.com`; list both if both
  should be allowed.
- **Existing members are never affected.** The list only changes who can be *invited* from this
  point on — nobody already in the workspace is flagged, warned about or removed for being on a
  different domain.
- **No per-role allowlist.** One list per workspace, applied to every invitation regardless of the
  role being offered.
