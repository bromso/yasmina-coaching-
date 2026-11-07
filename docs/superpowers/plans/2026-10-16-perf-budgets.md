# Performance budgets (Phase 9 D) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Four budgets that fail CI — first-load JS per route, Lighthouse lab scores, in-browser Web Vitals, per-procedure api p95 — from one committed `perf/budgets.json` that changes only through a reviewed diff.

**Architecture:** A pure budget library (`perf/budgets.ts`: schema, load, headroom math for `perf:update`) tested from `bun test scripts`; a bundle checker reading Next's build output; two Playwright specs in `apps/e2e` (Lighthouse via its Node API on Playwright's Chromium; `web-vitals` injected); the load smoke reading the api section. The controller seeds the budgets from a local and a CI measurement.

**Tech Stack:** Bun 1.4, Next 16 (webpack builds), Playwright (catalog), `lighthouse` (npm, apps/e2e devDependency), `web-vitals` (already a dependency via the apps/ui).

**Spec:** `docs/superpowers/specs/2026-10-16-perf-budgets-design.md`

## Global Constraints

- `perf/budgets.json` shape: `{ "bundles": { "<app>": { "<route>": <kbGzip> } }, "lighthouse": { "<app>:<path>": { "score": <0-100>, "lcpMs": n, "tbtMs": n, "cls": n } }, "vitals": { "<app>:<path>": { "lcpMs": n, "cls": n } }, "api": { "<procedure label as the load smoke names it>": <p95Ms> } }`. Keys sorted, numbers rounded (KB to 0.1, ms to 10, score integer, CLS to 0.001).
- Headroom (`perf:update`): bundles measured + max(5 %, 5 KB); lighthouse/vitals ms × 1.3, score − 10 (floor 50), CLS max(× 1.3, + 0.02); api × 1.5 rounded up to 10 ms, floor 50.
- `perf/budgets.ts` and its test import nothing outside the repo (`bun test scripts` runs before `bun install`).
- Medians of 3 runs for Lighthouse and vitals; a failure message names the key, all three runs, the median and the budget.
- Implementers never run Playwright, `bun run ci`, or full builds of all eight apps (watchdog); the controller does. They may build one app once (`bun --filter @repo/www build`) to have real `.next` output for the bundle checker, and run one Lighthouse page against `next start` of that app once to prove the integration.
- Biome clean, zero warnings; commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars.

## Review Focus

1. A route added later passing silently because it has no budget → the bundle checker fails a route with no budget; the scripts test fails a budget key naming no route (Task 1, 2).
2. Shared chunks counted wrong (double-counted or omitted), making every route's number meaningless → the checker's per-route set is the union of the route's chunks and the shared/framework chunks, each counted once, tested on a fixture manifest (Task 2).
3. One slow Lighthouse run failing CI → medians of 3; a test of the median helper with an outlier (Task 3).
4. A vitals measurement that never fires (LCP not reported before navigation ends) passing as 0 → a missing metric fails the page, it isn't treated as 0 (Task 4).
5. Budgets drifting without review → only `perf:update` writes the file, and it prints the diff; CI never writes it (Task 1, docs).

---

### Task 1: The budget file and its library

**Files:** Create `perf/budgets.ts` (types, `loadBudgets(path?)`, `validateBudgets(b, { routes, pages, procedures })` → problems[], `applyHeadroom(results)` → budgets, `median(xs)`, `formatBreach(...)`), `perf/budgets.json` (seed with generous placeholders: every bundle route 1000 KB, lighthouse score 1/lcp 60000/tbt 60000/cls 1, vitals lcp 60000/cls 1, api 1000 — replaced in Task 7), `perf/update.ts` (`bun run perf:update`: reads `perf/.results/*.json`, writes budgets via `applyHeadroom`, prints a before/after table), `perf/.gitignore` (`.results/`), `scripts/perf-budgets.test.ts`; root package.json scripts `perf:update`, `perf:measure` (Task 6 fills it).
- Routes for validation: reuse `routeOf` from `apps/e2e/a11y/routes.ts` over `apps/*/src/app/**/page.tsx` (plain-data import, fine before `bun install`); pages: `A11Y_PAGES`' `app:path`; procedures: the load smoke's labels — import the list from `apps/load/src/scenarios/api-core.ts` only if that module imports nothing outside the repo at top level, else hard-code the four labels (`auth.me`, `notes.list`, `notes.create`, `workspaces.list`) in budgets.ts with a comment pointing at api-core.ts.
- [ ] Tests: headroom math for each kind incl. floors and rounding; `median` (odd, even, one value); validation catches an unknown route, an unknown page, an unknown procedure, a non-positive or missing value; the committed file validates.
- [ ] FAIL → implement → PASS (`bun test scripts`) → commit `feat(perf): a budget file with validation and deliberate updates`.

### Task 2: Bundle budgets

