# Background Jobs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A durable, database-backed job queue in `apps/api` — typed job definitions, transactional
enqueue, retries with backoff, cron schedules, a switchable in-process worker — and every
`detach()` use and request-path prune moved onto it, with a superadmin view of dead jobs.

**Architecture:** `apps/api/src/jobs/` holds pure parts (`cron.ts`, `backoff.ts`), the definition
API (`define.ts`, `registry.ts`), `enqueue.ts`, `worker.ts` and `scheduler.ts`; `queries/jobs.ts`
holds the SQL (both dialects). `index.ts` starts the worker unless `JOBS_WORKER=false`;
`src/worker.ts` is a worker-only entrypoint. Built-in jobs live in `apps/api/src/jobs/builtin/`.

**Tech Stack:** Bun 1.4.2 (`Bun.sql` on SQLite/Postgres, `Bun.S3Client`, `bun test`), Zod 4,
oRPC 1.15, Next 16.2 (`apps/auth` admin card).

**Spec:** `docs/superpowers/specs/2026-10-06-background-jobs-design.md`

## Global Constraints

- Code style: Biome, double quotes, no semicolons, 2-space indent, 100-char lines; `bunx biome ci .`
  clean with zero warnings.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new npm dependency (no BullMQ / pg-boss / cron libraries).
- Statuses: `queued`, `running`, `succeeded`, `dead`. Times are ISO-8601 UTC strings
  (`toISOString()`), compared as strings.
- Defaults: `maxAttempts` 5, `timeoutMs` 60 000; `JOBS_WORKER` true, `JOBS_CONCURRENCY` 4 (1–50),
  `JOBS_POLL_MS` 1000 (100–60 000).
- Backoff: `min(30 s × 2^(attempts−1), 1 h) × (1 ± 0.2)`.
- `last_error` truncated to 2000 chars. Success sets `payload` to `{}`.
- Schedule dedupe key: `schedule:<name>:<YYYY-MM-DDTHH:MM>` (UTC minute).
- Built-in schedules: `tokens.prune` `0 * * * *`; `telemetry.prune` `5 * * * *`; `jobs.prune`
  `15 3 * * *` (succeeded > 7 d, dead > 30 d); `storage.sweep` `30 3 * * *` (unreferenced, > 24 h).
- `storage.delete` dedupe key: `storage.delete:<key>`.
- Admin procedures `admin.jobs.list` / `retry` / `discard`; audit actions `job.retried`,
  `job.discarded`; payloads never returned.
- Delivery is at least once; every built-in job is idempotent.

## Review Focus

1. **A handler that never settles** (ignores the abort signal) — after `timeoutMs` the worker must
   free its concurrency slot and record the failure; a late settle must not overwrite the row's
   newer state. (Task 2)
2. **Rows written by older code** — a queued job whose name no longer exists, or whose payload no
   longer validates, goes to `dead` with that reason once, never a crash or a retry loop. (Task 2)
3. **The database is unreachable during a poll** — the worker logs (throttled) and keeps polling;
   the process does not crash and recovers when the database returns. (Task 2)
4. **A worker died mid-job on its last attempt** — the reclaimed row must go to `dead`
   ("worker lost"), not run a sixth time. (Task 1 claim + Task 2)
5. **A burst of jobs** (e.g. 500 invitations) — processed `JOBS_CONCURRENCY` at a time, and a due
   schedule still enqueues on time. (Task 2)

---

### Task 1: Queue core — migration, queries, definitions, enqueue, cron, backoff

**Files:**
- Create: `apps/api/src/migrations/0015_jobs.ts`, `apps/api/src/queries/jobs.ts`,
  `apps/api/src/jobs/{define,registry,enqueue,cron,backoff}.ts`,
  `apps/api/src/jobs/{cron,backoff,queue}.test.ts`
- Modify: `apps/api/src/migrations/index.ts`, `apps/api/src/db.ts` (`jobs: jobsQueries(sql)`)

**Interfaces — Produces:**

