# Invitation domains

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Invitation domains.** Phase 12 C: a workspace owner can limit who may be invited to addresses on
the organisation's own domains — a restriction only, never a grant: no domain auto-join, so no DNS
proof of ownership is needed, and existing members are never touched. Migration
`0031_workspace_invite_domains` adds `workspaces.invite_domains TEXT NOT NULL DEFAULT '[]'`, a JSON
array of A-label domains; an empty list (every workspace's value before this phase) means any
address. The normaliser, `@repo/api-contract/invite-domains` (Zod-free, so a client bundle never
pulls in zod or the contract): `normalizeInviteDomain(input)` trims, drops one leading `@`, refuses
a line holding whitespace, a control character or `/ \ ? # @ : %` (`acme.com/x`, `acme%2ecom` and
`a@b.com` would otherwise parse to `acme.com`/`b.com`, and the URL parser drops an inner tab or
newline silently), then converts with `toASCII` — `new URL("http://" + d).hostname`, the WHATWG URL
host parser, in place of `node:url`'s `domainToASCII` (Next's `next/dist/compiled/native-url`
browser shim has no such function, so `apps/account` normalises with the very same rule the api
does): it lower-cases, applies the UTS #46 mapping (`Ⓐcme.com` and `acme。com` → `acme.com`) and
Punycode, proven identical to `domainToASCII` under Bun and in a real browser on the spec's table.
One trailing dot is then stripped (`acme.com.` → `acme.com`), and the result is refused when empty,
longer than 253, a single label (`localhost` included), an IPv4/IPv6 literal, or holding a label
that is empty, longer than 63, starts or ends with `-`, holds anything but `[a-z0-9-]` (so `a_b.com`
and `<script>.com` are refused), or whose final label is shorter than 2 characters or all digits.
Matching is exact only: `acme.com` admits `a@acme.com`, never `a@eu.acme.com` — invitee addresses
already pass `EmailSchema` (ASCII-only, lower-case, single `@`, no trailing dot), so an IDN entry
(stored as its A-label) matches the A-label form of the address. `normalizeInviteDomains(lines)`
dedupes, keeps first-seen order, and reports each invalid line by its 0-based index (the UI maps it
to "Line N") plus whether more than `MAX_INVITE_DOMAINS` (20) remain; the input itself is bounded to
100 lines of up to 1000 characters each, generous on purpose so a list over 20 after dedupe is still
refused by index rather than a bare Zod `400`. Saving the identical set of domains (reordered or
not) is a no-op: nothing is written and nothing audited.

Enforcement: `workspaces.invitations.create` (and re-inviting, which replaces the pending row) runs
the domain check first — before the invite limiters record a hit, before the already-member check
and before the seat check — refusing an address outside a non-empty list with `FORBIDDEN`
`data.reason: "invite_domain"` and `apiMessage(context, "inviteDomainRestricted", { domains })`,
"Invitations to this workspace are limited to: {domains}." (en + sv), `{domains}` formatted with
`new Intl.ListFormat(context.locale, { type: "conjunction" })` — the caller is an admin who can
already see the list, so naming it leaks nothing. `invitations.accept` and `acceptById` re-check
the current list inside the accept's own transaction, which now locks the workspace row
(`workspaces.lockForOwnership`) before the invitation — the same order every workspace writer
takes, `deleteWorkspaceInTx` included, which fixed a Postgres deadlock between a delete and a
concurrent accept and, as a side effect, serialises concurrent accepts into one workspace (which
also makes the seat check race-free). The refusal order is fixed: not found/expired, then the
address mismatch, then an unverified email, then the domain list, then — new member only — the
seat limit. An address the list no longer allows answers `FORBIDDEN` `data.reason: "invite_domain"`
and `apiMessage(context, "inviteDomainNoLongerAllowed")`, "This workspace no longer accepts
invitations to this address."; the invitation stays pending (revocable or left to expire), never
consumed. `invitations.preview` gains `domainAllowed: boolean`. A stored value that is not a JSON
array of strings fails closed (`inviteDomainsOf` returns null): every enforcing path treats null as
"allow no address" and records the failure (`recordFailure`, the workspace id only, never an
address) rather than reading it as the empty, allow-all list; only `workspaces.security.get`'s
display shows it as `[]`, flagged no further.

Managing the list: `workspaces.security.get` gains `inviteDomains: string[]` (admin and up, as
today). `workspaces.security.setInviteDomains({ workspaceId, domains })` (⚑, `member("owner")`,
every plan, refused while impersonating) normalises every line server-side; an invalid one is
`BAD_REQUEST` `data: { reason: "invite_domain_invalid", indexes }` (the offending lines' indexes
only, never their text) "Check the lines listed below."; more than 20 after dedupe is `BAD_REQUEST`
`data.reason: "invite_domain_limit"` "You can list up to 20 domains." A real change runs in one
transaction (locked, re-read, re-compared, so concurrent identical saves still audit once) and
writes `auditWorkspace` `workspace.invite_domains_changed`, `metadata: { added, removed }` (see
**Activity log.**).

UI (`apps/account`, `apps/app`): the Workspace page's Security card gets an **Invitation domains**
section below the two-step requirement — the owner (not impersonating) a textarea, "Allowed
invitation domains", hint "Leave empty to allow any address." and **Save invitation domains**, with
per-line errors naming the line ("Line 2: not a valid domain."); an admin (or an impersonating
owner) the list read-only, or "Any address."; below admin, nothing. The domains are shown in their
Unicode form (`node:url`'s `domainToUnicode`, server-only) and, like every list of domains the UI
shows, formatted with next-intl's `format.list(…, { type: "conjunction" })` — never a hand-joined
string, since Swedish ends a list with "och", not a comma. The invite form gets a hint under the
email field, "Invitations are limited to: …", when the list is non-empty; the pending invitations
list gets an "Outside allowed domains" badge on a pending invitation whose address no longer
matches (computed server-side). `apps/app`'s `/invitations/[token]` hides **Accept** — and, since
they would lead nowhere, the signed-out **Sign in** / **Create account** links too (**Sign out**
stays) — once `preview.domainAllowed` is false, showing "This workspace no longer accepts
invitations to this address." instead. Basis (checked 2026-10-20): OWASP's Input Validation Cheat
Sheet (validate an email's domain syntactically and prefer allowlist validation) and SSRF
Prevention Cheat Sheet (domain validation must reject strings a naive validator accepts); no legal
surface, since a list of organisation domains is not personal data and the feature only narrows who
may be invited. See `apps/api/README.md`, `apps/account/README.md`, `apps/app/README.md`,
`packages/api-contract/README.md` and `docs/guides/invitations.md`.
