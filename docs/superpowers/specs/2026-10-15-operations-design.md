# Operations (Phase 9 B) — design

Phase 9 is production hardening: A accessibility on pages (#88, merged) → **B operations** (this
spec) → C load and resilience → D performance budgets (→ E security scanning, optional). Approved in
chat on 2026-10-15. B ships as **two PRs**, B1 then B2, each with its own plan; never stacked.

## Intent

Today the api logs plain text through `log(message, error)` and `console`, the Next apps log with
`console`, nothing ties a browser request to the api calls and jobs it causes, there is no metrics
endpoint, and backups are one line in the deploy guide. B makes the stack operable: an operator can
follow one request end to end by its id, scrape metrics into any Prometheus-compatible system, take
and restore backups on a schedule, and find a runbook for the common incidents. Success: a
production log line is one JSON object carrying `service` and `requestId`; `/metrics` answers
Prometheus text to a bearer token; a nightly backup lands in the bucket and a tested restore
reproduces the data on both engines; `docs/guides/operations.md` covers it all.

Decided with the owner: **Prometheus `/metrics`** (hand-written, no SDK; not OpenTelemetry);
**backups as scripts plus a nightly in-app job, with a tested restore**; **structured logs and
request ids across the services and the Next server side**.

## B1 — logs, request ids, metrics

### `@repo/log` (new package)

Pure TypeScript, no runtime dependency, works on Bun (api, worker, ai) and Node (Next servers).
- `createLogger({ service, level?, format? })` → `{ debug, info, warn, error, child(fields) }`; each
  method `(message: string, fields?: Record<string, unknown>)`. `error` accepts `fields.error`
  (an `Error` or anything) and writes `{ name, message, stack }`.
- Format: `json` (one object per line: `time` ISO, `level`, `service`, `message`, `requestId` when
  in a request context, then fields) or `pretty` (one readable line). Default `json` when
  `NODE_ENV=production`, else `pretty`; `LOG_FORMAT` overrides. `LOG_LEVEL` (`debug` | `info` |
  `warn` | `error`, default `info`); an invalid value falls back to `info` with one warning.
- Redaction: keys matching `password`, `token`, `secret`, `authorization`, `cookie`,
  `x-session-token` (any case, nested) become `"[redacted]"`; values under keys named `email` are
  masked like `maskEmail` (`a***@example.com`). The logger never throws (a serialisation failure
  logs a fallback line).
- Request context: `withRequestContext({ requestId }, fn)` / `currentRequestId()` over
  `AsyncLocalStorage` (`node:async_hooks`, available in Bun and Node) — exported from a
  server-only subpath so no client bundle imports it.

### Request ids

- Id format: 16 random bytes base64url (22 chars); an accepted incoming id must match
  `^[A-Za-z0-9_-]{8,64}$`, else a new one is generated.
- **api / ai**: a request carrying the service bearer token may supply `x-request-id`; otherwise the
  service generates one. The id wraps the whole handler (`withRequestContext`), is echoed as the
  `x-request-id` response header, and is on every log line in that request. One access-log line per
  request at `info`: method, route template or oRPC procedure path (never the raw URL or query),
  status, duration ms, `clientId` hash when present. Health/ready/metrics are not access-logged.
- **Jobs**: migration `0022_jobs_request_id` adds a nullable `jobs.request_id`; `enqueue` stores
  `currentRequestId()`; the worker runs each job inside `withRequestContext({ requestId })` (a new id
  per run when the job has none, e.g. scheduled), so a job's log lines join its request.
