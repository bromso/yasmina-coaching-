# Audit Retention and Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Audit rows lose their ip/user agent after 90 days and are deleted after 365 (env-bounded per CNIL 2021-122), and superadmins export a period of the audit log as CSV or JSON Lines from `/admin/audit`, every export itself audited.

**Architecture:** env validation + a nightly `audit.prune` job in `apps/api`; a pure CSV/JSONL encoder and an `admin.audit.export` procedure returning a `File`; an Export card on `/admin/audit` posting to a same-origin route handler in `apps/auth` that streams the file.

**Tech Stack:** Bun.sql (SQLite + Postgres), oRPC, the existing job queue, Next 16 route handlers, Playwright. No new dependency.

**Spec:** `docs/superpowers/specs/2026-10-18-audit-retention-design.md`

## Global Constraints

- Env: `AUDIT_PII_RETENTION_DAYS` default 90, integer ≥ 1 and strictly < `AUDIT_RETENTION_DAYS`; `AUDIT_RETENTION_DAYS` default 365, integer 180–1095, up to 3650 only with `AUDIT_RETENTION_JUSTIFIED=true` (then one startup warning asking the operator to document the justification); invalid → the api exits at boot naming the problem. No `off`.
- `audit.prune` cron `45 3 * * *`: strip `ip`/`user_agent` where `at` < now − pii days, delete where `at` < now − row days (strict `<`; a row exactly at the boundary is kept), batches of 1000 by id, `signal` checked between batches, worker `now()`, logs `audit pruned` with counts. No migration (`audit_log_at` index). Only `audit.prune` updates/deletes audit rows.
- `admin.audit.export({ from, to, format, actorId?, targetType?, targetId? })`: `YYYY-MM-DD`, `from` ≤ `to`, ≤ 366 days apart, whole UTC days inclusive; `csv | jsonl`; superadmin only, `NOT_FOUND` otherwise (impersonation included); limiter `audit-export:<adminId>` 10/h; oldest first (`at, id`); cap 100 000 → `CONFLICT` "Narrow the date range: more than 100 000 entries match."; columns `id, at, actor_id, actor_email, impersonated_id, impersonated_email, action, target_type, target_id, reason, ip, user_agent, metadata`; CSV RFC 4180 all quoted, CRLF, UTF-8 BOM, header row, formula guard (`=`, `+`, `-`, `@`, tab, CR → leading `'`); JSONL one object per line, `metadata` parsed when valid JSON; file `audit-<from>-<to>.csv|.jsonl`; then audit `audit.exported` `{ from, to, format, rows, actorId?, targetType?, targetId? }` (never inside the file; nothing on refusal).
- `admin.audit.list` output gains `retention: { piiDays, rowDays }`.
- `apps/auth`: POST `/admin/audit/export` route — admin gate (404), `assertSameOrigin`, `Content-Disposition: attachment`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`; refusals 303 to `/admin/audit?exportError=<code>` keeping filters. English only. Works without JavaScript.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings. Implementers never run Playwright, `bun run ci`/`validate`, or any docker command. Client components import contract values only via Zod-free subpaths and never `@repo/sites` root.

## Review Focus

1. A row exactly at a retention boundary, and a first night after upgrade with a large backlog → boundary row untouched; the backlog drains in batches across runs without one long transaction (Task 1 tests).
2. An export whose `to` is today → today's rows up to now are included (inclusive whole UTC days); `from` > `to` or > 366 days refused (Task 2 test).
3. Values containing `"`, commas, newlines, a leading `=`/`-`/`@`, and `metadata` with commas → one well-formed CSV record each, guarded (Task 2 test).
4. A cross-site POST, an impersonation session, or a non-admin hitting the export → refused without an `audit.exported` row (Tasks 2, 3 tests).
5. The `audit.exported` row never appearing in the export it describes, and a refused export writing none (Task 2 test).

---

### Task 1: Retention

Env parsing/validation in `apps/api/src/env.ts` (+ env tests), the startup warning; `audit.prune` job in `apps/api/src/jobs/builtin/` (follow `analytics.prune`: retention passed through the job context like `ctx.analyticsRetentionDays`), the schedule in `registry.ts`; `queries/audit.ts` `stripNetworkBefore(cutoff, limit)` / `deleteBefore(cutoff, limit)` returning counts; `admin.audit.list` output `retention` (contract `AuditPageSchema` + router). Tests on SQLite and Postgres incl. Review Focus 1.
- [ ] Commit `feat(api): audit log retention`.

### Task 2: Export procedure

`apps/api/src/audit-export.ts` (pure: `toCsv(rows)`, `toJsonl(rows)`, `guardCell`), contract `admin.audit.export` (input schema, `File` output, declared `NOT_FOUND`/`CONFLICT`/`TOO_MANY_REQUESTS`/`BAD_REQUEST`), `queries/audit.ts` `countForExport` / `listForExport` (emails joined), the handler (cap overridable through test-server options), the limiter, the `audit.exported` row. Tests incl. Review Focus 2–5.
- [ ] Commit `feat(api): export the audit log as CSV or JSON Lines`.

### Task 3: auth UI

`/admin/audit`: the limits line from `retention`, an **Export** card (From/To defaulting to the last 30 UTC days, Format, current filters hidden; plain POST form), the `exportError` notice; `src/app/admin/(gated)/audit/export/route.ts` (follow the CV route and `apps/auth/src/lib/cv-download.ts`; a testable core in `src/lib/`). Tests: route core (gate, same-origin, headers, refusal redirects keeping filters), view (defaults, hidden filters, limits line, notice). Bundle-budget for auth (controller adds budgets for any new route).
- [ ] Commit `feat(auth): export the audit log and show its retention`.

### Task 4: e2e

`apps/e2e/tests/audit-export.spec.ts`: the existing superadmin fixture does an action that writes an audit row, opens `/admin/audit`, exports CSV for today, checks the download's filename, BOM/header and that the row is present; reloads and sees `audit.exported`. Controller runs Playwright.
- [ ] Commit `test(e2e): export the audit log`.

### Task 5: Docs

CLAUDE.md (**Admin** paragraph's "retention and export are not built" → an **Audit retention and export** paragraph; env table rows; `audit.prune` in **Jobs**; e2e counts); `docs/guides/operations.md` (bounds and the CNIL/GDPR basis, justifying longer, the backup overlap, the tamper-evidence gap and shipping exports to append-only storage); `apps/api/README.md`, `apps/auth/README.md`; `apps/www/src/content/privacy.ts` an **Audit logs** section (what is recorded, the default periods, edit if changed) + its test if one pins sections; ROADMAP C unticked (ticked on merge).
- [ ] Commit `docs: audit retention and export`.