```ts
// define.ts
export type JobContext = {
  db: Db; mailer: Mailer; storage: Storage; log: Log; recordFailure: (m: string, e: unknown) => void
  telemetry: TelemetryProvider; signal: AbortSignal; attempt: number
}
export type JobDefinition<P> = {
  name: string; payload: z.ZodType<P>; maxAttempts: number; timeoutMs: number
  run: (payload: P, ctx: JobContext) => Promise<void>
}
export function defineJob<P>(def: { name: string; payload: z.ZodType<P>; maxAttempts?: number;
  timeoutMs?: number; run: JobDefinition<P>["run"] }): JobDefinition<P>
export type ScheduleDefinition = { name: string; cron: string; job: JobDefinition<any>; payload: unknown }
export function defineSchedule(def: ScheduleDefinition): ScheduleDefinition
// registry.ts — filled by later tasks; starts empty
export const JOBS: readonly JobDefinition<any>[]
export const SCHEDULES: readonly ScheduleDefinition[]
export function jobByName(name: string): JobDefinition<unknown> | undefined
// enqueue.ts
export type EnqueueOptions = { runAt?: Date; dedupeKey?: string; tx?: Queries }
export function createEnqueue(deps: { db: Db; now?: () => Date; nudge?: () => void }):
  <P>(def: JobDefinition<P>, payload: P, options?: EnqueueOptions) => Promise<number> // job id
// cron.ts
export function parseCron(expression: string): CronSpec // throws on an invalid expression
export function cronMatches(spec: CronSpec, at: Date): boolean // UTC, minute precision
// backoff.ts
export function backoffMs(attempts: number, random?: () => number): number
// queries/jobs.ts (also on `tx`)
export type JobRow = { id: number; name: string; payload: string; status: JobStatus; attempts: number;
  max_attempts: number; run_at: string; locked_until: string | null; last_error: string | null;
  dedupe_key: string | null; created_at: string; finished_at: string | null }
jobsQueries(sql) => {
  insert(row: { name; payload; maxAttempts; runAt; dedupeKey?; createdAt }): Promise<number> // existing id on a live dedupe key
  claim(now: string, limit: number, lockFor: (row) => string): Promise<JobRow[]>
  succeed(id: number, attempts: number, at: string): Promise<boolean>   // false if the row moved on
  retry(id: number, attempts: number, runAt: string, error: string): Promise<boolean>
  kill(id: number, attempts: number, at: string, error: string): Promise<boolean>
  counts(): Promise<Record<JobStatus, number>>
  listDead(limit: number): Promise<Omit<JobRow, "payload">[]>
  resurrect(id: number, now: string): Promise<boolean>   // dead → queued, attempts 0
  discard(id: number): Promise<boolean>                  // delete a dead row
  prune(succeededBefore: string, deadBefore: string): Promise<number>
}
```

`succeed` / `retry` / `kill` match on `id AND attempts AND status='running'` so a late result from a
timed-out run cannot overwrite a newer attempt (Review Focus 1).

- [ ] **Step 1: Failing tests for the pure parts** — `cron.test.ts`:

```ts
import { describe, expect, test } from "bun:test"
import { cronMatches, parseCron } from "./cron"

const at = (iso: string) => new Date(iso)
describe("cron", () => {
  test("* and fixed fields", () => {
    expect(cronMatches(parseCron("* * * * *"), at("2026-10-06T12:34:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 * * * *"), at("2026-10-06T12:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 * * * *"), at("2026-10-06T12:01:00Z"))).toBe(false)
    expect(cronMatches(parseCron("15 3 * * *"), at("2026-10-06T03:15:59Z"))).toBe(true)
  })
  test("lists, ranges, steps", () => {
    const spec = parseCron("*/15 9-17 * * 1-5")
    expect(cronMatches(spec, at("2026-10-06T09:45:00Z"))).toBe(true) // Tuesday
    expect(cronMatches(spec, at("2026-10-06T18:00:00Z"))).toBe(false)
    expect(cronMatches(spec, at("2026-10-04T10:00:00Z"))).toBe(false) // Sunday
    expect(cronMatches(parseCron("5,35 * * * *"), at("2026-10-06T00:35:00Z"))).toBe(true)
    expect(cronMatches(parseCron("10-20/5 * * * *"), at("2026-10-06T00:15:00Z"))).toBe(true)
  })
  test("day of week 0 and 7 are both Sunday; day-of-month OR day-of-week when both set", () => {
    expect(cronMatches(parseCron("0 0 * * 7"), at("2026-10-04T00:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 0 * * 0"), at("2026-10-04T00:00:00Z"))).toBe(true)
    expect(cronMatches(parseCron("0 0 1 * 1"), at("2026-10-05T00:00:00Z"))).toBe(true) // a Monday
  })
  test("invalid expressions throw", () => {
    for (const bad of ["", "* * * *", "60 * * * *", "* 24 * * *", "*/0 * * * *", "a * * * *", "5-1 * * * *"])
      expect(() => parseCron(bad)).toThrow()
  })
})
```