- **Next apps**: `createSecurityProxy` keeps a valid incoming `x-request-id` or generates one and
  sets it on the forwarded request headers and the response. `@repo/session`'s api clients
  (`createAuth`'s, `anonymousApi`, the `*FromRequest` helpers), `createTelemetryRoute`,
  `createAnalyticsRoute`, `createFileRoute`, `createEventsRoute`, apps/www's waitlist, help's
  contact and jobs' apply actions, and apps/app's ai client forward it as `x-request-id`. Server
  code logs through `@repo/log` (`service` = the app id). `StatusPage` on `error.tsx` shows the
  request id when Next exposes it (the digest otherwise), so a user can quote it.

### Metrics

- `GET /metrics` on the api (`Bun.serve` route, outside oRPC) and the worker's health server.
  Bearer `METRICS_TOKEN` (new, optional; ≥ 24 chars); unset → `404` (off by default); wrong token →
  `401`. Never rate-limited, never access-logged. Prometheus text exposition 0.0.4, hand-written
  registry in `@repo/service-kit` (`counter`, `gauge`, `histogram` with fixed buckets; label values
  escaped; bounded label sets only).
- api: `http_requests_total{route,method,status_class}`, `http_request_duration_seconds` histogram
  `{route,method}` (buckets 0.005…10 s), `rate_limit_refusals_total{limiter}`,
  `realtime_streams_open`, `db_ping_seconds` (gauge, sampled on scrape),
  `process_resident_memory_bytes`, `process_uptime_seconds`, `build_info{version,commit}`.
  `route` is the route template or procedure path; an unknown path is `"other"`.
- worker: `jobs_queue{status}` (queued/running/dead, read on scrape), `job_runs_total{name,outcome}`
  (`succeeded`/`retried`/`dead`), `job_duration_seconds{name}` histogram, `scheduler_lag_seconds`,
  plus the process gauges. B2 adds `backup_last_success_timestamp_seconds`.
- Docs show a Prometheus scrape config and five example alerts.

### Testing (B1)

`@repo/log` unit tests (formats, levels, redaction incl. nested and case-insensitive keys, email
masking, error serialisation, never throws, context propagation across `await`); api tests that a
request id is accepted only with the service token, generated otherwise, echoed, present in log
lines (captured logger) and stored on enqueued jobs and restored in the worker; metrics endpoint
(404 unset, 401 wrong token, exposition format, counters move, label escaping, unknown route →
`other`); worker metrics; Next proxy test (keeps a valid id, replaces an invalid one, sets
response header); session client forwards the id; an e2e check that a page response carries
`x-request-id` and the api's response to the same request id matches.

## B2 — backups, restore, runbooks

Revised with the owner on 2026-10-15 (before B2's plan): the backup is an **in-app logical dump**,
not `VACUUM INTO` / `pg_dump` — Debian bookworm's `postgresql-client` is 15 and refuses a
Postgres 17 server, so native tools would pin a PGDG repo into the image. One code path serves both
engines, and a backup from one engine restores into the other.

- **Format** (`backup/format.ts`): gzipped JSON lines. Line 1 is a header
  `{ format: "boilerplate-backup", version: 1, engine, createdAt, migrations: [names…] }`; then, per
  table, a `{ table, columns }` line followed by one `[…values]` line per row. Values are JSON
  scalars (no BLOB columns today; a `Uint8Array` would be `{ "$b64": … }`). `jobs` is left out
  (queued work would re-send mail on restore) — documented.
- **Dump** (`backup/dump.ts`): one read transaction (Postgres `REPEATABLE READ READ ONLY`; SQLite a
  transaction), tables discovered from the database (`sqlite_master` / `information_schema`),
  ordered parents-first by their foreign keys, read in pages of 1 000 rows, streamed into gzip.
- **Restore** (`backup/restore.ts`): refuses a target with any rows unless `force` (which empties
  every table first, children-first); refuses a backup naming a migration this code does not know;
  migrates the target to the backup's migration list, inserts rows parents-first in batches, then on
  Postgres resets each serial sequence to `max(id)`; finally runs the remaining migrations.
- **Job**: `backup.run` + schedule `0 2 * * *`, enqueued only when `BACKUP_ENABLED=true`; writes
  `backups/<YYYY-MM-DD>/<engine>-<HHMMSS>.jsonl.gz` through the storage seam (`BACKUP_KEY_PATTERN`;
  `storage.sweep` never lists `backups/`), then deletes snapshots older than
  `BACKUP_RETENTION_DAYS` (default 14). Success sets `backup_last_success_timestamp_seconds`;
  failure goes through `recordFailure`.
- **CLI**: `bun --filter @repo/api backup [--out <file>]` (to the bucket by default) and
  `bun --filter @repo/api restore <key|file> [--force]` — stop the api and workers first; the
  script warns that it writes the database while they would too.
- **Tests**: round trip on SQLite and on Postgres (CI's `api-postgres` job) — seed users,
  workspaces, memberships, notes, invitations, applications; back up; restore into an empty
  database; compare every table's row count and sampled rows; and SQLite → Postgres when
  `TEST_DATABASE_URL` is set.
- The uploads bucket is not copied: the guide covers provider versioning/replication, and that
  database backups and the bucket must be restored to the same point to keep `avatar_key` /
  `logo_key` / `cv_key` references valid (the sweep deletes unreferenced objects — pause it after a
  restore until the bucket is restored too).
- `docs/guides/operations.md`: logs and request ids, metrics and alerts, backups and restore drills,
  and runbooks — the api will not start (env), a dead-job backlog, the realtime stream cap, mail
  failing, storage 403s, SQLite `database is locked`, restoring from a backup.

## Out of scope

OpenTelemetry/tracing, a hosted log shipper, dashboards as code, point-in-time recovery, backing up
the bucket itself, multi-region.
