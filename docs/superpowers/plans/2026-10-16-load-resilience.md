# Load and resilience (Phase 9 C) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Repeatable load scenarios and failure drills for `apps/api` and `apps/ai`, a CI smoke that fails on gross regressions, the fixes the runs uncover, and a documented capacity baseline.

**Architecture:** A private `apps/load` workspace: a dependency-free Bun runner (closed and open models, log-linear latency histogram, thresholds), clients over the typed contract, a stack script that starts the api and ai services with load-test settings, four scenarios and a drills suite. The controller runs them on SQLite and Postgres, turns the findings into fix tasks, and records the numbers in `docs/guides/capacity.md`.

**Tech Stack:** Bun 1.4 (`fetch`, `Bun.spawn`, `bun test`), `@repo/api-contract` / oRPC client, Docker (Postgres drill only).

**Spec:** `docs/superpowers/specs/2026-10-16-load-resilience-design.md`

## Global Constraints

- `apps/load` is `private: true`, never built into an image, never imported by another workspace. No runtime dependency outside the repo (`@repo/api-contract`, `@orpc/client` via `catalog:`).
- Results go to `apps/load/.results/` and scratch to `apps/load/.tmp/` — both git-ignored.
- Target guard: refuse any target whose host is not `127.0.0.1`, `localhost`, `::1` or `*.localhost` unless `LOAD_ALLOW_REMOTE=1`.
- `API_TEST_QUERY_DELAY_MS` (api): honoured only when `NODE_ENV !== "production"`; when set, every `db` statement waits that long first. Validated in `env.ts` (integer 0–10 000); ignored (with one warning) in production.
- **Ruling (controller):** the CI smoke cannot reuse the e2e job's services — Playwright's `webServer` stops them when the run ends. The smoke starts its own api and ai through `apps/load`'s stack script on spare ports (3017 is the worker's; use 3027/3028), which needs no Next build and takes seconds.
- Implementers never run Playwright, `bun run ci`, or the full scenarios (a 10-minute watchdog kills long runs): they run unit tests and at most a 15-second scenario smoke. The controller runs the scenarios and drills.
- New workspace registration: root `typecheck` / `test:services` lists, CODEOWNERS, issue-template area lists, `docker-compose.dev.yml` volume lines, `workspace.code-workspace` — whatever `bun test scripts` requires.
- Biome clean, zero warnings; commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars.

## Review Focus

1. A load run accidentally pointed at a production deployment → the target guard refuses non-local hosts without `LOAD_ALLOW_REMOTE=1` (Task 1 test).
2. Percentiles that are wrong (off-by-one buckets, empty histograms) making a regression invisible → histogram tests against known distributions, including 0 and 1 samples (Task 1).
3. A scenario that "passes" because every request failed fast (5xx counted as fast latency) → thresholds include error rate and a 5xx count, and a label with zero successes fails (Task 1).
4. The open model silently degrading into a closed one when the target slows down (coordinated omission) → arrival-rate pacing schedules requests by wall clock, not by completions, and records the intended start time (Task 1 fake-clock test).
5. The slow-query hook leaking into production → ignored when `NODE_ENV=production` (Task 6 env test).

---

### Task 1: `apps/load` — workspace and runner

**Files:** Create `apps/load/package.json` (`@repo/load`, private, scripts `test`, `typecheck`, `stack`, `api-core`, `realtime`, `jobs-burst`, `drills`, `smoke`), `tsconfig.json`, `.gitignore` (`.results/`, `.tmp/`), `src/histogram.ts`, `src/runner.ts`, `src/target.ts`, `src/report.ts`, tests `src/*.test.ts`, `README.md` (stub, finished in Task 9); register the workspace (Global Constraints).