`backoff.test.ts`: `backoffMs(1, () => 0.5)` is 30 000; `backoffMs(2, () => 0.5)` 60 000; attempt 10
capped at 3 600 000; with `random = () => 0` → ×0.8, `() => 1` → ×1.2 (bounds); never negative.

- [ ] **Step 2: Run them to see them fail** — `cd apps/api && bun test src/jobs`.

- [ ] **Step 3: Implement `cron.ts` and `backoff.ts`**

```ts
// backoff.ts
const BASE_MS = 30_000
const CAP_MS = 60 * 60_000
/** Delay before the next try after `attempts` failed ones: 30 s doubling, capped at 1 h, ±20 %. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = Math.min(BASE_MS * 2 ** Math.max(0, attempts - 1), CAP_MS)
  return Math.round(base * (0.8 + 0.4 * random()))
}
```

```ts
// cron.ts — 5 fields, UTC. Day-of-month and day-of-week: when both are restricted, either matches
// (Vixie cron semantics).
type Field = Set<number>
export type CronSpec = { minute: Field; hour: Field; dom: Field; month: Field; dow: Field; domAny: boolean; dowAny: boolean }
const RANGES = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]] as const

function field(text: string, [min, max]: readonly [number, number]): Field {
  const out = new Set<number>()
  for (const part of text.split(",")) {
    const [range, stepText] = part.split("/")
    const step = stepText === undefined ? 1 : Number(stepText)
    if (!Number.isInteger(step) || step < 1) throw new Error(`bad step in "${part}"`)
    let lo: number
    let hi: number
    if (range === "*") [lo, hi] = [min, max]
    else if (range?.includes("-")) [lo, hi] = range.split("-").map(Number) as [number, number]
    else [lo, hi] = [Number(range), stepText === undefined ? Number(range) : max]
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi)
      throw new Error(`bad range in "${part}"`)
    for (let v = lo; v <= hi; v += step) out.add(v)
  }
  return out
}

export function parseCron(expression: string): CronSpec {
  const parts = expression.trim().split(/\s+/)
  if (parts.length !== 5) throw new Error(`cron needs 5 fields: "${expression}"`)
  const [minute, hour, dom, month, dow] = parts.map((p, i) => field(p, RANGES[i] as readonly [number, number]))
  if (dow?.has(7)) dow.add(0)
  return { minute, hour, dom, month, dow, domAny: parts[2] === "*", dowAny: parts[4] === "*" } as CronSpec
}

export function cronMatches(spec: CronSpec, at: Date): boolean {
  if (!spec.minute.has(at.getUTCMinutes()) || !spec.hour.has(at.getUTCHours())) return false
  if (!spec.month.has(at.getUTCMonth() + 1)) return false
  const domOk = spec.dom.has(at.getUTCDate())
  const dowOk = spec.dow.has(at.getUTCDay())
  if (spec.domAny && spec.dowAny) return true
  if (spec.domAny) return dowOk
  if (spec.dowAny) return domOk
  return domOk || dowOk
}
```

- [ ] **Step 4: Migration** — `0015_jobs.ts`:

