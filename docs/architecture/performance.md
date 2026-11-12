# Performance

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Performance.** Phase 9 D: four committed budgets fail the build instead of waiting for a
dashboard to notice — first-load JS per route, Lighthouse lab scores, in-browser Web Vitals, and
the per-procedure api p95 budget **Load** above reads. All four live in one file,
`perf/budgets.json` (`{ bundles, lighthouse, vitals, api }`), with its loading, validation and
headroom maths in `perf/budgets.ts`; it changes only through a reviewed diff — nothing in CI
writes it. `scripts/bundle-budget.ts` reads a Next build's own manifests (no browser, no Next
runtime) to compute each route's first-load JS in gzip KB and checks it against `bundles`,
run in `verify` on whatever the plan built and again in the `e2e` job on all nine apps; a route
over budget, or with none, fails naming the measured size, the budget and the largest chunks.
`apps/e2e/tests/perf-lighthouse.spec.ts` and `perf-vitals.spec.ts` (`e2e` job only, six and eight
pages respectively — the Lighthouse set plus `app:/notes` and `account:/security` signed in) each
run 3 times per page and judge the *median* against `lighthouse` / `vitals`, since lab numbers are
noisy; `bun run perf:measure` runs every kind locally (skipping a step whose build is missing) and
`bun run perf:update` folds `perf/.results/*.json` (a local run, or a downloaded `e2e` job
artifact's `perf/.results`) into the committed file with each kind's headroom — bundles
measured + max(5 %, 5 KB), lab milliseconds × 1.3, score − 10 floored at 50, CLS
max(× 1.3, + 0.02), api max(× 1.5, + 150 ms) — printing the before/after diff to review before
committing. `scripts/perf-budgets.test.ts` and `scripts/bundle-budget.test.ts` (`bun test scripts`)
keep the file and the measurer honest. See `docs/guides/performance.md`.
