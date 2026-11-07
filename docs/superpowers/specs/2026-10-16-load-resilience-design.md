# Load and resilience (Phase 9 C) — design

Phase 9 is production hardening: A accessibility (#88) → B operations (#89, #90) → **C load and
resilience** (this spec) → D performance budgets (→ E security scanning, optional). Approved in chat
on 2026-10-16. One PR; a fix too large for it becomes a C2 PR, said so in the PR.

## Intent

No load test or capacity number exists. C adds repeatable load scenarios and failure drills for
`apps/api` and `apps/ai`, fixes what they find, documents the capacity reached, and puts a cheap
smoke in CI so a gross regression fails a PR. Success: four scenarios and a drill suite run with one
command against a local stack and print pass/fail against thresholds; `docs/guides/capacity.md`
records numbers on SQLite and Postgres; the e2e job runs a 20-second smoke that fails on any 5xx or
a p95 over its ceiling.

Decided with the owner: **local on-demand scenarios + a small CI smoke** (not a nightly job — the
Actions budget has run out three times); **a Bun-native runner** (not k6); scope **core api flows,
realtime streams, jobs under pressure, failure drills**.

## 1. `apps/load` (new private workspace, never shipped)

- `src/runner.ts`: `run({ name, vus? | ratePerSecond?, durationMs, warmupMs?, scenario })` drives
  `scenario(ctx)` with `vus` concurrent virtual users (closed model) or a fixed arrival rate (open
  model). Each request is recorded under a label (`ctx.measure(label, fn)`): an HDR-style log-linear
  histogram (no dependency), p50/p95/p99/max, throughput, and errors by status/kind. Output: a table
  on stdout and `apps/load/.results/<scenario>-<ISO>.json` (git-ignored). Thresholds per scenario:
  `{ label, p95Ms?, errorRate?, maxStatus5xx? }` → exit 1 on breach.
- `src/target.ts`: `LOAD_TARGET_API` / `LOAD_TARGET_AI` (default the local dev ports), the service
  tokens from env (dev defaults outside production); refuses a non-loopback, non-`*.localhost`
  target unless `LOAD_ALLOW_REMOTE=1`.
- `src/clients.ts`: the typed `@repo/api-contract` client (service bearer, per-VU `x-api-client-id`
  so the per-client limiter sees distinct clients), sign-up/verify helpers through the api (the
  `file` mail provider's directory, as `apps/e2e` reads it).
- `scripts/stack.ts` (`bun run --filter @repo/load stack`): starts `apps/api` (fresh SQLite under
  `apps/load/.tmp`, or `DATABASE_URL` for Postgres; `MAIL_PROVIDER=file`; raised rate limits for the
  closed-model scenarios — the anonymous-form scenario keeps production limits on purpose) and
  `apps/ai` on `mock:echo`, waits for `/ready`, stops both on exit.

## 2. Scenarios (`bun run --filter @repo/load <name>`)

- `api-core`: steps of 10 → 50 → 100 → 200 VUs, 30 s each: sign in, `auth.me`, `notes.list`,
  `notes.create`, `workspaces.list`; and a separate open-model phase on the anonymous forms
  (`waitlist.join`, `support.create`, `jobs.apply` with a tiny PDF) at production limits, asserting
  every refusal is a 429 and nothing is a 5xx; plus `POST /chat` on the ai service (mock model).
  Records the step where any label's p95 exceeds its budget.
- `realtime`: N streams (`GET /events/workspaces/:id` with a session) over M workspaces, notes
  written at a fixed rate; measures write→delivery p95, the per-session/per-user caps (429) and the
  process cap (503) at their configured values, RSS and `realtime_streams_open` per stream count; a
  deliberately non-reading client is dropped without delaying the others.
- `jobs-burst`: enqueue 5 000 jobs (mail on `file`, analytics events) as fast as possible; measure
  drain time at the default `JOBS_CONCURRENCY`, assert every job ends `succeeded` exactly once (row
  counts and mail files), and api p95 for `notes.list` while the in-process worker drains.
- `drills` (each a pass/fail check, own process lifecycle):
  1. database outage mid-load — Postgres: `docker pause` / `unpause` of a throwaway container
     started by the drill; SQLite: a second connection holding `BEGIN EXCLUSIVE` — `/ready` turns
     503, requests fail within a bound (no hang beyond the client timeout), and the api recovers
     without a restart;
  2. slow queries — a test-only `API_TEST_QUERY_DELAY_MS` hook (honoured only when `NODE_ENV` is
     not `production`) — p95 rises but no 5xx beyond the delay's effect, nothing deadlocks;
  3. storage and mail providers failing (unreachable S3 endpoint, an SMTP URL that refuses) — the
     affected requests answer their declared errors, jobs retry with backoff, unrelated requests
     unaffected;
  4. SIGTERM under load — in-flight requests finish within `drainMs`, new connections are refused,
     the process exits 0, jobs in flight are reclaimed later.

## 3. CI smoke

In the existing `e2e` job after the Playwright run (its api and ai are already up): `api-core` at 10
VUs for 20 s, thresholds: zero 5xx, p95 under 1 000 ms for every label. Results JSON uploaded with
the Playwright report. `scripts/ci-plan.ts` treats `@repo/load` like `@repo/e2e` (it runs when the
e2e job runs).

## 4. Findings, capacity, docs

- Fixes the runs uncover land in this PR when small (a missing timeout, a limiter answering 5xx, a
  leak); a large one becomes C2. Each fix gets a regression test in its own package.
- `docs/guides/capacity.md`: method, machine, the numbers each scenario reached on SQLite and
  Postgres (17), the bottleneck found, what to tune (`JOBS_CONCURRENCY`, `REALTIME_MAX_STREAMS`,
  pool size, replicas), how to rerun.
- `apps/load/README.md`; CLAUDE.md (apps list, a **Load** paragraph, gates); ROADMAP: tick B "(merged
  as #89, #90)" now, C stays unticked until merge; the new workspace in CODEOWNERS / issue templates /
  dev compose / VS Code workspace lists as `bun test scripts` requires.

## Testing

`apps/load` unit tests for the histogram (percentiles against a known distribution), the
open/closed models' pacing (fake clock), threshold evaluation, the target guard; the scenarios and
drills are themselves the integration checks, each run once by the controller with its output
recorded in the PR.

## Out of scope

Distributed load generation, soak tests beyond ~10 minutes, browser-level load, load against a
deployed production stack, autoscaling.