```ts
import { type Dialect, ddl } from "../dialect"
import type { Migration } from "../migrate"

// The job queue (src/jobs/). One table on both engines; the partial unique index lets a dedupe key
// hold only while its job is queued or running, so a finished job's key can be used again.
const jobs: Migration = {
  name: "0015_jobs",
  async up(sql, dialect: Dialect) {
    await sql.unsafe(`
      CREATE TABLE jobs (
        id ${ddl.serialId(dialect)},
        name TEXT NOT NULL,
        payload TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'succeeded', 'dead')),
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        run_at TEXT NOT NULL,
        locked_until TEXT,
        last_error TEXT,
        dedupe_key TEXT,
        created_at TEXT NOT NULL,
        finished_at TEXT
      )
    `)
    await sql.unsafe("CREATE INDEX jobs_status_run_at ON jobs (status, run_at)")
    await sql.unsafe(
      "CREATE UNIQUE INDEX jobs_live_dedupe_key ON jobs (dedupe_key) WHERE status IN ('queued', 'running')"
    )
  },
}

export default jobs
```

(Check `ddl.serialId` exists in `dialect.ts`, as 0013 uses it.) List it after `files` in
`migrations/index.ts`.

- [ ] **Step 5: Failing queue tests** — `queue.test.ts`, on the real database helper the other
api tests use (see `test-db.ts` / how `two-factor.test.ts` gets a db on SQLite and Postgres):
  1. `enqueue` of a payload failing the schema throws in the caller and inserts nothing.
  2. `enqueue` returns an id; the row is `queued`, `attempts 0`, `max_attempts` from the definition,
     `run_at` = now (or `runAt`).
  3. Same `dedupeKey` twice while queued → same id, one row; after the first succeeds, a third
     enqueue creates a new row.
  4. `enqueue(..., { tx })` inside `db.transaction` that then throws → no row.
  5. `claim` returns due `queued` rows oldest `run_at` first up to `limit`, sets `running`,
     `attempts+1`, `locked_until`; a future `run_at` is not claimed.
  6. Two concurrent `claim`s (`Promise.all`) over 10 due rows with limit 10 each → every row claimed
     exactly once in total.
  7. A `running` row whose `locked_until` passed is claimed again (attempts+1).
  8. `succeed(id, attempts)` sets `succeeded`, `payload '{}'`, `finished_at`; called with a stale
     `attempts` → returns false and changes nothing.
  9. `prune` deletes old `succeeded` / `dead` rows only.

- [ ] **Step 6: Implement `queries/jobs.ts`, `define.ts`, `registry.ts`, `enqueue.ts`**

`claim` (one statement; Postgres adds `FOR UPDATE SKIP LOCKED`, using `dialectOf(sql)` the way
other dialect-specific queries do):

```sql
UPDATE jobs SET status = 'running', attempts = attempts + 1, locked_until = $lock
WHERE id IN (
  SELECT id FROM jobs
  WHERE (status = 'queued' AND run_at <= $now) OR (status = 'running' AND locked_until < $now)
  ORDER BY run_at LIMIT $limit [FOR UPDATE SKIP LOCKED]
)
RETURNING *
```

`locked_until` depends on each job's timeout; claim with a single lock of
`now + max(timeoutMs of registered jobs) + 30 s` (pass it in), and let the worker enforce the
per-job timeout itself. `insert` with a dedupe key: insert; on a unique violation (both engines
raise one for the partial index) select the live row's id and return it. `enqueue` validates with
`def.payload.parse(payload)`, serialises with `JSON.stringify`, uses `(options.tx ?? deps.db).jobs`,
then calls `deps.nudge?.()` (after commit when `tx` is not given; with `tx`, the worker's next poll
picks it up — note this in a comment).

- [ ] **Step 7: Run** — `cd apps/api && bun test src/jobs src/migrate.test.ts`; root
`bun run typecheck`; `bunx biome ci .`. If Postgres is available (`TEST_DATABASE_URL`, or a
throwaway `postgres:16-alpine` container you remove afterwards), run `queue.test.ts` on it too.

- [ ] **Step 8: Commit** — `feat(api): job queue core — table, enqueue, cron and backoff`

---

### Task 2: Worker, scheduler, lifecycle, env and entrypoints

**Files:**
- Create: `apps/api/src/jobs/worker.ts`, `apps/api/src/jobs/scheduler.ts`,
  `apps/api/src/jobs/worker.test.ts`, `apps/api/src/worker.ts` (entrypoint)
