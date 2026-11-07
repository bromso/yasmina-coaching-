# Capacity

Phase 9 C: repeatable load scenarios and failure drills for `apps/api` and `apps/ai`
(`apps/load`, never shipped), the fixes they found, and the numbers reached on one machine. This
guide is the baseline — rerun it after a change to the request path, the job queue or the realtime
bus, rather than trust last quarter's numbers.

## Method and machine

Every number below came from `apps/load`'s four scenarios (`api-core`, `realtime`, `jobs-burst`,
`drills`) run against a stack this package starts itself (`bun --filter @repo/load stack`, or each
scenario's own default), in production mode, on SQLite and on Postgres 17. **The load generator ran
on the same machine as the stack it was loading** — they competed for the same CPU, so the numbers
below are a lower bound on what dedicated hardware on each side would reach, not an upper one.

- **Machine:** Apple M2 Max, 64 GB RAM, macOS 26.6.2.
- **Runtime:** Bun 1.4.2.
- **Postgres:** 17, in Docker, on the same machine.
- **ai service:** the keyless `mock:echo` model — `api-core`'s `ai.chat` phase measures the HTTP
  and streaming path, not a real model's latency.

See `apps/load/README.md` for what each scenario and drill does and how to run them; `how to
rerun`, below, for exact commands.

## `api-core`

Four steps of 10 → 50 → 100 → 200 VUs, 30 s each, each iteration calling `auth.me`, `notes.list`,
`notes.create` and `workspaces.list` as one signed-in user (`READ_BUDGET_MS` 250 ms / `WRITE_BUDGET_MS`
500 ms are reported per label, not enforced — reaching one is the point of a capacity run, not a
failure). Then an open-model phase on the anonymous forms at production rate limits (`waitlist.join`,
`support.create`, `jobs.apply`), then `POST /chat` on the ai service's mock model at 20 VUs for 20 s.
Zero 5xx throughout, on both engines, at every step.

The tables below are sourced from the first finding run on each engine (`sqlite-api-core.log`,
`pg-api-core.log` — both `exit 1` only on the since-fixed anonymous-phase assertion, not a real
failure; see the anon-phase paragraphs below); the confirming clean rerun on each engine
(`sqlite-api-core-2.log`, `pg-api-core-2.log`, both `PASS`, `exit 0`) is not separately tabulated
here, since run-to-run timing on a shared machine varies a little (e.g. SQLite 10 VU: 1033.3 rps /
max 20.2 ms below vs. 1040.4 rps / max 15.1 ms in the `-2` rerun) without changing any conclusion.

### SQLite

| step | iterations | label | rps | p50 ms | p95 ms | p99 ms | max ms |
|---|---|---|---|---|---|---|---|
| 10 VU | 30 994 | auth.me | 1033.3 | 1.9 | 5.0 | 7.2 | 20.2 |
| | | notes.create | 1033.2 | 2.3 | 5.9 | 7.9 | 23.8 |
| | | notes.list | 1033.2 | 1.9 | 4.9 | 6.9 | 23.9 |
| | | workspaces.list | 1033.1 | 2.0 | 5.2 | 7.2 | 25.3 |
| 50 VU | 31 097 | auth.me | 1037.8 | 10.8 | 17.3 | 23.4 | 33.0 |
| | | notes.create | 1037.1 | 12.0 | 18.5 | 24.0 | 32.5 |
| | | notes.list | 1037.5 | 10.8 | 17.2 | 23.6 | 33.0 |
| | | workspaces.list | 1036.6 | 11.6 | 18.1 | 23.7 | 32.9 |
| 100 VU | 31 286 | auth.me | 1045.9 | 17.6 | 35.2 | 40.1 | 82.7 |
| | | notes.create | 1043.5 | 28.7 | 38.8 | 42.1 | 69.3 |
| | | notes.list | 1045.3 | 18.2 | 34.2 | 39.8 | 71.3 |
| | | workspaces.list | 1042.9 | 28.1 | 38.3 | 41.6 | 75.2 |
| 200 VU | 31 306 | auth.me | 1049.7 | 31.0 | 86.3 | 94.5 | 191.2 |
| | | notes.create | 1044.6 | 55.2 | 90.9 | 96.5 | 133.2 |
| | | notes.list | 1045.9 | 35.5 | 57.2 | 89.9 | 136.9 |
| | | workspaces.list | 1043.5 | 54.1 | 89.9 | 96.0 | 134.4 |

No step exceeded its latency budget. Throughput is **flat** across the whole 10 → 200 VU range —
≈ 1 045 it/s (iterations/s; four calls per iteration, so ≈ 4 200 req/s) at every step, p95 rising
from ≈ 25 ms to ≈ 90 ms as VUs queue behind the one connection. This is SQLite's single-writer
ceiling, not a server bug — see **Bottlenecks** below.

Anonymous phase (open model, 5/s per form, 30 s): `jobs.apply` 3/50 succeeded, `support.create`
5/50, `waitlist.join` 5/50 — every other call `status:429`, zero 5xx. These are exactly each
procedure's per-client limit (`ANON_CLIENT_LIMITS` in the scenario: 3, 5, 5 respectively, read off
`apps/api/src/server.ts`'s `jobsLimiter` / `supportLimiter` / `waitlistLimiter`), so this is a
**pass** — the first finding run (G1, before the scenario's own rule was fixed) misread "some
calls succeeded" as a bug; the api was never wrong, the assertion was. See `load-findings-2.md`.

`ai.chat`: 43 733 iterations in 20 s at 20 VUs, 2186.7 rps, p50 8.7 ms, p95 12.4 ms, p99 14.0 ms, max 60.0 ms.

### Postgres

| step | iterations | label | rps | p50 ms | p95 ms | p99 ms | max ms |
|---|---|---|---|---|---|---|---|
| 10 VU | 15 094 | auth.me | 503.5 | 2.0 | 2.9 | 3.9 | 12.5 |
| | | notes.create | 503.3 | 6.4 | 8.6 | 11.3 | 40.4 |
| | | notes.list | 503.4 | 4.5 | 6.3 | 8.0 | 28.5 |
| | | workspaces.list | 503.1 | 6.3 | 8.4 | 10.8 | 36.1 |
| 50 VU | 35 875 | auth.me | 1197.5 | 4.0 | 7.5 | 15.3 | 76.3 |
| | | notes.create | 1196.5 | 12.5 | 20.5 | 37.5 | 160.6 |
| | | notes.list | 1197.1 | 9.2 | 16.0 | 31.8 | 117.7 |
| | | workspaces.list | 1195.8 | 12.1 | 20.5 | 38.5 | 112.9 |
| 100 VU | 44 989 | auth.me | 1502.7 | 6.4 | 11.7 | 33.9 | 226.0 |
| | | notes.create | 1500.6 | 19.1 | 28.6 | 89.9 | 402.6 |
| | | notes.list | 1501.7 | 14.8 | 23.0 | 79.6 | 326.1 |
| | | workspaces.list | 1499.6 | 18.9 | 28.4 | 90.4 | 405.4 |
| 200 VU | 51 830 | auth.me | 1733.3 | 12.1 | 19.8 | 45.2 | 313.9 |
| | | notes.create | 1729.9 | 32.3 | 45.4 | 153.1 | 664.4 |
| | | notes.list | 1731.5 | 26.2 | 37.0 | 140.8 | 583.1 |
| | | workspaces.list | 1727.7 | 32.9 | 46.0 | 156.2 | 724.3 |

No step exceeded its latency budget. Throughput **scales** with load — 503 → 1 196 → 1 500 → 1 728
it/s across 10 → 200 VUs (≈ 2 000 → ≈ 6 900 req/s) — at the cost of a wider tail (p99 up to 156 ms,
max up to 724 ms at 200 VUs) as Postgres's own connection pool and CPU saturate on this one shared
machine.

Anonymous phase: same shape as SQLite — `jobs.apply` 3/50, `support.create` 5/50, `waitlist.join`
5/50, every other call `status:429`, zero 5xx. Pass.

`ai.chat`: 44 310 iterations in 20 s at 20 VUs, 2215.5 rps, p50 8.5 ms, p95 12.2 ms, p99 14.0 ms,
max 42.5 ms — unaffected by the engine, since `apps/ai` never touches the database.

## `realtime`

200 streams over 10 workspaces, each workspace's owner writing a note every 200 ms for 30 s;
measures write→delivery latency, the session/user/process caps, RSS at 0/100/200 open streams, and
the drop rule for a non-reading stream.

| engine | delivery p50 | p95 | p99 | max | RSS @ 0 | RSS @ 100 | RSS @ 200 | drop probe |
|---|---|---|---|---|---|---|---|---|
| SQLite | 11.1 ms | 22.5 ms | 28.4 ms | 34.4 ms | 193.4 MB | 377.8 MB | 378.0 MB | dropped |
| Postgres | 17.6 ms | 27.1 ms | 31.2 ms | 35.9 ms | 190.3 MB | 477.4 MB | 478.7 MB | dropped, 225 notes |

Caps, both engines: the 6th stream on one session → `429` (`maxPerSession: 5`); the 11th stream on
one user across sessions → `429` (`maxPerUser: 10`); on a dedicated stack with
`REALTIME_MAX_STREAMS=50`, the 51st stream → `503`. All at their configured defaults.

**RSS is not ≈ 1 MB per stream** — the original "1 MB per stream" read of this data was wrong. In
both the original run and a rerun, RSS jumps once, between the 0-stream and 100-stream samples, and
then stays flat from 100 to 200 streams (393.0 → 393.1 MB originally; 477.4 → 478.7 MB on the
rerun — **≈ 13 KB per stream** between 100 and 200). The jump happens during provisioning (sign-ups
with password hashing, workspace creation, first use of the pool and other code paths run before
the 100-stream sample), not per stream; the 64 KiB stream buffer is a high-water mark, not an
allocation, and an idle stream holds almost nothing. See `fix-2-report.md`.

**The drop rule needed a scenario fix, not a server fix (G2).** The server's drop logic
(`stream.ts`'s `write()`, closing a stream once `desiredSize < -maxQueuedBytes`) runs identically on
both buses — the Postgres broadcaster only changes *when* `write()` runs (after the `pg_notify`
round trip), never what it does. The first Postgres run failed the probe because its fixed
250-note burst sat right on the edge of the real threshold (175–250+ notes, ≈ 1.2–1.75+ MB,
measured on both engines) and because the probe started reading immediately after the last
`notes.create` resolved, draining the queue before it crossed the ceiling on Postgres's slightly
slower delivery path. The fixed probe sends batches of 25 notes until `/metrics`'
`realtime_streams_open` shows the drop (up to 1 000 notes, ≈ 4x the worst case seen), and waits
1 s before its first read so in-flight NOTIFYs land first. The rerun needed 225 notes on
Postgres — just under the old fixed 250, confirming how thin that margin was.

## `jobs-burst`

5 000 jobs (`auth.magicLink.request`, one `mail.send` job each) enqueued as fast as possible,
50 at a time; drain measured by polling `/metrics`' `jobs_queue{status}` gauge at the default
`JOBS_CONCURRENCY` (4); a probe loop hammers `notes.list` throughout.

| engine | enqueue | drain | probe (`notes.list`) rps | p50 | p95 | p99 | max |
|---|---|---|---|---|---|---|---|---|
| SQLite | 5 000 ok, 0 failed, 1.8 s | 5.1 s | 496.9 | 1.2 ms | 5.5 ms | 19.5 ms | 28.6 ms |
| Postgres | 5 000 ok, 0 failed, 1.4 s | 9.2 s | 317.5 | 2.7 ms | 4.4 ms | 22.0 ms | 42.6 ms |

Every job ended `succeeded` exactly once on both engines — no dead jobs, no duplicates, one mail
file per job. SQLite drains faster here because the worker and the api share one process and one
file with no network round trip per claim; Postgres's longer drain is the `FOR UPDATE SKIP LOCKED`
claim plus network latency to the same Docker container the api and the load generator were both
competing with for CPU.

## Drills

All four pass on both engines (the Postgres database variant only runs with
`LOAD_DRILL_POSTGRES=1`, since it needs Docker):

- **`database`** (outage mid-load, `REQUEST_TIMEOUT_MS=3000` on the drill's own stack):
  - **Postgres** (`docker pause`/`unpause`): `/ready` answers `200×2, 503×4` during the outage
    (no probe later than 3 000 ms); the slowest request overlapping the outage finished in
    3 004 ms (bound 4 000 ms = `REQUEST_TIMEOUT_MS` + 1 s), zero client timeouts — 85 requests,
    30 of them `status:503`; after release, 4 771/4 771 ok, p95 8 ms; `/ready` 200; same api
    process (no restart). This is F1 and F2 working end to end.
  - **SQLite** (a second connection holding `BEGIN EXCLUSIVE`): recorded, not judged, per F3 —
    `/ready` answered `200×1, timeout×3` during the outage, longest stall 10 001 ms over 83
    requests (8 of them timing out), because SQLite's synchronous busy wait blocks the api's
    whole event loop for up to `busy_timeout` (5 s) per attempt, so neither `READY_TIMEOUT_MS` nor
    `REQUEST_TIMEOUT_MS` can fire meanwhile. After release: 9 436/9 436 ok, p95 6 ms; `/ready` 200;
    same process. Recovery and survival, not responsiveness during the outage, is what SQLite is
    held to here.
- **`slow`** (`API_TEST_QUERY_DELAY_MS=200`, test-only): `notes.list` p95 1 025 ms over 80
  requests (wanted ≥ 200, < 2 000 — comfortably inside), zero 5xx, slowest request 1 025 ms against
  a 10 000 ms client timeout. Nothing deadlocks.
- **`providers`** (storage pointed at a closed port, mail at a refusing SMTP URL): an avatar
  upload answers its declared `503` in 3 ms (budget < 5 000 ms); `/health` still 200 right after;
  mail retries climbed 0 → 5 with 0 dead; `notes.list` alongside stayed at p95 0.5 ms over
  38 275+ requests (budget 250 ms), zero errors. This is F4.
- **`sigterm`** (20 VUs under load, then `SIGTERM`): 20/20 requests in flight at the signal
  completed (slowest 256 ms); 240/240 requests started before the signal all finished, 0 started
  after; the port refused new connections 33 ms after the signal (well inside `drainMs` 8 000 ms);
  the process exited 0 after 179 ms; zero error lines in the post-signal log. Jobs reclaimed
  in-flight are covered by the jobs worker's own reclaim tests (F5), not re-asserted here.

## Bottlenecks

1. **SQLite's single writer.** `api-core` throughput is flat at ≈ 1 045 it/s (≈ 4 200 req/s) from
   10 to 200 VUs — one connection, one writer, so added VUs only lengthen the queue (p95 climbs
   from ≈ 25 ms to ≈ 90 ms) instead of raising throughput. Postgres scales over the same range,
   503 → 1 728 it/s. **One process per SQLite file in production** follows from this: a dedicated
   jobs worker sharing the api's SQLite file stalls the api during the worker's long writes (the
   same mechanism as the next point), and there is no way to add a second api replica on SQLite
   without the two fighting over the one file. Move to Postgres before scaling beyond one process.
2. **SQLite's cross-process busy wait (F3, documented, not fixed).** A write lock held by *another
   process* on the same SQLite file blocks the api's event loop for up to `busy_timeout` (5 s,
   `SQLITE_BUSY_TIMEOUT_MS`) per attempt — Bun's SQLite busy wait is synchronous, so even `/ready`
   stalls, and neither `READY_TIMEOUT_MS` nor `REQUEST_TIMEOUT_MS` can fire while the loop itself
   is blocked. The database drill measured a 10 001 ms stall across a 10 s outage. Recovery is
   immediate once the lock releases, and the process never crashes — this is a liveness cost, not
   a correctness one, but it means a second process touching the same `.db` file (the dedicated
   worker, a backup/restore CLI run against a live file, an ad hoc `sqlite3` session) can freeze
   the api for seconds at a time. Keep one process per SQLite file; move to Postgres for anything
   that needs two.
3. **RSS per realtime stream is noise, not ≈ 1 MB.** The one real jump (to ≈ 393–479 MB, varying
   run to run) happens once, during provisioning, before streams open; from 100 to 200 streams RSS
   only grew ≈ 13 KB per added stream. 1 000 streams on one process is nowhere near the memory
   concern the original (wrong) reading implied.

## What to tune

- **`JOBS_CONCURRENCY`** (api, worker; default 4, 1–50) — how many jobs one process runs at once.
  Raising it shortens a burst's drain time at the cost of more concurrent database connections and
  mailer/storage calls; `jobs-burst` is the scenario to rerun after changing it.
- **`WEBHOOK_CONCURRENCY`** (api, worker; default 2, 1 to `JOBS_CONCURRENCY`) — how many of those
  slots `webhook.deliver` may hold at once. An endpoint that silently drops packets holds its slot
  for the whole 10 s attempt (plus up to 5 s of DNS), eight times over; the cap keeps the other
  slots for mail and every other job, at the cost of webhook throughput (at most this many
  attempts in flight per process). Raise it with `JOBS_CONCURRENCY` when deliveries back up behind
  healthy endpoints; keep it below `JOBS_CONCURRENCY`, since equal reserves no slot.
- **`REALTIME_MAX_STREAMS`** (api; default 1000) — the process-wide cap on open event streams,
  answering `503` beyond it. `realtime`'s process-cap probe (`LOAD_PROCESS_CAP`) exercises this
  directly on a dedicated stack.
- **Postgres pool size / `max` connections.** The api's main pool is `new SQL(DATABASE_URL)` —
  Bun's own client default, with no dedicated env var in this repo (the realtime broadcaster opens
  two connections of its own outside that pool — see **Realtime** in `CLAUDE.md`). Tune it through
  `DATABASE_URL`'s own connection options if the pool itself becomes the ceiling before the
  database's CPU does; `api-core` on Postgres is the scenario that would show it (p99/max widening
  faster than p50 at the top step is the signal to look for).
- **Replicas behind a load balancer.** Nothing in `api-core`, `jobs-burst` or the database drill is
  specific to one process once the database is Postgres: add api replicas pointed at the same
  `DATABASE_URL`, with `JOBS_WORKER=false` on all but one (or a dedicated `api-worker`, see
  **Jobs** in `CLAUDE.md`) so jobs are not claimed twice. `realtime`'s caps
  (`REALTIME_MAX_STREAMS`, the per-session/per-user limits) are per process, so a load balancer
  spreading streams across replicas raises the effective total, not any one replica's share.
- **`READY_TIMEOUT_MS` / `REQUEST_TIMEOUT_MS`** (api, ai; defaults 2 000 ms / 30 000 ms) — lower
  them to fail faster during an outage, at the cost of a false positive on a database that is only
  briefly slow; the database drill's `DRILL_REQUEST_TIMEOUT_MS` (3 000 ms) is the value this repo's
  own drill runs with.

## What is per-process (not shared across replicas)

- **In-memory rate limiters** (`FailureLimiter` and friends — sign-up, magic-link, password-reset,
  two-factor, impersonation, invitation-create, telemetry/analytics backstops) — each api process
  has its own counters, so a limit meant to be api-wide only holds per replica once there is more
  than one.
- **The `memory` realtime bus on SQLite** — in-process fan-out, correct only because SQLite implies
  one process. The moment there are two api processes, use Postgres and `REALTIME_BUS=postgres`
  (the default once `DATABASE_URL` is Postgres) so every replica's subscribers hear every
  replica's writes.
- **`realtime_streams_open` and the session/user/process stream caps** — counted per process; see
  **Replicas behind a load balancer** above.
- **The jobs worker's claim loop** — safe to run in every process (`FOR UPDATE SKIP LOCKED` on
  Postgres, one writer on SQLite), but `JOBS_CONCURRENCY` and `JOBS_POLL_MS` are each process's own
  knob, not a cluster-wide one.

## How to rerun

```bash
# One scenario, its own SQLite stack, stopped automatically when it finishes:
bun --filter @repo/load api-core
bun --filter @repo/load realtime
bun --filter @repo/load jobs-burst
bun --filter @repo/load drills                 # all four; or: drills database / slow / providers / sigterm

# The same, on Postgres (needs a reachable Postgres 17; LOAD_DATABASE_URL or DATABASE_URL):
LOAD_DB=postgres LOAD_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres \
  bun --filter @repo/load api-core

# The database drill's Postgres variant (starts and docker pause/unpauses its own throwaway
# container — needs Docker):
LOAD_DRILL_POSTGRES=1 bun --filter @repo/load drills database

# The CI smoke (10 VUs, 20 s, p95 < 1000 ms, zero 5xx) against a stack this starts itself:
bun --filter @repo/load smoke
```

Every run's stdout table and its `apps/load/.results/<scenario>-<ISO>.json` are the source of
truth — this guide is a snapshot of one set of runs on one machine on 2026-10-16, not a live
dashboard. Rerun after a change to the request path, the realtime bus, the job queue or the
database layer, and update this file's numbers (and the tables above) rather than estimate.
See `apps/load/README.md` for what each scenario measures and every environment variable.