**Files:** Create `scripts/bundle-budget.ts` (CLI: `bun scripts/bundle-budget.ts [app…]`, default all apps whose `.next` exists; `--write-results` writes `perf/.results/bundles.json`), `scripts/bundle-budget.test.ts` with a small fixture `.next` tree under `scripts/fixtures/next-build/`; modify `.github/workflows/ci.yml` (verify: after Build, `bun scripts/bundle-budget.ts <the built apps>` — derive the app list from the plan's build filter; e2e job: after building the eight apps).
- Read Next 16's webpack build output (verify against a real `bun --filter @repo/www build`): the app-router manifest mapping each route to its client chunks plus the root main/framework/polyfill chunks; first-load JS per route = union, each file gzipped once (Bun.gzipSync level 9), summed, KB. Route keys use the same patterns as `routeOf` (`/`, `/[slug]`, groups dropped).
- [ ] Tests on the fixture: shared chunks counted once per route, a missing budget fails, over-budget lists the largest chunks, under-budget passes, a route only in budgets (not built) is ignored here (the scripts test covers existence). Then run it once on a real www build → commit `feat(perf): first-load JS budgets per route`.

### Task 3: Lighthouse budgets

**Files:** Create `apps/e2e/tests/perf-lighthouse.spec.ts`, `apps/e2e/fixtures/lighthouse.ts`; modify `apps/e2e/package.json` (devDependency `lighthouse`, literal range — workspace-specific).
- Launch Chromium via Playwright's `chromium.launch({ args: ["--remote-debugging-port=<free port>"] })`, run `lighthouse(url, { port, output: "json", onlyCategories: ["performance"], formFactor: "mobile", screenEmulation: mobile, throttlingMethod: "simulate" })` 3× per page, median score/LCP/TBT/CLS, compare to `budgets.lighthouse["<app>:<path>"]`; append results to `perf/.results/lighthouse.json` when `PERF_WRITE_RESULTS=1`. One test per page (serial), timeout generous (3 min/page).
- [ ] Unit-test the pure parts (median/compare/format) inside the fixture module's test or reuse `perf/budgets.ts`; run ONE page once against `next start` of www (≤ 2 min) → commit `test(e2e): Lighthouse budgets on six public pages`.

### Task 4: In-browser Web Vitals

**Files:** Create `apps/e2e/tests/perf-vitals.spec.ts`, `apps/e2e/fixtures/vitals.ts`.
- `addInitScript` with the `web-vitals` IIFE (`web-vitals/dist/web-vitals.iife.js` — check the installed version's path) registering `onLCP`/`onCLS` with `reportAllChanges: true` into `window.__vitals`; load the page in a fresh context, wait for `networkidle`, then `page.evaluate` to dispatch `visibilitychange` (hidden) so LCP/CLS finalise; read; 3 loads; medians; a missing metric fails. Signed-in pages via `storageStateFor`. Results to `perf/.results/vitals.json` when `PERF_WRITE_RESULTS=1`.
- [ ] Unit-test the pure parts; typecheck → commit `test(e2e): Web Vitals budgets in the browser`.

### Task 5: API latency budgets

**Files:** Modify `apps/load/src/scenarios/api-core.ts` (smoke thresholds: per-label `p95Ms` from `perf/budgets.json`'s `api`, plus `max5xx: 0`), its unit tests; `--write-results` (or `PERF_WRITE_RESULTS=1`) writes `perf/.results/api.json` with each label's p95.
- [ ] Tests → commit `feat(load): per-procedure p95 budgets in the smoke`.

### Task 6: `perf:measure`

**Files:** Create `perf/measure.ts`: builds nothing itself; runs `scripts/bundle-budget.ts --write-results` over existing builds, the two perf specs via `bunx playwright test tests/perf-*.spec.ts` in apps/e2e with `PERF_WRITE_RESULTS=1` (servers via the e2e config), and the load smoke with `PERF_WRITE_RESULTS=1`; prints where results went and reminds to run `perf:update`. Root script `perf:measure`.
- [ ] Commit `feat(perf): measure every budget in one command`.

### Task 7 (controller): seed the budgets

- [ ] Build the eight apps, run `bun run perf:measure` locally; push the branch with the generous placeholder budgets and `PERF_WRITE_RESULTS=1` in the e2e job (temporarily) so CI uploads its results; download them; run `perf:update` on the slower of each pair (merge the two result sets taking the max per key); commit the budgets; remove the temporary env; confirm CI green.

### Task 8: Docs

**Files:** Create `docs/guides/performance.md`; modify CLAUDE.md (a **Performance** paragraph; gates; e2e counts), `apps/e2e/README.md`, `apps/load/README.md` (api budgets), `docs/ROADMAP.md` (tick C "(merged as #91)"; D unticked).
- [ ] From the code and Task 7's numbers; `bun test scripts`, `bunx biome ci .` → commit `docs: performance budgets`.