- Modify: `apps/api/src/env.ts` (+ test), `apps/api/src/server.ts` (create the worker, expose
  `enqueue` on the router context and `jobs` on the returned object, stop it in shutdown),
  `apps/api/src/router.ts` (`Context.enqueue`), `apps/api/src/index.ts`,
  `apps/api/src/server-options.ts` (+ test), `apps/api/src/test-server.ts` (`drain()`),
  root and `apps/api/.env.example`

**Interfaces — Produces:**

```ts
// worker.ts
export type Worker = {
  start(): void                       // begins polling and the scheduler
  stop(drainMs: number): Promise<void> // stops claiming; waits for in-flight up to drainMs
  nudge(): void                        // poll now
  drain(): Promise<void>               // tests: run due jobs until none is due (ignores pollMs)
}
export function createWorker(deps: {
  db: Db; context: Omit<JobContext, "signal" | "attempt">; jobs?: readonly JobDefinition<any>[]
  schedules?: readonly ScheduleDefinition[]; concurrency: number; pollMs: number
  now?: () => Date; log: Log; recordFailure: (m: string, e: unknown) => void
}): Worker
// scheduler.ts
export function dueSchedules(schedules: readonly ScheduleDefinition[], at: Date): ScheduleDefinition[]
export function scheduleKey(name: string, at: Date): string // schedule:<name>:<YYYY-MM-DDTHH:MM>
export async function tickSchedules(enqueue: Enqueue, schedules, at: Date): Promise<void>
// router Context
enqueue: <P>(def: JobDefinition<P>, payload: P, options?: EnqueueOptions) => Promise<number>
// createServer options
jobsWorker?: boolean; jobsConcurrency?: number; jobsPollMs?: number
// createServer result
jobs: Worker
```

Worker rules (from the spec): run a claimed row → look up `jobByName`; unknown → `kill` with
`unknown job "<name>"`; `def.payload.safeParse(JSON.parse(payload))` fails → `kill` with
`invalid payload: <issues>`; a reclaimed row with `attempts > max_attempts` → `kill` with
`worker lost the job on its last attempt` (Review Focus 4); else run with an `AbortController`
timed out at `def.timeoutMs` — on timeout, abort, free the slot, and treat as failure even if the
promise never settles (Review Focus 1); failure → `attempts < max_attempts` ? `retry` with
`now + backoffMs(attempts)` : `kill` + `recordFailure("job <name> died", error)`; success →
`succeed`. Intermediate failures `log` only. A poll that throws (database down) is logged at most
once a minute and polling continues (Review Focus 3). The scheduler runs on each minute boundary
(`setTimeout` to the next minute, then every 60 s) and calls `tickSchedules`.

- [ ] **Step 1: Failing tests** — `worker.test.ts` (real database helper; inject `now`, a fake
mailer/storage context, small `pollMs`, test-only job definitions passed via `jobs`):
  1. success → `succeeded`, payload `{}`.
  2. a job throwing twice then succeeding (maxAttempts 3) → `succeeded`, attempts 3, `run_at` moved
     by backoff between tries (advance the injected clock).
  3. a job always throwing (maxAttempts 2) → `dead`, `last_error` set (≤ 2000 chars),
     `recordFailure` called once with the job name.
  4. a job that never settles with `timeoutMs` 50 → after drain it is retried/dead and the worker
     accepts new work (concurrency 1: a second job still completes); its `ctx.signal` was aborted.
  5. unknown name and invalid payload rows (insert via `db.jobs.insert` directly) → `dead` with those
     reasons, `run` never called.
  6. a `running` row with expired lock and `attempts == max_attempts` → `dead` "worker lost…".
  7. two workers on one database draining 20 jobs → each job ran exactly once (count calls).
  8. `tickSchedules` called twice for the same minute (two schedulers) → one job; next minute → a
     second job. `dueSchedules` respects cron.
  9. 50 queued jobs with concurrency 4 → at most 4 run at once (track max in-flight); a schedule due
     in that minute is still enqueued (Review Focus 5).
  10. `stop(1000)` while a 100 ms job runs → resolves after it finishes; no new claims after stop.
  11. a `db.jobs.claim` that throws (monkeypatch once) → logged, the worker keeps polling and later
      runs the job (Review Focus 3).
  `env.test.ts`: defaults; `JOBS_WORKER=false`; out-of-range concurrency/poll refused.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** worker, scheduler, env (`JOBS_WORKER` boolean-ish like the other
boolean env parsing in `env.ts`, `JOBS_CONCURRENCY` int 1–50, `JOBS_POLL_MS` int 100–60 000),
`serverOptionsFromEnv` mapping, `createServer` wiring (create the worker after migrate; start it when
`jobsWorker !== false`; context `enqueue` = `createEnqueue({ db, nudge: worker.nudge })`;
`lifecycle` cleanup stops the worker before closing the db). `src/worker.ts`: load env, create the
db/mailer/storage/telemetry the same way `index.ts` does, run only `Bun.serve({ routes: { "/health":
… } })` plus the worker, graceful shutdown on SIGTERM/SIGINT. `test-server.ts`: `start()` passes
`jobsWorker: false` by default and exposes `drain: () => app.jobs.drain()`.

