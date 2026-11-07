# @repo/load

Load scenarios and failure drills for `apps/api` and `apps/ai` (Phase 9 C). Private, local, never
shipped: nothing imports it and no image builds it. A Bun-native runner — no k6, no external
dependency — because the thresholds and the drills need to reach into this repo's own `/metrics`
and mailbox directory.

```bash
bun --filter @repo/load test        # the runner's own unit tests (histogram, pacing, thresholds, target guard)
bun --filter @repo/load stack       # start apps/api + apps/ai with load-test settings (Ctrl-C stops)
bun --filter @repo/load api-core    # the step scenario (also: realtime, jobs-burst, drills)
bun --filter @repo/load smoke       # 10 VUs × 20 s, the CI gate
```

Results go to `apps/load/.results/<scenario>-<ISO>.json`, scratch (a fresh SQLite file, the `file`
mail provider's directory, local storage, process logs) to `apps/load/.tmp/stack-<port>/` — both
git-ignored. A run refuses any target that is not `127.0.0.1`, `localhost`, `::1` or `*.localhost`
unless `LOAD_ALLOW_REMOTE=1` (`src/target.ts`).

Numbers reached on this machine, per engine, and the bottlenecks they expose: `docs/guides/capacity.md`.

## Running against a stack

Every scenario and drill runs two ways:

- **With nothing set**: it starts its own `apps/api` + `apps/ai` on `DEFAULT_PORTS` (3027/3028)
  and stops both when it finishes. This is the default — just run the scenario.
- **Against an already-running stack**: start one yourself with `bun --filter @repo/load stack`
  (prints the env to export — `LOAD_TARGET_API`, `LOAD_TARGET_AI`, `API_SERVICE_TOKEN`,
  `AI_SERVICE_TOKEN`, `LOAD_MAIL_DIR`, `METRICS_TOKEN`), export those in another terminal, then run
  the scenario. Useful for watching `/metrics` or the process's RSS live while a scenario runs, or
  for pointing `realtime`'s measurement phase at a stack whose caps you've changed.

`bun --filter @repo/load stack [--db sqlite|postgres] [--api-port N] [--ai-port N]` starts the api
in production mode, a fresh SQLite file under `.tmp/` (or `LOAD_DATABASE_URL` / `DATABASE_URL` on
Postgres — see **Postgres** below), `MAIL_PROVIDER=file`, local storage, and raised per-client rate
limits so the closed-model scenarios measure the api rather than its limiter; the ai service runs
on the keyless `mock:echo` model. Both bind `127.0.0.1` only.

## Postgres

`LOAD_DB=postgres` (with `LOAD_DATABASE_URL`, or `DATABASE_URL`) runs a scenario's own stack on
Postgres instead of SQLite — every scenario and the `stack` script read it the same way
(`src/stack.ts`'s `loadDb()`). Point it at a local Postgres 17, e.g. the one `docker-compose.yml`
already runs, or a throwaway container:

```bash
docker run --rm -d -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine
LOAD_DB=postgres LOAD_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  bun --filter @repo/load api-core
```

The database drill's Postgres variant is separate: it starts and `docker pause`/`unpause`s its own
throwaway container (needs Docker) and only runs with `LOAD_DRILL_POSTGRES=1`.

## Scenarios

- **`api-core`** (`src/scenarios/api-core.ts`) — steps of 10 → 50 → 100 → 200 VUs (`LOAD_STEPS`),
  30 s each (`LOAD_STEP_MS`): sign in, `auth.me`, `notes.list`, `notes.create`, `workspaces.list`
  as one signed-in user per VU. Then an open-model phase on the anonymous forms (`waitlist.join`,
  `support.create`, `jobs.apply`) at 5/s for 30 s, at *production* rate limits — on purpose, to
  prove every refusal is a `429` and nothing is a `5xx`, with successes capped at each procedure's
  own per-client limit (`ANON_CLIENT_LIMITS`, read off `apps/api/src/server.ts`). Then
  `POST /chat` against the ai service's mock model, 20 VUs for 20 s. `--smoke` runs only the first
  10 VU step, 20 s, with zero 5xx plus each core label's own p95 budget
  (`auth.me`/`notes.list`/`notes.create`/`workspaces.list`), read straight from
  `perf/budgets.json`'s `api` section (`smokeThresholds`) rather than one blanket ceiling — the CI
  gate (`bun --filter @repo/load smoke`). `--write-results` (or `PERF_WRITE_RESULTS=1`) writes the
  smoke's measured p95s to `perf/.results/api.json` for `bun run perf:update`; see
  `docs/guides/performance.md`.
- **`realtime`** (`src/scenarios/realtime.ts`) — `LOAD_STREAMS` streams (default 200) spread over
  `LOAD_WORKSPACES` workspaces (default 10); each workspace's owner writes a note every 200 ms for
  `LOAD_REALTIME_DURATION_MS` (default 30 s) and every reader's write→delivery latency goes into
  one histogram. Then four independent probes: the per-session cap (6th stream, 429), the per-user
  cap (11th stream, 429), the process cap (`REALTIME_MAX_STREAMS=<LOAD_PROCESS_CAP>`, default 50,
  on its own dedicated stack — the (cap + 1)th stream across however many users that needs, 503),
  and the drop rule (a non-reading stream pushed past the server's 256 KiB queued-bytes ceiling by
  a burst of large notes, observed through `/metrics`' `realtime_streams_open`). `/metrics` is
  sampled at 0, N/2 and N open streams for RSS.
- **`jobs-burst`** (`src/scenarios/jobs-burst.ts`) — enqueues `LOAD_JOBS` jobs (default 5000) via
  `auth.magicLink.request`, `LOAD_JOBS_CONCURRENCY` (default 50) calls at a time, as fast as
  possible; measures drain time by polling `/metrics`' `jobs_queue{status}` gauge; asserts every
  job ends `succeeded` exactly once (`job_runs_total` deltas, one new mail file per job, zero
  dead); a probe loop hammers `notes.list` the whole time it drains.
- **`drills`** (`src/drills/index.ts`; `bun --filter @repo/load drills [database|slow|providers|sigterm …]`,
  none named runs all) — each starts and stops its own stack and prints one `PASS`/`FAIL` line:
  1. **`database`** — a write lock (SQLite: `BEGIN EXCLUSIVE` from a second connection in this
     process; Postgres, `LOAD_DRILL_POSTGRES=1` only: a paused Docker container) blocks the
     database mid-load. `/ready` must turn 503, requests fail within a bound, and the api recovers
     without a restart. SQLite's own synchronous busy wait blocks the event loop too (F3, not
     fixed — see `docs/guides/capacity.md`), so that variant only asserts recovery and survival,
     recording the stall as information.
  2. **`slow`** — every statement delayed by `API_TEST_QUERY_DELAY_MS` (test-only, ignored outside
     `NODE_ENV=test`/non-production). `notes.list`'s p95 rises but stays under 2 s, no 5xx, no
     request outlives the client timeout.
  3. **`providers`** — storage pointed at a closed port, mail at a refusing SMTP URL. An avatar
     upload answers its declared 503 promptly (the api still answers `/health`), mail jobs retry
     with backoff and never go `dead`, unrelated `notes.list` traffic is unaffected.
  4. **`sigterm`** — 20 VUs under load, then `SIGTERM`. Every in-flight request finishes, the port
     refuses new connections within `drainMs` (8 s), the process exits 0, and the post-signal log
     holds no error line.

## Environment

| Var | Scenario/drill | Default | What |
|---|---|---|---|
| `LOAD_TARGET_API`, `LOAD_TARGET_AI` | all | the dev ports (`api`/`ai`.brand.localhost) | point at an already-running stack instead of starting one |
| `API_SERVICE_TOKEN`, `AI_SERVICE_TOKEN` | all | the public dev tokens | the bearer for `LOAD_TARGET_*` |
| `LOAD_ALLOW_REMOTE` | all | unset (refuse) | `1` to target a non-local host |
| `LOAD_DB` | `stack`, every scenario | `sqlite` | `postgres` to run that scenario's own stack on Postgres |
| `LOAD_DATABASE_URL` (or `DATABASE_URL`) | `stack`, every scenario | — | required when `LOAD_DB=postgres` |
| `METRICS_TOKEN` | `realtime`, `jobs-burst`, `providers` | the stack's own fixed token | the `/metrics` bearer, when pointing at an already-running stack |
| `LOAD_MAIL_DIR` | `jobs-burst` | the stack's own mail dir | where to read sent mail, when pointing at an already-running stack |
| `LOAD_STEPS` | `api-core` | `10,50,100,200` | comma-separated VU counts |
| `LOAD_STEP_MS` | `api-core` | `30000` | each step's duration |
| `LOAD_STREAMS` | `realtime` | `200` | total streams across every workspace |
| `LOAD_WORKSPACES` | `realtime` | `10` | how many workspaces share those streams |
| `LOAD_REALTIME_DURATION_MS` | `realtime` | `30000` | the writer/reader measurement phase |
| `LOAD_PROCESS_CAP` | `realtime` | `50` | the process-cap probe's own `REALTIME_MAX_STREAMS` |
| `LOAD_JOBS` | `jobs-burst` | `5000` | jobs to enqueue |
| `LOAD_JOBS_CONCURRENCY` | `jobs-burst` | `50` | enqueue calls in flight at once |
| `LOAD_DRAIN_TIMEOUT_MS` | `jobs-burst` | `120000` | how long to wait for the queue to empty |
| `LOAD_DRILL_POSTGRES` | `drills database` | unset (skip) | `1` to also run the Postgres variant (needs Docker) |

## How it's built

- `src/runner.ts` — `run({ name, vus? | ratePerSecond?, durationMs, warmupMs?, scenario })` drives
  a closed model (`vus` concurrent virtual users) or an open model (a fixed arrival rate).
  `ctx.measure(label, fn)` records each call into a log-linear histogram (`src/histogram.ts`,
  no dependency): p50/p95/p99/max, throughput, and errors by kind. `evaluate` checks a result
  against `Threshold[]` (`{ label, p95Ms?, errorRate?, max5xx? }`); `src/report.ts` prints
  the stdout table and writes the JSON file.
- `src/stack.ts` / `scripts/stack.ts` — starts and stops the two processes (see **Running against
  a stack** above); exported `apiEnvFor` / `aiEnvFor` are unit-tested directly.
- `src/target.ts` — resolves and guards `LOAD_TARGET_*`.
- `src/clients.ts` — the typed `@repo/api-contract` / `@repo/ai-contract` clients, a per-VU
  `x-api-client-id` so the per-client limiter sees distinct clients, and `signUpVerified` /
  `withWorkspace` helpers that read the `file` mail provider's directory the way `apps/e2e` does.
- `src/metrics-client.ts` — parses the api's Prometheus `/metrics` text for the scenarios that
  sample a gauge (`realtime_streams_open`, `jobs_queue{status}`, `process_resident_memory_bytes`).
- `src/drills/common.ts` — shared drill plumbing: `setupUsers`, `startLoop`, `probeReady`,
  `percentile`, `check`/`result` (the `PASS`/`FAIL` line format).
