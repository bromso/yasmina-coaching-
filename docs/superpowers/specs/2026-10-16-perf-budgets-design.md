# Performance budgets (Phase 9 D) — design

Phase 9 is production hardening: A accessibility (#88) → B operations (#89, #90) → C load and
resilience (#91) → **D performance budgets** (this spec) (→ E security scanning, optional). Approved
in chat on 2026-10-16. One PR.

## Intent

Nothing in CI stops a page from growing heavier or slower, or an api procedure from slowing down:
`@next/bundle-analyzer` is manual, field Web Vitals reach `/admin` only after users feel them, and
C's load smoke fails only on one generic 1 s p95. D adds four budgets that fail the build — first-load
JS per route, Lighthouse lab scores, in-browser Web Vitals, and per-procedure api p95 — all from one
committed budget file that only changes through a reviewed diff. Success: a heavy import on a page,
a layout shift, or a slow procedure fails its PR with a message naming the route/page/procedure, its
measured value and its budget; the suite stays green on main today.

Decided with the owner: **all four budgets**; the noisy ones (Lighthouse, in-browser vitals)
**fail on medians of 3 runs with ~30 % headroom over today's measured values**; bundle and api
budgets stay tight.

## 1. The budget file and its tooling

- `perf/budgets.json` (committed): `{ bundles: { <app>: { <route>: kbGzip } }, lighthouse: { <app>:<path>: { score, lcpMs, tbtMs, cls } }, vitals: { <app>:<path>: { lcpMs, cls } }, api: { <procedure>: p95Ms } }`.
- `perf/.results/` (git-ignored): each measurement's JSON.
- `bun run perf:measure` runs every measurement locally (bundles from existing builds; Lighthouse +
  vitals through the e2e config against running production servers; api via `apps/load`'s smoke) and
  writes `perf/.results/`.
- `bun run perf:update` rewrites `budgets.json` from the latest results: noisy budgets = measured ×
  1.3 (score: measured − 10 points, floor 50; CLS: max(measured × 1.3, measured + 0.02)), bundles =
  measured + max(5 %, 5 KB), api = measured × 1.5 rounded up to 10 ms (floor 50 ms). Rounded to keep
  diffs readable.
- `scripts/perf-budgets.test.ts` (in `bun test scripts`): the file parses, every value is a positive
  number, every bundle route names an existing `page.tsx` route of that app (reuse
  `apps/e2e/a11y/routes.ts`'s `routeOf`), every lighthouse/vitals key names a page in the e2e a11y
  manifest, every api key names a contract procedure path.

## 2. Bundle budgets (deterministic)

`scripts/bundle-budget.ts <app…>`: for each built app, read `.next/` build output (the app-build /
build manifests and `.next/static/chunks`), compute each route's first-load JS (the chunks the route
loads on first visit, shared + route-specific), gzip-size each (Bun's gzip, level 9), compare to the
route's budget; exit 1 listing each breach with measured/budget/delta and the largest chunks. A route
with no budget fails ("add it with perf:update"). Runs in `verify` after the build step for the apps
CI built (from the plan's build list) and in the e2e job after its build (all eight apps).

## 3. Lighthouse budgets (e2e job, medians)

`apps/e2e/tests/perf-lighthouse.spec.ts` (Playwright, serial): Chromium launched with a remote
debugging port (Playwright's own browser — no new download); for each page: 3 Lighthouse runs via its
Node API (`lighthouse` npm, mobile emulation, default simulated throttling, categories:
performance), median of score / LCP / TBT / CLS judged against the budget; one test per page, the
failure message lists all three runs. Pages: www `/`, docs `/getting-started`, blog `/welcome`, help
`/getting-started/create-an-account`, jobs `/senior-fullstack-engineer`, auth `/login`. ~3 min.

## 4. In-browser Web Vitals (e2e job)

`apps/e2e/tests/perf-vitals.spec.ts`: inject `web-vitals` (the IIFE build from node_modules, the
version the apps use) with `addInitScript`; load the page 3 times in fresh contexts (signed-in pages
reuse `storageStateFor` from `fixtures/a11y-session.ts`); after load, trigger visibility change to
flush LCP/CLS; judge medians. Pages: the six Lighthouse pages plus app `/notes` and account
`/security` (signed in). INP is out (needs real interaction).

## 5. API latency budgets

`apps/load`'s smoke reads `perf/budgets.json`'s `api` section and uses a per-label `p95Ms` threshold
for each measured procedure (falling back to the old 1 000 ms ceiling only for a label with no
budget — which the scripts test forbids, so it is a guard, not a path). Seeded from a 10-VU smoke run
(and capacity.md), with the `perf:update` headroom.

## 6. Seeding, docs

- First budgets come from measurement: the controller runs `perf:measure` locally and gets one CI run
  of the e2e job's perf specs (with budgets temporarily generous and results uploaded) to see the
  runner's numbers, then sets budgets from the slower of the two plus headroom.
- `docs/guides/performance.md` (what each budget checks, reading a failure, updating budgets on
  purpose, why lab numbers are noisy and how the medians/headroom handle it); CLAUDE.md (a
  **Performance** paragraph, gates, the e2e counts); `apps/e2e/README.md`; ROADMAP ticks C "(merged as
  #91)"; D unticked.

## Out of scope

A RUM dashboard (field vitals already reach `/admin`), Lighthouse on signed-in pages, INP, budgets for
Storybook, image weight budgets, CDN/caching.