- [ ] **Step 4: Run** — `cd apps/api && bun test` (full), root typecheck, `bunx biome ci .`.

- [ ] **Step 5: Commit** — `feat(api): job worker, scheduler and the worker entrypoint`

---

### Task 3: Mail through the queue

**Files:**
- Create: `apps/api/src/jobs/builtin/mail.ts` (+ test)
- Modify: `apps/api/src/jobs/registry.ts`, `apps/api/src/router.ts` (every mail `detach`),
  api tests that awaited detached mail (use `drain()`)

**Interfaces:**
- Consumes: `defineJob`, `Context.enqueue`, `EnqueueOptions.tx`.
- Produces:

```ts
export type MailTemplate = keyof typeof emails
export const sendMailJob: JobDefinition<{ template: MailTemplate; to: string; props: Record<string, unknown>; idempotencyKey?: string }>
/** Typed helper: props checked against the template's own props type at compile time. */
export function enqueueMail<T extends MailTemplate>(
  enqueue: Enqueue, template: T, to: string, props: Parameters<(typeof emails)[T]>[0],
  options?: EnqueueOptions & { idempotencyKey?: string }
): Promise<number>
```

`sendMailJob.run`: `const mail = await emails[template](props as never)`, then
`ctx.mailer.send({ to, ...mail, idempotencyKey })`, then
`ctx.log(\`mail sent ${template} to ${maskEmail(to)}\`, undefined)`. `maxAttempts` 5.
Dedupe key: the call site's existing idempotency key where there is one (`verify:<user>:<hash>`,
`magic:<hash>`), else none.

- [ ] **Step 1: Failing tests** — `builtin/mail.test.ts`: a queued `mail.send` drained with a
capturing mailer sends the rendered template with the masked log line; a mailer failing twice then
working → sent on attempt 3; a mailer always failing → `dead` after 5. In the existing suites, the
sign-up verify test, password-reset, magic link, invitations, two-factor notices and the waitlist
welcome now `await app.drain()` before reading the mailbox — update them and confirm each still
passes. Add one test: an invitation created in a transaction that rolls back (e.g. force the seat
check to fail after the insert, or monkeypatch) leaves no `mail.send` row.

- [ ] **Step 2: Run to see them fail** (mail no longer arrives without drain; the new test fails).

- [ ] **Step 3: Implement** — replace every `detach(async () => { const mail = await emails.X(...);
await context.mailer.send(...) }, …)` in `router.ts` with `enqueueMail(context.enqueue, "X", to,
props, { tx, dedupeKey })`, passing `tx` where the call site is inside `db.transaction`. Keep
`detach(() => enqueueMail(...), (e) => context.recordFailure("mail enqueue failed", e))` for exactly
`auth.requestPasswordReset` and `auth.magicLink.request` (equal timing on both branches — keep the
existing comments explaining why). Remove the "sent detached" doc comments that no longer hold.

- [ ] **Step 4: Run** — `cd apps/api && bun test`, root typecheck, `bunx biome ci .`.

- [ ] **Step 5: Commit** — `feat(api): send every email through the job queue`

---

### Task 4: Storage, telemetry and maintenance jobs

