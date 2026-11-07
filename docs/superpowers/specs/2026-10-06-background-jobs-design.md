# Background jobs — design

Sub-project C of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content → G i18n). Approved in chat section by section on
2026-10-05/06.

## Intent

Work that today runs fire-and-forget through `detach()` — every mail send, storage deletes,
Sentry forwarding — becomes durable: retried with backoff, never lost because the process died
between a commit and a send, and visible to superadmins when it finally fails. Maintenance that
today piggybacks on requests (token and telemetry prunes) runs on a schedule. Developers get a
typed API to define, enqueue and schedule their own jobs.

Decided with the owner:

- Scope: **durable work + schedules + a developer API** (not a bare library, not a hosted runner).
- Worker: **inside `apps/api` by default, switchable** — `JOBS_WORKER=false` per replica, and the
  same image runs as a dedicated worker (`bun src/worker.ts`).

Approach note: BullMQ needs Redis; pg-boss and graphile-worker are Postgres-only, and `apps/api`
runs on SQLite and Postgres. The queue is therefore a table in the api's own database, like the
billing mirror and the tokens table.

## 1. Data model and the developer API

**Table** — migration `0015_jobs`, table `jobs`:

| Column | Type | Notes |
|---|---|---|
| `id` | serial | |
| `name` | TEXT NOT NULL | the job definition's name |
| `payload` | TEXT NOT NULL | JSON; replaced with `{}` on success |
| `status` | TEXT NOT NULL | CHECK in (`queued`, `running`, `succeeded`, `dead`) |
| `attempts` | INTEGER NOT NULL DEFAULT 0 | incremented on claim |
| `max_attempts` | INTEGER NOT NULL | from the definition |
| `run_at` | TEXT NOT NULL | ISO time; not before this |
| `locked_until` | TEXT NULL | set on claim; a `running` row past it is reclaimable |
| `last_error` | TEXT NULL | truncated to 2000 chars |
| `dedupe_key` | TEXT NULL | see below |
| `created_at`, `finished_at` | TEXT | |

Indexes: `(status, run_at)`; a unique index on `dedupe_key` among `queued` / `running` rows
(Postgres: partial unique index `WHERE status IN ('queued','running')`; SQLite: the same partial
index syntax, supported since 3.8).

**Defining a job** — `apps/api/src/jobs/`:

```ts
export const sendMail = defineJob({
  name: "mail.send",
  payload: z.object({ template: TemplateNameSchema, to: z.string(), props: z.record(z.unknown()) }),
  maxAttempts: 5,          // default 5
  timeoutMs: 60_000,       // default 60 000
  run: async (payload, ctx) => { /* ctx: db, mailer, storage, log, recordFailure, telemetry */ },
})
```

All definitions are listed in one registry (`apps/api/src/jobs/registry.ts`), like migrations.

**Enqueueing** — `jobs.enqueue(definition, payload, { runAt?, dedupeKey?, tx? })`, typed from the
definition:

- the payload is validated with the definition's schema at enqueue (a bad payload throws there,
  in the caller) and again at run
- `tx` writes the job in the caller's database transaction: the data and its job commit together
  or not at all
- a `dedupeKey` already held by a `queued` or `running` job makes the enqueue a no-op (returns
  the existing id)
- a job whose name the running code does not know, or whose payload fails validation at run, goes
  straight to `dead` with that reason

**Schedules** — `defineSchedule({ name, cron, job, payload })`; standard 5-field cron (minute, hour,
day of month, month, day of week; `*`, lists, ranges, steps), UTC, matched by a pure function in
`apps/api/src/jobs/cron.ts`. Each minute the scheduler enqueues due schedules with
`dedupeKey = schedule:<name>:<YYYY-MM-DDTHH:MM>`, so any number of schedulers enqueue each run once.

**Retries** — on a throw or a timeout: back to `queued` with
`run_at = now + min(30 s × 2^(attempts−1), 1 h) × (1 ± 0.2 jitter)`; after `max_attempts`, `dead`,
`last_error` kept, and the failure recorded through `recordFailure` (log + telemetry). Intermediate
failures only log.

## 2. Worker, scheduler, operations

**Worker** — `apps/api/src/jobs/worker.ts`. `index.ts` starts it unless `JOBS_WORKER=false`;
`apps/api/src/worker.ts` runs only a worker and scheduler (no HTTP server besides `/health`), for a
dedicated container.

- Every `JOBS_POLL_MS` (default 1000) it claims up to `JOBS_CONCURRENCY` (default 4) minus jobs in
  flight, in one statement:
  `UPDATE jobs SET status='running', attempts=attempts+1, locked_until=<now+timeout> WHERE id IN
  (SELECT id FROM jobs WHERE (status='queued' AND run_at<=<now>) OR (status='running' AND
  locked_until<<now>) ORDER BY run_at LIMIT <n> [FOR UPDATE SKIP LOCKED]) RETURNING *` — `SKIP LOCKED`
  on Postgres; SQLite's single writer makes the plain form atomic.
