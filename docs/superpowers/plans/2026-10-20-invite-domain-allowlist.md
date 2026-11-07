# Invitation Domain Allowlist Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A workspace owner limits invitations to addresses on listed email domains; invitations and accepts outside the list are refused.

**Architecture:** `workspaces.invite_domains` + a shared, Zod-free normaliser (`@repo/api-contract/invite-domains`) used by the api and the UI; checks in `invitations.create` / `accept` / `acceptById` / `preview`; `workspaces.security.setInviteDomains` (owner, audited); an Invitation domains section in the account Security card, hints and badges on the invite UI, and a refusal on the app's invitation page.

**Tech Stack:** Bun.sql (SQLite + Postgres), `node:url` `domainToASCII`, oRPC, Next 16 + next-intl, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-20-invite-domain-allowlist-design.md`

## Global Constraints

- Migration `0031_workspace_invite_domains`: `workspaces.invite_domains` TEXT NOT NULL default `'[]'`; empty = any domain.
- `@repo/api-contract/invite-domains` (Zod-free): `normalizeInviteDomain(input): string | null` (trim, drop one leading `@`, `domainToASCII` (UTS #46 mapping), strip one trailing dot, then reject empty, > 253, single label, `localhost`, IPv4/IPv6 literal, label > 63 / empty / leading or trailing `-` / non `[a-z0-9-]`, final label < 2), `normalizeInviteDomains(lines)` (dedupe, keep order, invalid indexes, over-limit), `emailDomain(address)`, `MAX_INVITE_DOMAINS = 20`. Exact match only. Invitee addresses already pass `EmailSchema` (ASCII-only, lower-case, single `@`, no trailing dot), so an IDN entry matches the address's A-label form.
- Refusals: create (and re-invite) outside the list → `FORBIDDEN` `data.reason: "invite_domain"`, key `inviteDomainRestricted` "Invitations to this workspace are limited to: {domains}." (checked before seats and the invite limiter; `{domains}` formatted with `Intl.ListFormat(context.locale, { type: "conjunction" })`); accept/acceptById outside → `FORBIDDEN` `data.reason: "invite_domain"`, key `inviteDomainNoLongerAllowed` "This workspace no longer accepts invitations to this address.", invitation stays pending; `invitations.preview.domainAllowed`. en + sv. Error `data` carries only reason codes and line indexes — never addresses.
- `workspaces.security.get` gains `inviteDomains`; `workspaces.security.setInviteDomains({ workspaceId, domains })` owner only, every plan, refused while impersonating; invalid → `BAD_REQUEST` `invite_domain_invalid` (+ indexes) "Check the highlighted domains."; > 20 → `BAD_REQUEST` `invite_domain_limit`; no-op writes nothing; change → `auditWorkspace` `workspace.invite_domains_changed` `details: { added, removed }` in the same transaction, added to `WORKSPACE_ACTIVITY_ACTIONS`, both allowlists and the Activity card (en + sv).
- UI: Security card **Invitation domains** section (owner textarea "Allowed invitation domains", hint "Leave empty to allow any address.", **Save invitation domains**, per-line errors "Line N: not a valid domain.", success messages; admin read-only or "Any address."; below admin nothing); invite form hint "Invitations are limited to: …"; pending-invitation badge "Outside allowed domains"; app `/invitations/[token]` refusal text and no Accept button when `domainAllowed` is false. every shown list formatted with next-intl `format.list(…, { type: "conjunction" })` (`getFormatter()` server-side), never a hand-joined string. en + sv, no JS needed, labels unique.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly (never docker prune/rm/rmi/system prune; if Docker is out of disk, stop and report BLOCKED). Client components never import `@repo/sites` root or contract roots (Zod-free subpaths only). Never `mock.module` a first-party module that has its own test. Postgres tests: `TEST_DATABASE_URL="postgres://jonasbroms@[::1]:5432/postgres"`, `--timeout 30000`. Account `/security` has 0.4 KB of bundle headroom: add no client JS there.

## Review Focus

1. An entry or address that dodges the match: upper case, a trailing dot on the entry (`acme.com.`), UTS #46 look-alikes (`Ⓐcme.com`, `acme。com`), Unicode vs A-label forms, `_`, whitespace — the entry normalised to one A-label form, the address compared in its `EmailSchema` form, refused unless they match exactly (Tasks 1–2).
2. A pending invitation sent before the list tightened can never be accepted while outside it, through `accept` or `acceptById`, and stays pending (Task 2).
3. A re-invite of an address outside the list is refused and leaves the old pending row as it was (Task 2).
4. Error data or messages never echo the invitee's address; a refused create never consumes a seat check or the invite rate-limit budget (Task 2).
5. An empty list behaves exactly as before for every path (Tasks 2–3).

---

### Task 1: Normaliser and storage

Contract subpath `invite-domains` (exports, `package.json` `exports` entry, client-imports guard allows it) + unit tests incl. the spec's table and Review Focus 1; migration 0031 (+ migrate test both engines); `workspaces.security.get` `inviteDomains`; `setInviteDomains` with validation, no-op, audit (action + allowlists + display), messages en + sv. Tests both engines.
- [ ] Commit `feat(api): store a workspace's allowed invitation domains`.

### Task 2: Enforce on invitations

`invitations.create` / re-invite / `accept` / `acceptById` / `preview.domainAllowed`; messages en + sv; tests both engines incl. Review Focus 1–5.
- [ ] Commit `feat(api): limit invitations to a workspace's allowed domains`.

### Task 3: UI

Account Security card section, invite form hint, pending badge, Activity sentence + filter (fixes the account typecheck the new action breaks); app invitation page refusal; en + sv; action cores, views, i18n guards; bundle budgets (controller adds if a route changes).
- [ ] Commit `feat(account): manage a workspace's allowed invitation domains`.

### Task 4: e2e

`apps/e2e/tests/invite-domains.spec.ts`: owner saves `example.com`; inviting an address on another domain shows the refusal; inviting an `@example.com` address succeeds; the Activity card shows the change. Update e2e counts in README and CLAUDE.md. Controller runs Playwright.
- [ ] Commit `test(e2e): limit invitations to allowed domains`.

### Task 5: Docs

CLAUDE.md (**Invitation domains.** paragraph; migration; Workspaces, Activity log cross-refs), `apps/api`, `apps/account`, `apps/app`, `packages/api-contract` READMEs, a short guide section, ROADMAP (tick B as merged in #113; C unticked).
- [ ] Commit `docs: invitation domain allowlist`.