**Interfaces — Produces:**
- `createHistogram()` → `{ record(ms: number): void; count: number; percentile(p: number): number; max: number; mean: number; merge(other): void; toJSON() }` — log-linear buckets (e.g. 1 µs…60 s, ≤ 1 % relative error), no dependency.
- `run(opts: { name: string; vus?: number; ratePerSecond?: number; durationMs: number; warmupMs?: number; scenario: (ctx: VuContext) => Promise<void>; now?: () => number; sleep?: (ms) => Promise<void> }): Promise<RunResult>`; `VuContext = { vu: number; iteration: number; measure<T>(label: string, fn: () => Promise<T>): Promise<T> }` — `measure` times `fn`, records success, or the error kind (`status:<code>` from an oRPC/HTTP error, `timeout`, `network`, `other`) and rethrows; the runner catches scenario throws per iteration (counted, never fatal).
- Open model: start times are scheduled at `start + i / rate`; latency for an open-model request is measured from its *scheduled* start (no coordinated omission); `maxInFlight` (default 10 × rate) caps concurrency, counting `dropped` beyond it.
- `RunResult = { name, durationMs, labels: Record<label, { count, ok, errors: Record<kind, number>, p50, p95, p99, max, rps }> }`.
- `evaluate(result, thresholds: Array<{ label: string | "*"; p95Ms?: number; errorRate?: number; max5xx?: number; minOk?: number }>)` → `{ passed: boolean; failures: string[] }` — a label with `ok === 0` fails when `minOk` is unset (default 1).
- `targets()` → `{ api: URL; ai: URL; apiToken: string; aiToken: string }` from `LOAD_TARGET_API` / `LOAD_TARGET_AI` / `API_SERVICE_TOKEN` / `AI_SERVICE_TOKEN` (dev defaults from `@repo/api-contract`'s `DEV_API_TOKEN` and the ai dev token — find where it lives), throwing on a remote host without `LOAD_ALLOW_REMOTE=1`.
- `writeReport(result, evaluation)` → prints a table and writes `.results/<name>-<ISO>.json`; returns the path.

- [ ] **Step 1: Tests** — histogram: 1..10 000 uniform → p50 ≈ 5 000, p99 ≈ 9 900 within 1 %; a single sample → every percentile equals it; empty → 0 and `count 0`; merge adds counts. Runner (fake `now`/`sleep`): 3 VUs × 1 s with a 100 ms scenario → ~30 iterations; open model at 10/s with a scenario that takes 500 ms → latency recorded ≈ 500 ms from the scheduled start even as requests pile up, and `dropped` counts beyond `maxInFlight`; a throwing scenario is counted, not fatal; `measure` classifies an `ORPCError` with status 429 as `status:429`, an `AbortError` as `timeout`, a `TypeError` from fetch as `network`. `evaluate`: p95 over budget fails with a message naming the label; `max5xx: 0` fails on one 5xx; a label with no successes fails. `targets()`: `https://api.example.com` throws; with `LOAD_ALLOW_REMOTE=1` it passes; `http://api.brand.localhost:3007` passes.
- [ ] **Step 2–4:** FAIL → implement → PASS (`cd apps/load && bun test && bun run typecheck`; `bun test scripts`).
- [ ] **Step 5: Commit** `feat(load): a dependency-free load runner with thresholds`.

---

### Task 2: Clients and the stack script

**Files:** Create `apps/load/src/clients.ts`, `apps/load/scripts/stack.ts` (+ a test that it starts and stops on spare ports, ≤ 15 s), `apps/load/src/mail.ts` (read the `file` mailbox like `apps/e2e/fixtures/mail.ts`).

**Interfaces — Produces:** `apiClient({ clientId?, sessionToken?, requestId? })` → typed `ApiClient` (service bearer; `x-api-client-id` per VU); `signUpVerified(email)` → `{ client, sessionToken, userId }` (sign-up, read the verify link from the mailbox, `auth.verifyEmail`, `auth.signIn`); `withWorkspace(client)` → workspace id; `startStack({ db: "sqlite" | "postgres", apiPort, aiPort, env?: Record<string,string> })` → `{ apiUrl, aiUrl, stop(): Promise<void>, logPath }` — spawns `bun src/index.ts` in apps/api and apps/ai with: `NODE_ENV=production`, a fresh SQLite file under `apps/load/.tmp/` (or `DATABASE_URL` for postgres), `MAIL_PROVIDER=file` + `MAIL_DIR`, `STORAGE_PROVIDER=local` + a temp `STORAGE_DIR`, `API_RATE_LIMIT`/`SIGNUP_*`/`TELEMETRY_*` raised (copy the shape from `apps/e2e/e2e.env.ts`), `TWO_FACTOR_ENCRYPTION_KEY` (the e2e test key), `AI_MODEL=mock:echo`, the service tokens; waits for `/ready`; `stop()` sends SIGTERM and awaits exit. `bun run --filter @repo/load stack` runs it until Ctrl-C.

- [ ] Tests → implement → PASS → commit `feat(load): typed clients and a stack the scenarios can start`.

---

### Task 3: `api-core` scenario

**Files:** Create `apps/load/src/scenarios/api-core.ts` (+ `bin` entry in package.json scripts), `apps/load/src/pdf.ts` (tiny PDF bytes).

Behaviour as the spec's §2: setup signs up `max(vus)` users with workspaces (in parallel batches of 10); steps 10 → 50 → 100 → 200 VUs × 30 s (env-overridable `LOAD_STEPS`, `LOAD_STEP_MS` for the smoke); each iteration: `auth.me`, `notes.list`, `notes.create` (short body), `workspaces.list`; reports per step and the first step whose any-label p95 exceeds its budget (budgets: 250 ms reads, 500 ms writes). A separate open-model phase at 5/s for 30 s against the anonymous forms with production limits (the stack for this phase starts with default limits — or the phase runs against a second stack): asserts every non-2xx is a 429 and `max5xx: 0`. An ai phase: `POST /chat` (mock model, a one-message body; read apps/ai/README.md for the request shape) at 20 VUs × 20 s. A `--smoke` flag = 10 VUs × 20 s of the core loop only, thresholds `max5xx: 0`, `p95Ms: 1000` on `*`.
- [ ] Unit-test the pure parts (step parsing, threshold building); run `--smoke` for ≤ 20 s against a started stack once → commit `feat(load): the api-core scenario`.

---

### Task 4: `realtime` scenario

**Files:** Create `apps/load/src/scenarios/realtime.ts`, `apps/load/src/sse.ts` (a minimal SSE reader over `fetch` that parses `event:`/`data:`/`id:` lines and timestamps each event).

Behaviour as the spec: M workspaces (default 10), N streams (default 200, `LOAD_STREAMS`), each stream with a session of a member; a writer posts notes at 5/s per workspace carrying a `sentAt` in the body; the reader matches `note.created` events and records write→delivery latency; then probes the caps: 6th stream on one session → 429, 11th on one user → 429, and with a stack started with `REALTIME_MAX_STREAMS=50` the 51st → 503; samples `/metrics` (`realtime_streams_open`, `process_resident_memory_bytes`, needs `METRICS_TOKEN` on the stack) at 0, N/2, N streams; one stream that never reads its body must be dropped (it ends) while the others' p95 stays within budget. Thresholds: delivery p95 < 500 ms at the default N; caps answer exactly as configured.
- [ ] Unit-test the SSE parser (chunks splitting lines, multi-line data, comments `: ping`) → a ≤ 15 s smoke run → commit `feat(load): the realtime scenario`.

---

### Task 5: `jobs-burst` scenario

**Files:** Create `apps/load/src/scenarios/jobs-burst.ts`.

Behaviour as the spec: against a stack with the in-process worker, enqueue 5 000 jobs (`LOAD_JOBS`) as fast as possible — through product paths that enqueue (e.g. many `support.create` with raised limits produce two `mail.send` each; or analytics `analytics.ingest` producing `analytics.event`) — the enqueue path must be a real api path, not direct SQL; poll `jobs_queue` via `/metrics` until queued+running = 0; drain time; assert succeeded count = enqueued (read via `admin.jobs.list` is too coarse — use the metrics counters `job_runs_total{outcome}` and, for mail, count files in the mailbox: exactly one per mail job); meanwhile a probe loop measures `notes.list` p95. Thresholds: no `dead`, no duplicate mail file, drain time reported (no hard threshold), probe p95 < 1 000 ms.
- [ ] Unit-test the pure parts → a small (200-job) run → commit `feat(load): the jobs-burst scenario`.

---

### Task 6: `drills` (+ the api's slow-query hook)

**Files:** Modify `apps/api/src/env.ts` (+ test: `API_TEST_QUERY_DELAY_MS` parsed, ignored and warned once in production), `apps/api/src/db.ts` (when the delay is set and not production, wrap statements so each awaits the delay first — on both engines; keep the SQLite gate semantics); Create `apps/load/src/drills/{database,slow,providers,sigterm}.ts`, `apps/load/src/drills/index.ts` (runs all, or one by name).

Each drill per the spec §2.4, each printing PASS/FAIL with the measured numbers:
1. database — SQLite: open a second `new SQL(file)` holding `BEGIN EXCLUSIVE` for 10 s while a load loop runs; `/ready` must answer 503 within its timeout, requests must finish (success or error) within `max(client timeout, busy_timeout + 1 s)`, and all succeed again after release. Postgres (only when `LOAD_DRILL_POSTGRES=1`; requires docker): `docker run -d --rm -p 5499:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`, start the stack on it, `docker pause` for 10 s, `unpause`, same assertions; always `docker rm -f` the container in a finally.
2. slow — stack with `API_TEST_QUERY_DELAY_MS=200`: p95 of `notes.list` ≥ 200 ms and < 2 000 ms, zero 5xx, no request outlives the client timeout.
3. providers — stack with `STORAGE_PROVIDER=s3` + `S3_ENDPOINT=http://127.0.0.1:9` (closed port) and `MAIL_PROVIDER=smtp` + `SMTP_URL=smtp://127.0.0.1:9`: an avatar upload answers a clean error (not a hang, not a crash), mail jobs go to retry (`job_runs_total{outcome="retried"}` rises), `notes.list` p95 unaffected.
4. sigterm — a load loop at 20 VUs; send SIGTERM; requests already in flight complete (count completions vs starts), the port stops accepting within `drainMs`, exit code 0, no unhandled error in the log.
- [ ] Env/db unit tests → implement → run each drill once quickly where possible (≤ 30 s each; the controller runs the full set) → commit `feat(load): failure drills; feat(api): a test-only slow-query hook` (two commits).

---

### Task 7: CI smoke

**Files:** Modify `.github/workflows/ci.yml` (e2e job: after "Run the journeys", a step `bun --filter @repo/load smoke` that runs only when the journeys passed (the default `success()`); upload `apps/load/.results` with the Playwright report), `scripts/ci-plan.ts` (`@repo/load` in `E2E_TARGETS`) + `scripts/ci-plan.test.ts`, `scripts/github.test.ts` if it pins the e2e job's steps. The `smoke` script starts its own stack on 3027/3028 (SQLite), runs `api-core --smoke`, stops the stack, exits non-zero on a threshold failure.
- [ ] `bun test scripts` → commit `ci: a 20-second load smoke in the e2e job`.

---

### Task 8 (controller): run everything, record the numbers, find the bottlenecks

- [ ] Start the stack on SQLite; run `api-core`, `realtime`, `jobs-burst`, `drills`; save each result JSON and the console output to the SDD workspace. Repeat `api-core`, `realtime`, `jobs-burst` on Postgres 17 (`DATABASE_URL`), and the Postgres database drill with `LOAD_DRILL_POSTGRES=1`.
- [ ] Write `load-findings.md`: each failure or surprising number, its likely cause, and whether it's a small fix (this PR) or large (C2). Dispatch fix tasks (Task 4-style: fix at the source, regression test in its own package), rerun the affected scenario.

---

### Task 9: Docs

**Files:** Create `docs/guides/capacity.md` (method, machine — CPU/RAM/OS, Bun version —, every number from Task 8 per engine, the bottleneck found, what to tune: `JOBS_CONCURRENCY`, `REALTIME_MAX_STREAMS`, Postgres pool size/`max` connections, replicas behind a load balancer and what is per-process (in-memory limiters, memory realtime bus on SQLite), how to rerun); finish `apps/load/README.md`; CLAUDE.md (`apps/load` in the Apps list, a **Load** paragraph near **Operations**, `API_TEST_QUERY_DELAY_MS` env row marked test-only, the e2e job's smoke in Quality gates, workspace lists); `docs/ROADMAP.md` (tick Phase 9 B "(merged as #89, #90)"; C unticked).
- [ ] Numbers come from Task 8's files, verbatim. `bun test scripts`, `bunx biome ci .` → commit `docs: load testing and the capacity baseline`.