- success → `succeeded`, `payload='{}'`, `finished_at`; throw or timeout → retry or `dead` (§1)
- a `running` row whose `locked_until` passed (crashed worker) is reclaimed by the claim above:
  delivery is **at least once**; every built-in job is idempotent, and a duplicated mail after a
  crash is the accepted worst case
- `enqueue` nudges the local worker so work starts at once instead of at the next poll
- the timeout aborts the job's `AbortSignal` (passed in `ctx.signal`) and counts as a failure

**Scheduler** — in every worker process, on each minute boundary. Built-in schedules:

| Schedule | Cron | Job |
|---|---|---|
| `tokens.prune` | `0 * * * *` | delete expired or consumed one-time tokens (replaces the prunes in the request paths) |
| `telemetry.prune` | `5 * * * *` | the telemetry retention prune (replaces the prune on ingest) |
| `jobs.prune` | `15 3 * * *` | delete `succeeded` older than 7 days, `dead` older than 30 days |
| `storage.sweep` | `30 3 * * *` | delete stored objects no row references, older than 24 h |

`storage.sweep` needs a new `Storage.list(prefix): AsyncIterable<{ key, lastModified }>` on both
providers (local: directory walk; s3: `ListObjectsV2`).

**Shutdown** — the existing lifecycle stops claiming, waits up to `drainMs` for jobs in flight;
anything still running is reclaimed once its lock expires.

**Visibility** — superadmin card on `apps/auth` `/admin`: counts of `queued` / `running` / `dead`
and the last 20 dead jobs (name, attempts, last error, time) with **Retry** (back to `queued`,
`attempts=0`, `run_at=now`) and **Discard** (delete). Procedures `admin.jobs.list`,
`admin.jobs.retry`, `admin.jobs.discard` — superadmin only (NOT_FOUND otherwise), the two writes
audited (`job.retried`, `job.discarded`). Payloads are never returned. `/ready` is unchanged.

**Env** — `JOBS_WORKER` (default `true`), `JOBS_CONCURRENCY` (default 4, 1–50),
`JOBS_POLL_MS` (default 1000, 100–60 000). Compose: an `api-worker` service (same image,
`command: bun src/worker.ts`, `JOBS_WORKER` irrelevant there) under the `worker` profile; the
default stack keeps the in-process worker.

## 3. What moves onto the queue, testing, docs

**Moves**

- **Mail** — every send becomes a `mail.send` job (template name + props; render and send in the
  job). Enqueued in the same transaction where one exists: sign-up verify, invitations,
  password-changed, two-factor enabled/disabled/reset, account-reset, waitlist welcome. The silent
  anonymous procedures (`auth.requestPasswordReset`, `auth.magicLink.request`) enqueue after the
  response through `detach()`, so the known- and unknown-email branches keep equal timing.
- **Tokens in payloads** — a mail payload can hold a one-time link; success clears the payload; a
  dead job keeps it for Retry, and the token in it expires on its own (15 min – 24 h).
- **Storage deletes** — replaced/removed images and a deleted workspace's logo become
  `storage.delete` jobs, `dedupeKey = storage.delete:<key>`.
- **Sentry forwarding** — a new error row's forward becomes a `telemetry.forward` job.
- **Prunes** — the request-path prunes are removed; the schedules above replace them.
- `detach()` remains only for the two silent enqueues.

**Testing** (SQLite + Postgres where a database is involved)

- `cron.ts`: fields, `*`, lists, ranges, steps, day-of-week 0/7, invalid expressions refused
- backoff: growth, the 1 h cap, jitter bounds
- enqueue: payload validated; unknown job refused; dedupe; enqueue inside a rolled-back
  transaction leaves no row; success clears the payload
- worker: a throwing job retries with backoff then dies and calls `recordFailure`; a timeout aborts
  the signal and counts as a failure; an expired lock is reclaimed; two workers on one database never
  run the same job (`Promise.all`); a schedule fires once per minute across two schedulers; shutdown
  waits for jobs in flight
- built-ins: verify mail delivered through the queue; a failing mailer retries; `storage.sweep`
  deletes only unreferenced objects older than 24 h; prunes delete what they should
- admin: list / retry / discard, audit rows, NOT_FOUND for non-admins
- `test-server.ts` gains `drain()` (run the queue until empty) for tests that waited on detached
  sends
- e2e: the existing journeys (sign-up verify, magic link, invitations, two-factor) pass unchanged

**Docs** — CLAUDE.md (a **Jobs.** paragraph, env rows, Compose's `worker` profile, migration
`0015`, the Email paragraph's "sends are detached" wording), `apps/api/README.md`,
`apps/auth/README.md` (admin card), a new `docs/guides/background-jobs.md` (defining a job,
enqueueing in a transaction, schedules, idempotency, a dedicated worker, dead jobs), the deploying
guide, `.env.example` files, ROADMAP (tick C).

## Out of scope

Exactly-once delivery; priorities; workflows and job chains; a hosted-runner seam; per-job
concurrency limits; a jobs UI beyond the dead list.
