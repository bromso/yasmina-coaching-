# Audit-log retention and export — design (Phase 10 C)

Phase 10 "deepen what exists": A email change (#104, merged) → B suspend users (#105, merged) →
**C audit-log retention and export**. Approved in chat on 2026-10-18. One PR.

## Intent

`audit_log` (migration `0011_admin`) is append-only and kept forever; its `ip` and `user_agent`
columns outlive every other trace of a visit, and nothing gets the trail out for an auditor or a
security tool. Purpose, decided with the owner: **privacy and compliance** — keep audit data no
longer than necessary, tell people how long, and hand a period of it to an auditor or a SIEM as a
file.

Decided with the owner:
- **Two-stage retention:** network details (`ip`, `user_agent`) are stripped early; whole rows are
  deleted later. Nightly job, env-configured.
- **Export:** a synchronous download from `/admin/audit` (CSV or JSON Lines), not a background job.
- **No archive** before deletion — deleted means deleted.
- **Tamper evidence deferred** (documented as a known gap; a hash chain can be its own later
  sub-project).

## Legal and practice basis (checked 2026-10-18)

Checked with the Legal Data Hunter MCP (EU and FR sources), Context7 (OWASP Cheat Sheet Series) and
Consensus. Not legal advice; the operator remains the controller.

- An IP address a site operator stores is personal data where the operator has legal means to
  identify the person — CJEU C‑582/14 *Breyer*, 19 Oct 2016, para. 49; storing it for security can
  rest on legitimate interest, subject to balancing (paras. 60–64).
- GDPR Art. 5(1)(c) data minimisation, 5(1)(e) storage limitation, 5(1)(f) and Art. 32 security
  (logging is a security measure), 5(2) accountability.
- CNIL Délibération n° 2021-122 (14 Oct 2021, recommendation on logging): keep logs **six months
  to one year** in the general case; **up to three years** may be justified for internal control,
  with documented procedures; longer only for a specific legal obligation or a documented DPIA;
  "the limitation period of offences alone" does not justify a longer period; users must be told
  that logging exists, what it records and how long; access to logs restricted to strict need;
  logs should be timestamped and signed at creation.
- OWASP Logging Cheat Sheet: all access to logs recorded and monitored; tamper detection; consider
  masking before extraction or sharing. CSV-injection guidance (OWASP's CSV Injection page — not in
  Context7's index): neutralise cells starting with `=`, `+`, `-`, `@`, tab or carriage return.
- No new external library is involved (CSV written by hand, the prune on the existing job queue).

## 1. Retention (`apps/api`)

- Env (validated at boot in `apps/api/src/env.ts`; an invalid combination exits naming the
  problem):
  - `AUDIT_PII_RETENTION_DAYS` — default **90**, integer ≥ 1 and **strictly less than**
    `AUDIT_RETENTION_DAYS`.
  - `AUDIT_RETENTION_DAYS` — default **365**, integer **180–1095** (CNIL's general case to its
    internal-control maximum). No `off`.
  - `AUDIT_RETENTION_JUSTIFIED` — default `false`; when `true`, `AUDIT_RETENTION_DAYS` may go up
    to 3650 and the api logs one warning at startup asking the operator to document the
    justification (a legal obligation or a DPIA).
- Schedule `audit.prune`, cron `45 3 * * *`, in `JOBS`/`SCHEDULES`. One run:
  1. sets `ip = NULL, user_agent = NULL` on rows with `at` older than now −
     `AUDIT_PII_RETENTION_DAYS` that still hold either;
  2. deletes rows with `at` older than now − `AUDIT_RETENTION_DAYS`;
  both in batches of 1000 by id (`WHERE id IN (SELECT id … LIMIT 1000)`), checking the job's
  `signal` between batches (a timeout ends the run cleanly; the next night continues); a row
  exactly at a boundary is kept as is (strict `<`); idempotent; logs `audit pruned` with counts
  stripped and deleted. Uses the worker's `now()`. The existing `audit_log_at` index serves both —
  no migration.
- `reason` and `metadata` stay until the row is deleted. `audit.prune` is the only code that
  updates or deletes `audit_log` rows; writers remain append-only (the comment in `0011_admin`
  cannot change — a merged migration — so `queries/audit.ts` and the docs say it).
- `admin.audit.list`'s output (`AuditPageSchema`) gains `retention: { piiDays, rowDays }`, the
  limits in effect, and `/admin/audit` shows "Network details (IP, browser) are kept
  90 days; entries are kept 365 days."

## 2. Export

- `admin.audit.export({ from, to, format, actorId?, targetType?, targetId? })` in
  `@repo/api-contract` (admin.ts): `from`/`to` ISO dates (`YYYY-MM-DD`, `from` ≤ `to`, at most 366
  days apart, inclusive of whole UTC days), `format` `"csv" | "jsonl"`, the filters as on the
  page. Superadmin only — `NOT_FOUND` to anyone else, impersonation sessions included, like every
  `admin.*` procedure. Limiter `audit-export:<adminId>`, 10 per hour (`TOO_MANY_REQUESTS`).
- Rows oldest first (`ORDER BY at, id`), at most **100 000**: the handler counts first and answers
  `CONFLICT` "Narrow the date range: more than 100 000 entries match." rather than truncating.
- Columns, in order: `id, at, actor_id, actor_email, impersonated_id, impersonated_email, action,
  target_type, target_id, reason, ip, user_agent, metadata` — `at` ISO UTC; emails as of the
  export (null for a purged user); `metadata` the stored JSON string.
- CSV: RFC 4180 (every field quoted, `"` doubled, CRLF line ends), UTF-8 with a BOM, a header row;
  every cell whose first character is `=`, `+`, `-`, `@`, tab or CR gets a leading `'`. JSON Lines:
  one object per line with the same keys, `metadata` parsed back to an object when it is valid
  JSON, else the string.
- Returns a `File` named `audit-<from>-<to>.csv` / `.jsonl` (`text/csv; charset=utf-8` /
  `application/x-ndjson`).
- After building the file, writes `audit.exported` (actor = the admin; metadata `{ from, to,
  format, rows, actorId?, targetType?, targetId? }`); the row is never inside the file it
  describes. A refused export writes nothing.
- `apps/auth`: `/admin/audit` gets an **Export** card — From and To (`<input type="date">`,
  default the last 30 days), Format (CSV / JSON Lines), the page's current filters as hidden
  fields — a plain `<form method="post" action="/admin/audit/export">`, so it works without
  JavaScript. `src/app/admin/(gated)/audit/export/route.ts` (POST): the admin gate (404 otherwise),
  `assertSameOrigin`, calls the procedure, streams the file with `Content-Disposition: attachment;
  filename=…`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. A refusal (validation,
  `CONFLICT`, `TOO_MANY_REQUESTS`) redirects (303) to `/admin/audit?exportError=<code>` with the
  filters kept, and the page shows the message. English only, like the rest of `/admin`.

## 3. Interactions

- The user's data export keeps listing the audit rows that name them — fewer after retention.
- The privacy purge is unchanged (nulls ids; retention later removes rows).
- Restoring an older backup brings pruned rows back; the next `audit.prune` removes them. Backups
  hold deleted rows for up to `BACKUP_RETENTION_DAYS`, so effective retention is the configured
  period plus that — documented.
- Analytics and telemetry retention are untouched.

## 4. Testing

- api, SQLite and Postgres: prune strips at the boundary and not before, deletes at its own
  boundary, batches, stops on its signal, idempotent; env validation (bounds, justification flag,
  order); export filters, range limits, ordering, the 100 000 cap (via a lowered cap in the test
  server options), CSV quoting/BOM/formula guard, JSONL shape, the `audit.exported` row, the
  limiter, `NOT_FOUND` for a non-admin and an impersonation session, a purged actor's email null.
- auth: the route (same-origin refusal, admin gate, headers, refusal redirects), the form's
  defaults and hidden filters, the limits line.
- e2e: a superadmin exports CSV from `/admin/audit`; the download contains an expected row; the
  page then lists `audit.exported`.

## 5. Docs

CLAUDE.md (the **Admin** paragraph's "retention and export are not built" replaced by an **Audit
retention and export** paragraph; the env table; `audit.prune` in **Jobs**; e2e counts);
`docs/guides/operations.md` (retention bounds and their CNIL basis, how to justify longer, the
backup overlap, the tamper-evidence gap and the append-only-storage workaround via the export);
`apps/api/README.md`, `apps/auth/README.md`; the `/privacy` template in `apps/www` (an **Audit
logs** section: what is recorded, the default periods, edit if you change them); ROADMAP ticks C
on merge.

## Out of scope

Tamper evidence (hash chain or WORM storage); archiving rows before deletion; logging page views
of `/admin/audit`; background exports; per-workspace audit for workspace admins.
