# Operations

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Operations.** `apps/api`, its worker and `apps/ai` log structured JSON through `@repo/log`
(`createLogger({ service })`; `packages/log/README.md`): one line per call — `time`, `level`,
`service`, `message`, `requestId` when one is in scope, then fields — `json` by default in
production, `pretty` outside it, overridable by `LOG_FORMAT`; `LOG_LEVEL` (`debug`/`info`/`warn`/
`error`, default `info`; an invalid value falls back to `info` with one warning line, never
throws). Every logger call runs its fields through `redact()` first: keys matching `password`,
`token`, `secret`, `authorization`, `cookie` or `x-session-token` (any case, any depth) become
`"[redacted]"`, a key named `email` is masked (`maskEmail`, `a***@example.com`); the api's
existing internal `log(message, error)` callback is now `legacyLog(logger)` over the same logger,
so its hundreds of call sites are unchanged. A request id (`newRequestId()`, 16 random bytes
base64url, 22 chars) follows one browser request end to end: `createSecurityProxy` keeps a
well-formed incoming `x-request-id` or generates one, setting it on the forwarded request and the
response; `@repo/session`'s clients (`createAuth`'s, `anonymousApi`, the `*FromRequest` helpers),
`createTelemetryRoute`, `createAnalyticsRoute`, `createFileRoute`, `createEventsRoute`, and the
request-scoped api clients in `apps/www`'s contact and booking actions, `apps/help`'s contact action,
`apps/jobs`'s apply action and `apps/app`'s chat proxy all forward it as `x-request-id`. The api
and `apps/ai` (`@repo/service-kit`'s `withRequest`, shared so the two never drift) accept that
header only from a caller that already passed the service-bearer guard — an untrusted caller
cannot plant an id into operator logs — else generate one of their own; either way the id wraps
the whole handler (`withRequestContext`, `node:async_hooks`, `@repo/log/context`, server-only),
is echoed as the `x-request-id` response header, and is on every log line the request causes,
including a `mail.send` or any other job it enqueues: migration `0022_jobs_request_id` adds a
nullable `jobs.request_id`, `enqueue` stores `currentRequestId()`, and the worker runs each job
inside `withRequestContext({ requestId: row.request_id ?? newRequestId() })` (a fresh id for a
schedule's own tick, which enqueues with none). One `info` access line per api/ai request logs
`method`, `route` (a bounded label — a procedure path or route template, `"other"` for anything
the contract does not declare, never a raw URL, id or query string), `status` and `ms`;
`/health`, `/ready` and `/metrics` are never access-logged and never rate-limited. `/ready` (and
the dedicated worker's `/health`) races its database ping against `READY_TIMEOUT_MS` (default
2 000 ms) and answers `503` "Not ready (timed out)" past it, so a paused database fails the probe
rather than hanging it. Every other logged api/ai route has a server-side deadline,
`REQUEST_TIMEOUT_MS` (default 30 000 ms; `withRequest`'s `timeoutMs`): a handler with no response
by then answers `503` `SERVICE_UNAVAILABLE` "The request took too long. It may still complete —
check before retrying.", logs `request timed out` with the request id and counts as a 503; the
handler keeps running and its late result is discarded — nothing can cancel a pending query, so a
mutation may still commit after the caller was told it failed, and a 503 past the deadline should
be treated as an unknown outcome, not retried blindly when the write is not idempotent. Only the
time to a response counts, so a chat stream already under way is not cut, and the api's event
streams are exempt. `GET /metrics`
on the api and the dedicated worker (not `apps/ai`, which exposes none) is a hand-written
Prometheus registry (`@repo/service-kit`'s `createRegistry`/`metricsRoute`, text format 0.0.4):
unset `METRICS_TOKEN` → `404` (off by default, never silently open), a missing or wrong bearer
token (compared in constant time) → `401`. The api exposes `http_requests_total{route,method,
status_class}`, `http_request_duration_seconds` (histogram, `{route,method}`),
`rate_limit_refusals_total{limiter}`, `realtime_streams_open`, `db_ping_seconds` (sampled on
scrape), plus every process the worker also carries: `process_resident_memory_bytes`,
`process_uptime_seconds` and `build_info{version,commit}` (`commit` from `GIT_COMMIT`, `"unknown"`
when unset). The api additionally runs the job gauges (`jobs_queue{status}`,
`job_runs_total{name,outcome}`, `job_duration_seconds{name}`, `scheduler_lag_seconds`) only when
it also runs the worker (`JOBS_WORKER` not `false`); a dedicated worker process (`JOBS_WORKER=false`)
reports those on its own `/metrics` instead, so the two never double-count. A scrape-time
collector that throws or hangs (a stalled database) is skipped — just that metric, not the whole
scrape. Backups: `apps/api/src/backup/` dumps every table but `jobs` and `schema_migrations` into a
single gzipped JSON-lines file (one code path for both engines; a backup taken on either restores
on the other), off by default (`BACKUP_ENABLED`) and otherwise run nightly by the `backup.run`
schedule (see **Jobs**) through the storage seam, pruning its own objects under `backups/` past
`BACKUP_RETENTION_DAYS`; `bun run --filter @repo/api backup` / `restore` (`src/backup-cli.ts`,
`src/restore-cli.ts`; `bun dist/backup-cli.js` / `restore-cli.js` in the image) share the same code
for an ad hoc dump or a restore drill — restore refuses a non-empty target without `--force` and a
target with more migrations applied than the backup lists even with it. The uploads bucket is not
part of a backup; restoring it and the database to the same point — and pausing `storage.sweep`
meanwhile with `STORAGE_SWEEP_ENABLED=false` — is on the operator (the drill, Compose included, is in
`docs/guides/operations.md`). See
`docs/guides/operations.md`, `packages/log/README.md`, `apps/api/README.md` and
`apps/ai/README.md`.