**Files:**
- Create: `apps/api/src/jobs/builtin/{storage,telemetry,prune}.ts` (+ tests)
- Modify: `apps/api/src/storage/{storage,local,s3}.ts` (+ `storage.test.ts`: `list`),
  `apps/api/src/uploads.ts`, `apps/api/src/router.ts` (workspace delete, request-path prunes),
  `apps/api/src/telemetry/record.ts`, `apps/api/src/jobs/registry.ts`,
  `apps/api/src/queries/{users,workspaces}.ts` (referenced-key lookup for the sweep)

**Interfaces — Produces:**

```ts
// storage seam
list(prefix: string): AsyncIterable<{ key: string; lastModified: Date }>
// jobs
export const storageDeleteJob: JobDefinition<{ key: string }>   // dedupe storage.delete:<key>
export const telemetryForwardJob: JobDefinition<{ errorId: number }>
export const tokensPruneJob, telemetryPruneJob, jobsPruneJob, storageSweepJob: JobDefinition<Record<string, never>>
export const SCHEDULES // the four built-in schedules with the crons in Global Constraints
```

- [ ] **Step 1: Failing tests**
  - `storage.test.ts`: `list("avatars/")` on both providers (local and the fake S3 — extend the fake
    for `ListObjectsV2`: `GET /<bucket>?list-type=2&prefix=…` returning the XML Bun's client parses)
    yields exactly the keys under the prefix with a `lastModified`.
  - `storage.delete`: deletes the object; deleting a missing key succeeds (idempotent).
  - Replacing an avatar enqueues `storage.delete` for the old key (row present before drain; object
    gone after drain). Workspace delete enqueues one for its logo.
  - `storage.sweep`: with three objects — referenced; unreferenced and 2 days old; unreferenced and
    1 hour old — only the old unreferenced one is deleted. (Local provider: set mtimes with
    `utimes`.)
  - `tokens.prune` deletes stale tokens (reuse what `deleteStale` did); `telemetry.prune` runs the
    retention prune; `jobs.prune` deletes succeeded > 7 d and dead > 30 d only.
  - `telemetry.forward`: a new error row with the sentry provider enqueues a job; the job calls the
    provider; provider failures retry.
  - The request paths no longer prune (a reset request leaves stale tokens for the schedule).

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** — `local.list` walks the directory (skip files whose relative path does
not match `FILE_KEY_PATTERN`); `s3.list` uses Bun's `S3Client.list({ prefix, continuationToken })`
(verify the API in bun-types; page until done). Replace the `detach` calls in `uploads.ts`,
`router.ts` (workspace delete) and `telemetry/record.ts` with `context.enqueue(...)` (no `tx`
needed where the write already committed; use `tx` when inside one). Remove the request-path
prunes (`deleteStale` in the verify/reset/magic paths; the prune on telemetry ingest). Register the
jobs and `SCHEDULES` in `registry.ts`.

- [ ] **Step 4: Run** — `cd apps/api && bun test`, root typecheck, `bunx biome ci .`;
optionally `S3_TEST_ENDPOINT=… bun test src/storage` against the Compose SeaweedFS.

- [ ] **Step 5: Commit** — `feat(api): storage, telemetry and maintenance jobs on the queue`

---

### Task 5: Admin view of the queue

**Files:**
- Modify: `packages/api-contract/src/{admin,index}.ts`, `apps/api/src/router.ts`,
  `apps/api/src/admin-api.test.ts`, `apps/auth/src/views/admin-*-view.tsx` (the `/admin` home view),
  `apps/auth/src/app/admin/(gated)/…` (actions), `apps/auth/src/lib/admin-actions.ts` (+ test)

**Interfaces — Produces:**

```ts
export const AdminJobSchema = z.object({ id: z.number().int(), name: z.string(), attempts: z.number().int(),
  maxAttempts: z.number().int(), lastError: z.string().nullable(), runAt: z.iso.datetime(),
  finishedAt: z.iso.datetime().nullable() })
admin.jobs.list() → { counts: { queued: number; running: number; dead: number }, dead: AdminJob[] } // last 20
admin.jobs.retry({ id }) → { ok: true }    // NOT_FOUND unless dead
admin.jobs.discard({ id }) → { ok: true }  // NOT_FOUND unless dead
```

- [ ] **Step 1: Failing tests** — api: superadmin sees counts and the dead list without payloads
(assert no `payload` key); retry → row `queued`, attempts 0, audit `job.retried`; discard → row
gone, audit `job.discarded`; retry/discard of a non-dead or missing id → NOT_FOUND; a non-admin and
an impersonation session → NOT_FOUND. auth cores: retry/discard success messages and NOT_FOUND
handling, in the existing `admin-actions.test.ts` style.

- [ ] **Step 2: Run to see them fail.**

- [ ] **Step 3: Implement** — procedures under the existing `admin` namespace behind its
superadmin middleware; a **Background jobs** card on `/admin` (counts; a table of dead jobs with
name, attempts, last error (truncated in the UI to 200 chars with the full text in a `title`),
finished time, and **Retry** / **Discard** forms per row — plain forms, work without JavaScript,
`form-feedback` messages; `revalidatePath("/admin")` on success).

- [ ] **Step 4: Run** — `cd apps/api && bun test src/admin-api.test.ts`, `cd apps/auth && bun test`,
root typecheck, `bunx biome ci .`, `bun --filter @repo/auth build`.

- [ ] **Step 5: Commit** — `feat(api,auth): superadmin view of dead jobs with retry and discard`

---

### Task 6: Compose worker profile, docs, full gate

**Files:**
- Modify: `docker-compose.yml`, `scripts/docker.test.ts` (only if it must know about the new
  service), CLAUDE.md, `apps/api/README.md`, `apps/auth/README.md`, `docs/guides/deploying.md`,
  `docs/ROADMAP.md`, root and `apps/api/.env.example`
- Create: `docs/guides/background-jobs.md`

- [ ] **Step 1: Compose** — an `api-worker` service: same build as `api`
  (`docker/bun-service.Dockerfile`, `APP: api`), `command: ["bun", "src/worker.ts"]` (check the
  image's working directory and how `api` is started in that Dockerfile — the bundled entrypoint
  may need a second `bun build` output for `src/worker.ts`; add it to the Dockerfile if so),
  the api's environment, `profiles: ["worker"]`, healthcheck on its `/health`; when the profile is
  used, set `JOBS_WORKER: "false"` on `api` via an env override documented in the guide (do not
  change the default stack). Run `bun test scripts`.

- [ ] **Step 2: Docs**
  - CLAUDE.md: a **Jobs.** paragraph (in the house style of **Storage.** / **Telemetry**): table and
    statuses, `defineJob` / `enqueue` with `tx`, dedupe, retries and backoff, at-least-once and
    idempotency, the worker (in-process, `JOBS_WORKER=false`, `src/worker.ts`, the `worker` profile),
    claiming (SKIP LOCKED / SQLite), the scheduler and the four built-in schedules, what moved off
    `detach()` (and the two silent enqueues that keep it), payload clearing, the admin card,
    migration `0015_jobs`; env rows `JOBS_WORKER`, `JOBS_CONCURRENCY`, `JOBS_POLL_MS`; the Email
    paragraph's "Sends are detached" sentence rewritten for the queue; the Telemetry paragraph's
    "pruned on ingest" rewritten for the schedule.
  - `apps/api/README.md`: a Jobs section, the admin procedures in the route table, `0015`.
  - `apps/auth/README.md`: the Background jobs card.
  - `docs/guides/background-jobs.md`: defining a job, enqueueing (with `tx`), schedules and cron
    syntax, idempotency, running a dedicated worker (Compose profile, `JOBS_WORKER=false` on the api
    replicas), watching and retrying dead jobs, what is out of scope.
  - `docs/guides/deploying.md` env table; `.env.example` files; ROADMAP: tick **C Background jobs**.

- [ ] **Step 3: Full gate** — `bun run ci` exit 0; `bun --filter @repo/e2e e2e` (or build
www/app/auth/account and `cd apps/e2e && CI=1 bunx playwright test --retries=0`) — every journey
passes (sign-up verify, magic link, invitations and two-factor now go through the queue; the
api in e2e runs the in-process worker). If Docker has room, `docker compose --profile worker up -d
--build api api-worker` smoke: the worker boots healthy and a sign-up mail reaches Mailpit.

- [ ] **Step 4: Commit** — `docs: background jobs guide and the worker profile` (split into a
`feat(docker): …` commit for the Compose/Dockerfile change if it is more than a service block).
