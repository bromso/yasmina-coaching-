# Invitation domain allowlist — design (Phase 12 C)

Phase 12 "workspace admin depth": A workspace activity log (#112) → B enforced two-step
verification (#113) → **C email-domain allowlist for invitations**. Approved in chat on
2026-10-20. One PR; it completes Phase 12 (ROADMAP B ticked in this PR, C on merge).

## Intent

A workspace owner limits who can be invited to addresses on the organisation's own domains, so
an admin cannot invite a personal or outside address by mistake. Decided with the owner:
- **A restriction, never a grant:** invitations only. No domain auto-join, so no DNS proof of
  domain ownership is needed. Existing members are never touched.
- **Exact domain match:** `acme.com` matches `a@acme.com`, not `a@eu.acme.com` (a subdomain is its
  own entry). Up to 20 domains.
- **Owner only, every plan** — like the two-step requirement; admins send invitations, so letting
  them edit the list would undo it. Changes are audited.

## Basis (checked 2026-10-20)

- Context7 `/owasp/cheatsheetseries`: Input Validation Cheat Sheet — validate email addresses
  syntactically (two parts around `@`, a domain of letters, digits, hyphens and dots, sane
  lengths) and prefer allowlist validation; SSRF Prevention Cheat Sheet — domain-name validation
  must reject strings naive validators accept (`<script>…</script>.owasp.org`); labels
  `[a-z0-9-]`, no leading/trailing hyphen, `xn--` A-labels allowed.
- Bun `node:url` `domainToASCII`, checked by running it (Context7 had no Bun page for it):
  lowercases and converts IDN to A-labels (`Bücher.de` → `xn--bcher-kva.de`, `例え.テスト` →
  `xn--r8jz45g.xn--zckzah`), returns `""` for `exa mple.com`, but passes `-bad.com`, `a..b` and
  `localhost` — so a label check runs after it.
- Context7 `/websites/nodejs_latest-v24_x_api` (`url.domainToASCII`, which Bun implements): returns
  the Punycode serialization, or `""` for an invalid domain (`xn--iñvalid.com`). Running it under
  Bun 1.4.2 also showed the UTS #46 mapping it applies — `Ⓐcme.com` → `acme.com`, the ideographic
  full stop `acme。com` → `acme.com`, upper-case A-labels lowercased — and that it **keeps a
  trailing dot** (`acme.com.` → `acme.com.`) and passes `a_b.com`; so the normaliser strips one
  trailing dot and the label check rejects `_`.
- Context7 `/colinhacks/zod` v4.6 and the repo's `EmailSchema` (`z.string().trim().toLowerCase()
  .pipe(z.email().max(254))`, checked by running it): invitee addresses are already ASCII-only,
  lower-case, single-`@`, with no trailing dot — `a@bücher.de` and `a@acme.com.` are refused
  before any domain check, so an IDN entry (stored as its A-label) matches the A-label form of an
  address (`a@xn--bcher-kva.de`).
- Context7 `/amannn/next-intl` v4.14: lists are formatted with the formatter (`format.list(items,
  { type: "conjunction" })`, `getFormatter()` on the server), not inline message syntax — and
  `Intl.ListFormat` gives "acme.com, acme.se och acme.no" in Swedish where a plain `", "` join
  would not; so every place that shows the list uses list formatting in the reader's locale.
- No legal surface: a list of organisation domains is not personal data, and the feature only
  narrows who can be invited.

## 1. Data

Migration `0031_workspace_invite_domains`: `workspaces.invite_domains` TEXT NOT NULL default
`'[]'` (a JSON array of A-label domains). Empty = any domain (today's behaviour).

## 2. Normalising and matching

- `normalizeInviteDomain(input): string | null` in a Zod-free contract subpath
  (`@repo/api-contract/invite-domains`, also exporting `MAX_INVITE_DOMAINS = 20` and
  `emailDomain(address)`), so the UI validates with the same rule: trim, drop one leading `@`,
  `domainToASCII` (lowercases, applies UTS #46 mapping), strip one trailing dot, then reject when empty, longer than 253, a single label,
  `localhost`, an IPv4/IPv6 literal, a label longer than 63, empty, starting or ending with `-`,
  or containing anything but `[a-z0-9-]`, or a final label shorter than 2 characters. Returns the
  A-label form.
- `normalizeInviteDomains(lines)` dedupes, keeps order, and reports each invalid line (its
  1-based index and text) and an over-limit count.
- An address matches when `normalizeInviteDomain(emailDomain(address))` equals one of the
  workspace's domains exactly. An empty list matches everything.

## 3. Enforcement

- `workspaces.invitations.create` (and re-inviting, which replaces the pending row): an address
  outside a non-empty list → `FORBIDDEN`, `data: { reason: "invite_domain" }`,
  `apiMessage(context, "inviteDomainRestricted", { domains })` — "Invitations to this workspace
  are limited to: {domains}." (en + sv; `domains` formatted with `Intl.ListFormat` in
  `context.locale`, `type: "conjunction"`). The caller is an admin who
  can already see the list, so naming it leaks nothing. Checked before the seat limit and the
  invite rate limit counter.
- `invitations.accept` / `acceptById`: re-check against the current list; outside it →
  `FORBIDDEN` `data.reason: "invite_domain"`, `apiMessage(context, "inviteDomainNoLongerAllowed")`
  — "This workspace no longer accepts invitations to this address." The invitation stays pending
  (it can be revoked or expire). `invitations.preview` gains `domainAllowed: boolean`.
- Existing members, the activity log and `/v1` are unaffected.

## 4. Managing the list

- `workspaces.security.get` gains `inviteDomains: string[]` (admin+, as today).
- `workspaces.security.setInviteDomains({ workspaceId, domains: string[] })` (⚑,
  `member("owner")`, every plan, refused while impersonating). Input up to 20 raw strings; each
  normalised server-side; any invalid → `BAD_REQUEST` `data.reason: "invite_domain_invalid"`
  with the offending values' indexes only (message "Check the highlighted domains."); more than
  20 after dedupe → `BAD_REQUEST` `data.reason: "invite_domain_limit"`. Same normalised list →
  no write, no audit. A change → `auditWorkspace` `workspace.invite_domains_changed`,
  `details: { added: string[], removed: string[] }`, in the same transaction; added to
  `WORKSPACE_ACTIVITY_ACTIONS`, the Activity display allowlist, the GDPR export allowlist and the
  Activity card's sentence + filter (en + sv).

## 5. UI (apps/account, apps/app)

- Workspace page Security card: an **Invitation domains** section. Owner: a textarea (one domain
  per line, label "Allowed invitation domains", hint "Leave empty to allow any address.") and
  **Save invitation domains**; per-line errors reference the line ("Line 2: not a valid
  domain."); success "Invitations are now limited to: …" / "Invitations are open to any
  address." Admin: the list read-only (or "Any address."). Below admin: nothing.
- Invite form: a hint under the email field, "Invitations are limited to: …", when the list is
  non-empty. Pending invitations list: a badge "Outside allowed domains" on a pending invitation
  whose address no longer matches (computed server-side from the list).
- `apps/app` `/invitations/[token]`: when `preview.domainAllowed` is false, the page says "This
  workspace no longer accepts invitations to this address." and shows no **Accept** button.
- Every list of domains shown in the UI is formatted with next-intl's `format.list(…, { type:
  "conjunction" })` (`getFormatter()` server-side), never a hand-joined string.
- en + sv; works without JavaScript; labels unique on each page.

## 6. Testing, docs

- api tests (SQLite + Postgres): a normalisation table (valid: `acme.com`, `ACME.com`,
  `@acme.com`, `Bücher.de`, `sub.acme.co.uk`, `acme.com.` → `acme.com`, `Ⓐcme.com` → `acme.com`,
  `acme。com` → `acme.com`; invalid: `a_b.com`, `localhost`, `acme`, `-acme.com`,
  `a..b`, `1.2.3.4`, `[::1]`, `exa mple.com`, `<script>.com`, a 64-character label, a TLD of one
  letter); create refused/allowed, exact match only (`eu.acme.com` refused under `acme.com`),
  IDN address against an IDN domain; re-invite; accept and acceptById refused after the list
  tightens with the invitation still pending; preview `domainAllowed`; owner-only and
  impersonation refusals; invalid and over-limit inputs; no-op; audit row with added/removed.
- Contract subpath unit tests; account action cores and views; app invitation view; i18n guards.
- e2e: the owner saves `example.com` → inviting an address on another domain shows the refusal →
  inviting an `@example.com` address succeeds → the Activity card shows the change.
- Docs: CLAUDE.md (an **Invitation domains.** paragraph; migration; Workspaces and Activity log
  cross-refs; e2e counts), `apps/api`, `apps/account`, `apps/app`, `packages/api-contract`
  READMEs, a short guide section, ROADMAP (B ticked as #113 now; C on merge).

## Out of scope

Domain auto-join and DNS verification; subdomain wildcards; flagging or removing existing members
outside the list; a per-role allowlist.
