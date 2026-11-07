# Performance budgets

Phase 9 D. Before this, nothing in CI stopped a page from growing heavier or slower, or an api
procedure from quietly getting worse: `@next/bundle-analyzer` is manual, field Web Vitals reach
`/admin` only after real users feel them, and Phase 9 C's load smoke failed only on one generic
1000 ms p95 for every procedure. Now four budgets fail the build instead — first-load JS per
route, Lighthouse lab scores, in-browser Web Vitals, and per-procedure api p95 — all read from one
committed file, `perf/budgets.json`, that only changes through a reviewed diff. A heavy import on
a page, a layout shift, or a slow procedure fails its PR with a message naming the route, page or
procedure, its measured value and its budget.

## What each budget checks, and where it runs

| Kind | Checks | Measured by | Runs in |
|---|---|---|---|
| Bundles | First-load JS per route (gzip KB): the chunks a first visit downloads | `scripts/bundle-budget.ts` | `verify` (after the build step, for the apps the PR's plan built) and the `e2e` job (after it builds all eight apps) |
| Lighthouse | Lab performance score, LCP, TBT, CLS — mobile emulation, simulated throttling, median of 3 runs | `apps/e2e/tests/perf-lighthouse.spec.ts` | `e2e` job only (needs the eight apps built and started) |
| Web Vitals | In-browser LCP and CLS — `web-vitals` injected into a real page load, median of 3 loads | `apps/e2e/tests/perf-vitals.spec.ts` | `e2e` job only |
| Api | Per-procedure p95 latency (ms) | `apps/load`'s smoke (`bun --filter @repo/load smoke`) | `e2e` job, right after the Playwright journeys, against the same running api |

The budget file and its shared logic — loading, validating, medians, headroom, the breach
message — live in `perf/budgets.ts`; `perf/budgets.json` is the only thing any of the checkers
reads to decide pass/fail. `scripts/perf-budgets.test.ts` (in `bun test scripts`) keeps the file
itself honest: it parses, every value is a positive number, every bundle route names a real
`page.tsx` of that app, every Lighthouse/Vitals key names a page in `apps/e2e/a11y/routes.ts`'s
manifest, and every api key names one of the load smoke's labels
(`apps/load/src/scenarios/api-core.ts`'s `auth.me` / `notes.list` / `notes.create` /
`workspaces.list`). `scripts/bundle-budget.test.ts` covers the bundle measurer's own logic
(reading a build's manifests, gzip sizing, the check/report format) without needing a real Next
build.

Bundle budgets are deterministic — the same build produces the same gzip sizes on any machine — so
they run in `verify` on whatever the PR's plan already built, catching a regression before the
slower `e2e` job even starts. Lighthouse and Web Vitals only run in `e2e`: they need all eight Next
apps built and started as production servers, same as the rest of the Playwright journeys. The api
budget reuses `apps/load`'s existing smoke, which already runs in `e2e` right after the journeys —
D just gave it a per-procedure threshold instead of one blanket number.

## Reading a failure

**A bundle breach** (`scripts/bundle-budget.ts`, run manually as `bun scripts/bundle-budget.ts
[app…]`) prints one `FAIL` line per route over budget, with the measured size, the budget and the
delta, then the five largest chunks that make up that route's first load:

```
FAIL app /chat first-load JS: 345.2 KB is over the budget 337.5 KB (+7.7)
     largest chunks: static/chunks/app/chat/page-abc123.js 58.3 KB, ...
```

A route with no budget at all fails too, naming itself and the command to add one. Start by
opening the largest chunk named — that is almost always the new or newly-heavier import.

**A Lighthouse or Web Vitals breach** prints every run's value, the median, the budget and the
signed delta (`formatBreach` in `perf/budgets.ts`), e.g.:

```
www:/ lcpMs: median 4800 (runs 4700, 4800, 5300) is over the budget 4180 (+620)
```

For Lighthouse, `score` reads the other way — "is below the budget" — since a higher score is
better; every other metric in both kinds is a ceiling. A metric that never fired at all (Web Vitals
reporting nothing for a page, or a Lighthouse run erroring) fails the test outright rather than
silently reading as zero.

**An api breach** is `apps/load`'s own threshold report: the label, its p95 against the budget,
and the error breakdown if any request failed outright. Zero 5xx is still checked unconditionally,
on every label, budget or not.

In every case the fix is either to make the thing faster/smaller, or — if the regression is
deliberate and accepted — to update the budget (next section). A breach is never fixed by loosening
the budget without someone having looked at *why* it moved.

## Updating budgets on purpose

Budgets only move through `bun run perf:update`, which only writes from measurements already on
disk — never typed in by hand, never guessed:

1. Measure. Either:
   - **Locally**: `bun run perf:measure` runs everything it can — bundle budgets read whatever
     apps are already built under `apps/*/.next`; the Lighthouse/Vitals specs need all eight Next
     apps built (it tells you which are missing and the exact build command); the api smoke always
     runs, since it starts its own throwaway stack. Each step writes its measurement to
     `perf/.results/*.json`, skipping (not failing) a step whose prerequisite build is missing.
   - **From CI**: download the `playwright-report` artifact from a passed `e2e` job run and copy
     its `perf/.results/` into the repo's own `perf/.results/` — the job writes every measurement
     it takes (bundles, Lighthouse, Vitals, api) there and uploads it precisely so this is
     possible without re-running anything locally.
   - Both can be combined: drop a local run's results and a downloaded CI run's results into
     `perf/.results/` together, and `perf:update` merges them, keeping the *worse* value per key —
     this is how the budgets in this repo were originally seeded (see below).
2. `bun run perf:update` reads every file in `perf/.results/`, combines them, adds each kind's
   headroom (see below), lays the result over the current `perf/budgets.json` key by key — a key
   nothing measured keeps its existing budget — validates the result, and prints a before/after
   table of every value that changed before writing the file.
3. Review the printed diff like any other change: does the direction and size of each change make
   sense for what actually changed in the PR? A budget that moved on a route nobody touched is a
   sign the measurement run was noisy or wrong, not a reason to accept it anyway.
4. Commit `perf/budgets.json` (and nothing under `perf/.results/`, which is git-ignored) as part of
   the PR that caused the regression — or on its own, with a commit message explaining why.

`perf:update` never runs in CI; a budget can only ever change through a human-reviewed diff in a
pull request.

## Why lab numbers are noisy, and how medians/headroom handle it

A Lighthouse run or an in-browser Web Vitals measurement varies run to run on the same machine,
same build, same page — GC pauses, CPU scheduling noise, whatever else the OS is doing — enough
that a single run's number is not a reliable signal. Bundle sizes and the api's own latency are
far steadier (the former is deterministic from the build output; the latter still has some
network/scheduling jitter but nowhere near Lighthouse's). D's answer, decided with the owner, is
different treatment for each:

- **Lighthouse and Web Vitals** (the noisy ones): every page is measured **3 times**, and the
  *median* of those 3 runs is what gets judged against the budget — one unlucky run cannot fail a
  PR, and the failure message always shows every run plus the median so a real regression is easy
  to tell apart from one slow run. Headroom on top: lab milliseconds (LCP, TBT) get
  **max(× 1.3, + a fixed floor)** — a bare multiplier is too thin once the seed is a single CI
  run: GitHub's runner fleet mixes CPU generations, Lighthouse's simulated throttling multiplies
  observed main-thread time (so TBT scales directly, and non-linearly, with runner CPU), and a
  Playwright retry lands on the same slow machine. The floor is an absolute ms added over the
  measured value, picked per metric: **Lighthouse LCP +800 ms**, **Lighthouse TBT +200 ms**,
  **Web Vitals LCP +200 ms** (real-browser LCP has no simulated throttling, so it needs a smaller
  floor than Lighthouse's). Score gets **− 10 points, floored at 50**; CLS gets
  **max(× 1.3, + 0.02)** — because CLS can be close to zero, where a pure multiplier leaves almost
  no margin.
- **Bundles**, being deterministic, get tighter headroom: **measured + max(5 %, 5 KB)**, enough to
  absorb a rounding difference between machines without hiding a real regression.
- **Api p95**, measured by a real smoke run rather than a single call, gets **max(× 1.5, + 150 ms),
  rounded up to the nearest 10 ms**. The absolute floor is there because the shared runner varies a
  lot: a slow ubuntu-latest machine once measured `notes.create` at 65 ms against 19 ms on a normal
  one, which a multiplier on a ~20 ms number can't absorb. A real regression (a missing index, an
  N+1) costs hundreds of milliseconds and still fails.

All headroom math lives in `perf/budgets.ts` (`bundleBudget`, `labMsBudget`, `scoreBudget`,
`clsBudget`, `apiBudget`) and is unit-tested directly — the same functions `perf:update` calls, so
"what headroom would this get" is never a guess.

## The numbers today

The committed budgets were seeded from two measurement runs: locally on an Apple M2 Max, and once
in CI on a GitHub `ubuntu-latest` runner (with budgets temporarily generous so the e2e job's perf
specs could run and upload their numbers). `perf:update` merged the two, keeping the worse value
per key, then added the headroom above — so every budget below already reflects whichever
environment is slower for that particular metric, which in practice is the CI runner for
Lighthouse/Vitals/api (a shared, throttled CPU) and is roughly a tie for bundles (gzip size doesn't
depend on the machine).

### Bundles (first-load JS, gzip KB)

Per app, the smallest and largest routed page measured; the budget file has one entry per route
(53 routes across 8 apps):

| App | Smallest route | Local | CI | Budget | Largest route | Local | CI | Budget |
|---|---|---|---|---|---|---|---|---|
| account | `/data-privacy` | 276.4 | 276.6 | 290.5 | `/workspace` | 316.9 | 317.0 | 332.9 |
| app | `/invitations/[token]` | 270.1 | 270.1 | 283.7 | `/chat` | 321.4 | 321.4 | 337.5 |
| auth | `/` | 269.3 | 269.3 | 282.8 | `/admin/analytics` | 466.0 | 466.1 | 489.5 |
| blog | `/` | 257.4 | 257.4 | 270.3 | `/[slug]` | 260.0 | 260.0 | 273.0 |
| docs | `/all` | 321.3 | 321.3 | 337.4 | `/[[...slug]]` | 324.6 | 324.6 | 340.9 |
| help | `/all` | 255.7 | 255.6 | 268.5 | `/` | 324.5 | 324.4 | 340.8 |
| jobs | `/` | 257.4 | 257.4 | 270.3 | `/[slug]/apply` | 286.7 | 286.7 | 301.1 |
| www | `/privacy` | 243.7 | 243.7 | 255.9 | `/` | 246.8 | 246.8 | 259.2 |

`/admin/analytics` on `auth` is the heaviest route in the app by a wide margin (charts); every
other route across every app sits in the 240–335 KB band.

### Lighthouse (median of 3 runs, mobile emulation)

| Page | Metric | Local | CI | Budget |
|---|---|---|---|---|
| `www:/` | score | 93 | 85 | 75 (floor) |
| | LCP ms | 3209 | 2908 | 4180 |
| | TBT ms | 52 | 346 | 550 |
| | CLS | 0.0001 | 0.0001 | 0.021 |
| `auth:/login` | score | 93 | 87 | 77 (floor) |
| | LCP ms | 3159 | 3263 | 4250 |
| | TBT ms | 23 | 266 | 470 |
| | CLS | 0 | 0 | 0.02 |
| `blog:/welcome` | score | 91 | 83 | 73 (floor) |
| | LCP ms | 3521 | 3541 | 4610 |
| | TBT ms | 26 | 326 | 530 |
| | CLS | 0.0001 | 0.0009 | 0.021 |
| `docs:/getting-started` | score | 87 | 90 | 77 (floor) |
| | LCP ms | 4059 | 3143 | 5280 |
| | TBT ms | 16 | 206 | 410 |
| | CLS | 0.0001 | 0.0011 | 0.022 |
| `help:/getting-started/create-an-account` | score | 92 | 89 | 79 (floor) |
| | LCP ms | 3370 | 3354 | 4390 |
| | TBT ms | 20 | 190 | 390 |
| | CLS | 0.0001 | 0.0001 | 0.021 |
| `jobs:/senior-fullstack-engineer` | score | 93 | 94 | 83 (floor) |
| | LCP ms | 3222 | 2763 | 4190 |
| | TBT ms | 16 | 146 | 350 |
| | CLS | 0.0001 | 0.0001 | 0.021 |

The CI runner consistently scores several points lower and shows a far higher TBT than the M2
Max — expected on a shared, throttled runner — which is exactly why the budgets took the worse
(CI) side on every one of these metrics.

### Web Vitals (median of 3 real page loads)

| Page | Local LCP ms | CI LCP ms | Budget LCP ms | Local CLS | CI CLS | Budget CLS |
|---|---|---|---|---|---|---|
| `www:/` | 79 | 213 | 420 | 0.0001 | 0.0001 | 0.021 |
| `auth:/login` | 98 | 239 | 440 | 0 | 0 | 0.02 |
| `blog:/welcome` | 68 | 239 | 440 | 0.0001 | 0.0004 | 0.021 |
| `docs:/getting-started` | 70 | 264 | 470 | 0.0001 | 0.0009 | 0.021 |
| `help:/getting-started/create-an-account` | 65 | 232 | 440 | 0.0001 | 0.0001 | 0.021 |
| `jobs:/senior-fullstack-engineer` | 83 | 196 | 400 | 0.0001 | 0.0001 | 0.021 |
| `app:/notes` (signed in) | 95 | 238 | 440 | 0.0054 | 0.0054 | 0.026 |
| `account:/security` (signed in) | 114 | 309 | 510 | 0 | 0 | 0.02 |

In-browser LCP is far lower than Lighthouse's simulated-throttling LCP on every page (there's no
artificial network/CPU throttle here) — the two budgets measure genuinely different things, which
is why they're separate sections rather than one.

### Api (p95, ms, from the 10-VU smoke)

| Procedure | Local | CI | Budget |
|---|---|---|---|
| `auth.me` | 5 | 16.4 | 170 |
| `notes.create` | 6 | 18.9 | 170 |
| `notes.list` | 5 | 16.6 | 170 |
| `workspaces.list` | 5 | 16.6 | 170 |

All four land on 170 ms: `apiBudget`'s floor (`max(measured × 1.5, measured + 150)`, rounded up to
10 ms) binds well before the multiplier does at these magnitudes — the measured CI p95s (16–19 ms)
+ 150 round up to 170. These are read-and-write procedures against a 10-VU smoke, not the
step-up-to-200-VU capacity numbers in `docs/guides/capacity.md` — different purpose, different
tightness.
