# Background jobs

`apps/api` has a durable job queue: a `jobs` table in the api's own database (SQLite or Postgres,
migration `0015_jobs`), a worker that claims and runs due rows, and a cron scheduler. Every email,
every storage delete, Sentry forwarding and the maintenance prunes run through it. It needs no Redis
and no extra service: by default each api process runs the worker in-process. The how and why are
in CLAUDE.md (**Jobs**) and `apps/api/README.md` (**Jobs**); this guide is about adding your own
jobs and running a dedicated worker.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | the root `.env` (copy `.env.example`); `docker-compose.yml` passes `JOBS_WORKER`, `JOBS_CONCURRENCY` and `JOBS_POLL_MS` to `api` (and `api-worker`) |
| Production | the api service's environment (and the worker's, if you run one) |

| Var | Default | What |
|---|---|---|
| `JOBS_WORKER` | `true` | run the worker and scheduler inside this api process; `false` makes it enqueue only |
| `JOBS_CONCURRENCY` | `4` (1–50) | jobs one process runs at once |
| `WEBHOOK_CONCURRENCY` | `2` (1 to `JOBS_CONCURRENCY`) | of those, at most this many `webhook.deliver` jobs at once, so slow endpoints never take every slot from mail and the rest (`createWorker`'s `nameLimits`) |
| `JOBS_POLL_MS` | `1000` (100–60 000) | how often an idle worker looks for due jobs; an enqueue in the same process wakes it at once, except one inside a `tx` (found by the next poll) |

## Defining a job

A job is a name, a Zod payload schema and a `run` function, in `apps/api/src/jobs/builtin/` (or a
folder of your own under `src/jobs/`):

```ts
// apps/api/src/jobs/builtin/welcome.ts
import { z } from "zod"
import { defineJob } from "../define"

export const sendWelcomeJob = defineJob<{ userId: number }>({
  name: "welcome.send",
  payload: z.object({ userId: z.number().int().positive() }),
  maxAttempts: 5, // the default
  timeoutMs: 60_000, // the default
  run: async ({ userId }, ctx) => {
    const user = await ctx.db.users.find(userId)
    if (!user) return // gone since it was queued: nothing to do, and that is a success
    // … ctx.mailer, ctx.storage, ctx.telemetry, ctx.log, ctx.recordFailure, ctx.signal, ctx.now()
  },
})
```

Then add it to `JOBS` in `apps/api/src/jobs/registry.ts` — the worker only runs names it finds
there, like migrations in `migrations/index.ts`. The context (`JobContext` in `src/jobs/define.ts`)
carries the database, the mailer, storage and the telemetry provider; `ctx.signal` aborts when the
attempt times out (pass it to `fetch`), `ctx.attempt` is 1 on the first try, and `ctx.now()` is the
worker's clock — use it instead of `new Date()` for anything time-based, so tests can move it.

A job **succeeds** when `run` resolves and **fails** when it throws or outlives `timeoutMs`. To give
up for good without retrying (the input is wrong and always will be), return instead of throwing and
log why.

## Enqueueing

Inside a procedure, `context.enqueue(definition, payload, options?)`; the payload is typed from the
definition and validated against its schema right there, so a bad payload throws in the caller and
never reaches the table:

```ts
await context.db.transaction(async (tx) => {
  const user = await tx.users.create(...)
  await context.enqueue(sendWelcomeJob, { userId: user.id }, { tx })
})
```

- **`tx`** writes the job in the caller's transaction: the data and its job commit together or not
  at all. A `tx` enqueue does not wake the worker (the transaction has not committed yet); the next
  poll, within `JOBS_POLL_MS`, picks it up. Use it whenever there is a transaction: it is the only way a crash between "the write
  committed" and "the job was queued" cannot lose the job.
- **Without `tx`**, enqueue after the write it belongs to and `await` it. The built-in callers do
  exactly that (sign-up and resend verify, password-changed, the two-factor notices, the waitlist
  welcome; invitations and the unverified-account purge use `tx`): a failed job insert answers `500` even though the write already committed — the
  client sees the failure and can retry, which beats a silent lost mail. Storage deletes are the
  one exception: a failed `storage.delete` enqueue is logged and recorded (`recordFailure`), never
  shown, because the nightly `storage.sweep` catches the orphan anyway.
- **`dedupeKey`**: while a job holding the same key is `queued` or `running`, another enqueue with
  it is a no-op that returns the existing id. Once that job finishes, the key is free again — unless
  the enqueue also passes **`dedupeAnyStatus: true`**, which makes any row holding the key (finished
  or dead too, until `jobs.prune` deletes it) block it; schedules use that (see below).
  `enqueueMail` (in `jobs/builtin/mail.ts`) uses the mail's `idempotencyKey` as the dedupe key, and
  `enqueueStorageDelete` uses `storage.delete:<key>`.
- **`runAt`** delays the job: it is not claimed before that time.

Write a small typed helper next to the definition when callers need more than the payload (see
`enqueueMail`, which checks `props` against the template's own props type).

`detach()` (`src/mail/mailer.ts`, a macrotask that runs after the response is written) is not a
substitute: the api keeps it only where equal timing matters more than durability — the two silent
mail enqueues, `auth.requestPasswordReset` and `auth.magicLink.request`, which must answer a known
and an unknown email alike — and for telemetry's own `recordServerError`, which never awaits on the
caller's path.

## Retries, at least once, idempotency

On a throw or a timeout the job goes back to `queued` with
`run_at = now + min(30 s × 2^(attempt − 1), 1 h) ± 20 %` (`src/jobs/backoff.ts`), and only logs.
After `maxAttempts` it is `dead`: `last_error` (truncated to 2000 characters) stays, and the failure
is recorded through `recordFailure` (a log line and a telemetry `server` row, so it shows on
`/admin`). A job whose name the running code does not know, or whose payload fails the schema at run
time, goes straight to `dead` with that reason.

Delivery is **at least once**. The worker locks a claimed batch until the longest registered
`timeoutMs` of at most 5 minutes (`LONG_JOB_MS` in `src/jobs/worker.ts`) plus 30 s; a worker that
crashes mid-job leaves the row `running` and another worker reclaims it once that lock passes. That
lock is shared by every job in the batch, so raising one job's `timeoutMs` (up to 5 minutes)
lengthens it for all of them: a crashed worker's jobs wait that much longer before anyone reclaims
them. A job whose timeout is longer than 5 minutes (`backup.run`'s 30) is left out of that shared
lock: right after the claim, its own row's lock is extended to its timeout plus 30 s, so it never
delays the others. Keep timeouts as short as the work allows. A timeout frees the job's slot and
schedules the retry, but cannot stop `run` itself: a run that ignores `ctx.signal` keeps going in the
background while the retry runs. A job can therefore run twice, and `run` should be idempotent:
check before you act (the `find` above), use upserts, pass an idempotency key to providers that
take one (the one-time-link mails — verify, reset, magic link — pass `idempotencyKey`, which
reaches the mailer, Resend honours it, and doubles as the dedupe key), derive ids deterministically
(`telemetry.forward` sends Sentry the same `event_id` for the same error row). The other built-in
mails (password-changed, two-factor notices, account reset, invitation, waitlist welcome) carry no
key and may be sent twice after a worker crash or a timeout — the accepted worst case of
at-least-once.

`locked_until` is written with the claiming worker's clock and compared against the reclaiming
worker's, so keep the workers' clocks in sync (NTP): a worker whose clock runs ahead reclaims other
workers' running jobs early, by the amount it is ahead.

**Payloads are kept until success.** A successful job's payload is replaced with `{}`. A dead job
keeps its payload so **Retry** can run it again — a `mail.send` payload can hold a live one-time link
(verify, reset, magic link, invitation) until the job succeeds or `jobs.prune` deletes the dead row
after 30 days; the token inside expires sooner (15 minutes to 7 days). Payloads are never returned by
the admin procedures. Keep secrets you can look up at run time out of payloads: queue an id, not the
data.

## Schedules

A schedule enqueues a job on a cron expression. Add it to `SCHEDULES` in `src/jobs/registry.ts`:

```ts
defineSchedule({ name: "reports.daily", cron: "0 6 * * 1-5", job: dailyReportJob, payload: {} })
```

The expression is standard 5-field cron in **UTC**: minute (0–59), hour (0–23), day of month (1–31),
month (1–12), day of week (0–7, 0 and 7 both Sunday). Each field takes `*`, a number, a list
(`1,15`), a range (`1-5`), and a step on either (`*/15`, `0-30/10`). Names (`MON`, `JAN`) and the
`@daily`-style shortcuts are not supported. When both day fields are restricted, either matching is
enough (Vixie cron). `defineSchedule` parses the expression at import, so a bad one fails at boot.

Every worker process runs the scheduler, on each minute boundary. Each run is enqueued with the
dedupe key `schedule:<name>:<YYYY-MM-DDTHH:MM>` and `dedupeAnyStatus`, so any number of schedulers
enqueue it once — even when the first scheduler's job already finished before a second one ticks
that minute (finished rows are kept 7 days, far longer than a minute). A
process that wakes up late (suspended, a blocked event loop) runs the minute it missed and the
current one, never hours of backlog. The built-in schedules:

| Schedule | Cron | What |
|---|---|---|
| `tokens.prune` | `0 * * * *` | deletes used or expired one-time tokens |
| `telemetry.prune` | `5 * * * *` | telemetry retention: errors after 30 days, vitals after 7 |
| `jobs.prune` | `15 3 * * *` | deletes `succeeded` jobs older than 7 days and `dead` ones older than 30 |
| `analytics.rollup` | `10 0 * * *` | rebuilds `analytics_daily` for yesterday and the day before (see `docs/guides/analytics.md`) |
| `analytics.prune` | `20 0 * * *` | deletes raw analytics rows past `ANALYTICS_RETENTION_DAYS` and salts before today |
| `storage.sweep` | `30 3 * * *` | deletes stored avatars and logos no row references, older than 24 h |

`storage.sweep` lists the bucket, so an S3 user needs `s3:ListBucket` (see
[storage.md](storage.md)). It checks the listed keys against the database one query per 100 and
stops when its timeout aborts `ctx.signal` (the next night's run picks up where it left off).

> **One bucket per environment.** `storage.sweep` deletes every avatar and logo that *its own*
> database does not reference. Two environments sharing a bucket — staging and production, or a
> local `dev:worker` pointed at the production bucket — delete each other's files every night. Give
> each environment its own bucket: the keys carry no environment prefix (every environment writes
> `avatars/…` and `logos/…`), so a separate bucket is the only separation.

## Running a dedicated worker

By default every api replica runs the worker in-process. To run the jobs elsewhere, so a slow mail
provider or a long sweep never shares a process with requests, run `src/worker.ts`: the worker and
scheduler only, migrating the database on boot (under the migration lock, safe next to a migrating
api) and serving `GET /health` on `HOST:PORT` — nothing else. Then set `JOBS_WORKER=false` on the api
replicas so they only enqueue. `/health` answers 503 when the database does not answer (or once
shutdown began). Run as many workers as you like: claims use `FOR UPDATE SKIP LOCKED` on Postgres;
on SQLite the claim is one statement and the file allows one writer at a time, so no job runs on two
workers at once either. Several processes on one SQLite file (the Compose `worker` profile's `api`
and `api-worker`) work because the api opens it in WAL mode with a 5 s busy timeout and starts
transactions with `BEGIN IMMEDIATE`: writers queue for the lock instead of failing with "database is
locked". A waiting writer blocks its process's event loop while it waits, though, so with several
replicas or busy workers use Postgres.

- **Locally.** `PORT=3017 bun --filter @repo/api dev:worker` next to `bun dev` (with
  `JOBS_WORKER=false` in `apps/api/.env`). `dev:worker` sets `NODE_ENV=development` like `dev` —
  `NODE_ENV` defaults to `production`, where a bare `bun src/worker.ts` exits without
  `API_SERVICE_TOKEN` and the other production keys. The worker binds `PORT` like the api (default
  `3007`), so give it its own.
- **Docker.** The api image bundles both entrypoints (`dist/index.js` and `dist/worker.js`): run the
  same image with the command `bun dist/worker.js` (`bun --filter @repo/api start:worker` outside
  Docker). The image's `HEALTHCHECK` asks for `/ready`, which the worker does not serve: point the
  worker's health check at `/health`.
- **Compose.** `docker-compose.yml` has an `api-worker` service under the `worker` profile: the api's
  image (`boilerplate-bun-api`, built by the `api` service), environment and data volume (its SQLite
  file shared with the api), `PORT=3017` (not published) and a `/health` check. The default
  stack is unchanged; to use it:

  ```bash
  JOBS_WORKER=false docker compose --profile worker up -d --build
  ```

  `JOBS_WORKER=false` reaches `api` through `docker-compose.yml`'s `${JOBS_WORKER:-true}`. Prefer
  this inline form to putting it in the root `.env`: there it also applies to a plain
  `docker compose up` without the profile, which then runs no worker at all — jobs pile up and no
  mail goes out. Without it the api keeps its own worker as well, which is harmless — two workers
  share the queue — but defeats the point.
- **Shutdown.** On SIGTERM a worker (in the api or standalone) stops claiming at once and gives the
  jobs in flight up to 8 s (the api's `drainMs`) alongside the HTTP drain; anything still running is
  reclaimed by another worker once its lock passes.
- **Deploy order.** A worker that claims a job name it does not know kills it as `unknown job`.
  During a rolling deploy that adds a job, an older worker can claim the new job and kill it — deploy
  the workers with or after the code that defines the job, or retry the dead job from `/admin`
  afterwards.

## Watching and retrying dead jobs

Superadmins see a **Background jobs** card on `apps/auth`'s `/admin`: the `queued`, `running` and
`dead` counts and the 20 most recently dead jobs (name, attempts, last error, when). **Retry** puts a
dead job back to `queued` with `attempts` 0 and `run_at` now; it answers "A newer copy of this job is
already queued" when a newer live job holds the same dedupe key. **Discard** deletes the row. Both
are audited (`job.retried`, `job.discarded`). The procedures are `admin.jobs.list`,
`admin.jobs.retry` and `admin.jobs.discard` (see `apps/api/README.md`). Each death is also recorded
as a telemetry error, so it shows on the **Errors (24 h)** card and, with `TELEMETRY_PROVIDER=sentry`,
in Sentry.

## Testing a job

The test server (`src/test-server.ts`) runs with `jobsWorker: false`: jobs wait in the table until a
test calls `app.drain()`, which claims and runs due jobs until none is due and none is in flight.
`mailsTo` and `signUp` drain first. Unit-test a job's `run` directly with a
`JobContext` of your own, or drive `createWorker` (`src/jobs/worker.ts`) with an injected `now` —
see `src/jobs/worker.test.ts` and `src/jobs/builtin/*.test.ts`.

## Out of scope

Exactly-once delivery, priorities, workflows and job chains, per-job concurrency limits, a
hosted-runner seam (BullMQ, Inngest, Trigger.dev) and a jobs UI beyond the dead list. The queue is a
table on purpose: it runs on both of the api's databases with nothing else to operate.
