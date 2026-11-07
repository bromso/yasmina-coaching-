# Load

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Load.** Phase 9 C: `apps/load` (`@repo/load`, private, never shipped) is a Bun-native load runner
— no k6 — over `apps/api` and `apps/ai`, run on demand against a stack it starts itself (fresh
SQLite under `apps/load/.tmp`, or Postgres with `LOAD_DB=postgres` / `LOAD_DATABASE_URL`) rather
than on a schedule, since the Actions minutes budget has run out more than once. `run({ name, vus?
| ratePerSecond?, durationMs, scenario })` drives a closed model (concurrent VUs) or an open model
(a fixed rate), recording each `ctx.measure(label, fn)` call into a log-linear histogram
(p50/p95/p99/max, throughput, errors by kind) and checking it against per-label thresholds
(`p95Ms?`, `errorRate?`, `max5xx?`); a refused target that is not loopback or `*.localhost`
needs `LOAD_ALLOW_REMOTE=1`. Three scenarios — `api-core` (steps of 10 → 50 → 100 → 200 VUs
through `auth.me`/`notes.list`/`notes.create`/`workspaces.list`, then the anonymous forms at
*production* rate limits, then `POST /chat` on the ai service's mock model), `realtime` (write→
delivery latency over N streams, the session/user/process caps, RSS, the slow-reader drop rule)
and `jobs-burst` (enqueue 5 000 jobs as fast as possible, measure drain time and exact-once
delivery) — plus four `drills` (database outage, slow queries via `API_TEST_QUERY_DELAY_MS`,
storage/mail provider failures, `SIGTERM` under load), each printing a `PASS`/`FAIL` line. The
`e2e` job runs a 20 s `api-core` smoke (`bun --filter @repo/load smoke`, 10 VUs, thresholds zero
5xx plus each of `auth.me`/`notes.list`/`notes.create`/`workspaces.list`'s own p95 budget from
`perf/budgets.json`'s `api` section — see **Performance** below) right after the Playwright
journeys, uploading `apps/load/.results` alongside the Playwright report — see **Quality gates**.
The numbers these scenarios reached on one machine, the bottlenecks they found (SQLite's single
writer and its cross-process busy wait — documented, not fixed), and what to tune
(`JOBS_CONCURRENCY`, `REALTIME_MAX_STREAMS`, Postgres pool size, replicas) are in
`docs/guides/capacity.md`. See `apps/load/README.md`.
