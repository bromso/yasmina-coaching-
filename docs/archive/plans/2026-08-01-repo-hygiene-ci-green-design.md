# Repo hygiene: fix Dependabot, enable CI, remove dead infra

**Date:** 2026-08-01
**Status:** Approved, ready for implementation planning

## Summary

Fix the failing GitHub Actions jobs, enable a CI workflow that runs only checks which actually
pass, and delete the broken and unused deployment layer along with genuinely dead code.

Every problem here has one root cause: this repo was slimmed down from a larger boilerplate — apps
`docs`, `legal`, `web` and package `utils` were removed — and nothing downstream was updated. Config
still points at directories that no longer exist.

## The reported failure

Four Dependabot jobs fail on every run. Their real errors:

| Job | Error |
|---|---|
| `npm_and_yarn in /apps/docs` | `/apps/docs/package.json not found` |
| `npm_and_yarn in /packages/utils` | `/packages/utils/package.json not found` |
| `npm_and_yarn in /apps/web` | `/apps/web/package.json not found` |
| `github_actions in /.` | `/action.yml or /.github/workflows/<anything>.yml not found` |

The first three: `.github/dependabot.yml` declares five per-directory `npm` entries, three of which
point at directories that do not exist.

The fourth is a side effect of how CI was disabled. Every workflow was renamed to `*.yml.disabled`,
so no `.yml` workflow file exists for Dependabot's `github-actions` ecosystem to scan.

These are **not** CI test failures. No CI runs at all — `gh pr checks` reports
"no checks reported" because every workflow is disabled.

## Measured state

Everything below was run, not assumed.

| Command | Result |
|---|---|
| `bun run build` | passes |
| `bun run typecheck` | passes |
| `bun run lint` | **fails** — 70 errors / 415 warnings, pre-existing |
| `bun test` | **0 test files matched** |
| `bun --filter @repo/story test --run` | 305 files: 303 pass, 2 fail. 1240 tests: 1233 pass, 7 fail. 148s |
| `bunx playwright test` | no `playwright.config.*` exists anywhere |
| `helm` / `k3d` / `kubectl` | not installed on this machine |

Vitest reports two distinct things in that run, and conflating them caused an initial misdiagnosis:

- **`Tests 7 failed`** — 5 in `Particles.stories.tsx`, 2 in `CardSwap.stories.tsx`. These are
  `ReferenceError` crashes in two `packages/ui` components. See section 3.
- **`Errors 3 errors`** — unhandled `Could not load /assets/3d/cube.glb … 404` from
  `FluidGlass.stories.tsx` and `ModelViewer.stories.tsx`. No `.glb` files exist in the repo and
  `apps/story/public/` is empty. These do **not** fail any test, and both stories pass.

## Design

### 1. Dependabot

Replace the five per-directory `npm` entries with **one root entry**.

Dependabot's npm ecosystem is workspace-aware, so a root entry covers all six workspaces. This also
matches reality: there is a single `bun.lock` at the repo root, so per-directory entries were never
the right model.

This removes the three "package.json not found" failures and simultaneously fixes the missing
coverage — there are currently no entries for `apps/app`, `apps/www`, `apps/story`,
`packages/tokens` or `packages/typescript-config`.

Keep the `github-actions` entry. It starts working as soon as section 2 lands a real workflow file.

Keep the existing `ignore` rules, which restrict updates to **patch only**.

**Known limitation, documented not worked around.** Dependabot supports Bun (GA February 2025,
implemented inside the `npm_and_yarn` ecosystem) and this repo uses the supported text-format
`bun.lock`. But [dependabot-core#14223](https://github.com/dependabot/dependabot-core/issues/14223)
is open: in workspace monorepos Dependabot may open a PR that updates `package.json` without
updating `bun.lock`. CI's `bun install --frozen-lockfile` would then reject that PR.

We keep `--frozen-lockfile`, because reproducible installs are worth more than frictionless bot PRs.
Patch-only scoping keeps the volume low. The remedy when it happens is to run `bun install` on the
branch and push the refreshed lockfile.

Also relevant: [dependabot-core#13623](https://github.com/dependabot/dependabot-core/issues/13623) —
Dependabot strips the `configVersion` line from Bun lockfiles, which Bun >1.3.2 writes. This repo
pins `bun@1.3.14`. Expect that line to need restoring on bot PRs.

### 2. CI

Enable a single trimmed `ci.yml` with two jobs.

| Job | Steps | Rationale |
|---|---|---|
| `verify` | `bun install --frozen-lockfile` → `bun run typecheck` → `bun run build` | Both verified green |
| `storybook` | `bun install --frozen-lockfile` → playwright install → build `@repo/tokens` → `bun --filter @repo/story test --run` | 1228 real tests, green after section 3 |

**Dropped, with reasons:**

- `lint` — 70 pre-existing errors in vendored `packages/ui` components. Documented as debt in
  `2026-08-01-turborepo-to-bun-workspaces-design.md`. Adding it would make CI red on day one.
- `test` job — `bun test` matches **0 test files**. A job that tests nothing but reports success is
  worse than no job, because it looks like coverage.
- `e2e` job — no `playwright.config.*` exists, so `bunx playwright test` has nothing to run. It was
  masked by `continue-on-error: true`.

`typecheck` is **added** — it was not in the original CI at all, because `turbo check-types`
referenced a script no package defined.

Retain the existing Bun dependency cache steps, but fix their `hashFiles('bun.lockb')` key to
`hashFiles('bun.lock')`. The current key hashes a file that does not exist, so the cache never hits.

The other `*.yml.disabled` workflows stay disabled and are not otherwise modified, except
`deploy-k8s.yml.disabled`, which is deleted with the k8s layer in section 4.

**Four defects only a clean CI runner could expose.** All were found after the workflow was first
enabled, and all passed locally because a dev checkout carries state a fresh runner does not:

1. `chromium-headless-shell` is a Playwright binary separate from `chromium`, and it is the one
   Vitest's browser provider launches. Installing only `chromium` failed with "Executable doesn't
   exist".
2. `bunx playwright install` at the repo root resolved to Playwright **latest** (1.62 → build 1217),
   while `apps/story` pins 1.57 (build 1200). The install now runs with
   `working-directory: apps/story` so the installed and launched builds match.
3. `bun run build` OOM-ed: `@repo/story` bundles 305 stories into a static site, exceeding Node's
   default old-space limit (exit 134). It passed on one run and died on the next, so the default
   ceiling was marginal. Raised via `NODE_OPTIONS=--max-old-space-size=8192`.
4. `@repo/tokens/json` was unresolvable in the `storybook` job. That export maps into
   `packages/tokens/dist/`, generated by the package's build, and the job runs on its own fresh
   checkout that only installs. Vite then re-optimised and reloaded repeatedly, failing 27 tests
   across 19 unrelated story files. Building `@repo/tokens` first fixed 23 of the 27.

`bun-version` is pinned to `1.3.14` rather than `latest`, matching the repo's `packageManager`
field. An unpinned runtime combined with `--frozen-lockfile` would let an unrelated Bun release turn
CI red.

### 3. Storybook green

> **Corrected 2026-08-01 during implementation.** This section originally attributed all 7 failures
> to two stories needing absent `.glb` assets and prescribed tagging them `!test`. That was a
> misreading of Vitest's summary, which reports `Tests 7 failed` and `Errors 3 errors` as separate
> lines. The `.glb` 404s are the 3 unhandled *errors*; `FluidGlass` and `ModelViewer` pass. The 7
> real failures are runtime crashes in two shipped `packages/ui` components.

The 7 failures are two `ReferenceError` crashes that break the components for any consumer, not just
under test:

| Component | Bug |
|---|---|
| `packages/ui/src/components/particles.tsx` | `animate` is declared at line 243 but referenced at line 103 and in a `useEffect` dependency array at line 125. `const` has a temporal dead zone, so this throws `Cannot access 'animate' before initialization`. 5 failing tests. |
| `packages/ui/src/components/CardSwap.tsx` | `front` is destructured at line 124 *inside a callback*, but `refs[front].current` appears in an outer `useEffect` dependency array at line 215, throwing `front is not defined`. 2 failing tests. |

Both are fixed rather than skipped. Skipping would hide live crashes behind a green check.

- `particles.tsx` — move `animate` above the effect that depends on it. **Amended during implementation:** two sibling functions (`initCanvas`, `onMouseMove`) had the identical latent TDZ bug, masked because JS evaluates dependency-array elements left to right and halted at the first throw. All three were moved. A follow-up then memoised the whole helper chain with `useCallback`: once the component actually ran, every mouse move re-ran all three effects and reset the particle field to `alpha: 0`, so particles never became visible while the pointer moved.
- `CardSwap.tsx` — delete the `refs[front].current` entry from the dependency array. `order.current` is a ref and was never reactive.
- **`FloatingLines.tsx`** (found during implementation, not in the original diagnosis) — `containerRef.current!` lied: when the `ResizeObserver` fires after unmount, `current` is null and `.clientWidth` throws. This surfaced as a Vitest *unhandled error*, which exits non-zero even when every test passes. Replaced with a null guard.

### Stories excluded from test runs

Six of 305 stories are tagged `!test`. Both groups are environment limits, not defects — all six still render in the Storybook UI and still generate autodocs, and no binary assets were added.

| Stories | Reason |
|---|---|
| `FluidGlass`, `ModelViewer` | Fetch `/assets/3d/cube.glb`, which does not exist in the repo. Whether the 404 surfaces as an *unhandled error* is a race against test teardown — observed as `Errors` 3, 2, 1 and 0 across runs — so it turned CI red intermittently on a fully passing suite. |
| `GhostCursor`, `FaultyTerminal`, `PixelSnow`, `PrismaticBurst` | Require GPU device access. CI runners have none, so each failed with "Requested device not found" or "Preload assets timed out" after burning ~50s. |

Final green run: **299 passed, 6 skipped (305 files), 1228 tests passing**.

### 4. Delete the dead deployment layer

| Target | Why |
|---|---|
| `k8s/` | Chart directory is `brand-monitor` but `Chart.yaml` names it `kitchensink-react`, and `Makefile` cds to `k8s/charts/kitchensink-react` — a path that does not exist, so every helm target fails immediately. The chart has four subcharts (`app`, `docs`, `www`, `legal`); `docs` and `legal` are for apps that were deleted, and all four `values*.yaml` carry dead docs/legal ingress paths. `helm`, `k3d` and `kubectl` are not installed, so no fix could be verified. |
| `Makefile` | Roughly 90% k8s targets. Its remaining `docker-build` target builds `docker/docs.Dockerfile` and `docker/legal.Dockerfile`, neither of which exists. |
| `.github/workflows/deploy-k8s.yml.disabled` | Entirely k8s; cds into the same nonexistent chart path. |

### 5. Fix what is broken but worth keeping

- **`docker-compose.yml`** — remove the `docs` service. It builds `docker/docs.Dockerfile`, which
  does not exist, so `docker compose up` fails today. Also remove the `backend` network, which no
  service uses.
- **`docker-compose.dev.yml`** — remove the `apps/docs` and `apps/legal` node_modules mounts.
- **`.devcontainer/devcontainer.json:155`** — `postCreateCommand` is currently:

  ```
  cd packages/tokens && bun run build && cd ../../apps/docs && bun run postinstall && cd ../legal && bun run postinstall
  ```

  Both `apps/docs` and `apps/legal` are gone, so `cd` fails and container creation aborts. Neither
  `apps/app` nor `apps/www` defines a `postinstall` script, so there is no equivalent step to carry
  over. It becomes exactly:

  ```
  cd packages/tokens && bun run build
  ```

  `packages/tokens` does define `build` (`node sd.config.js`), so this step is real and worth
  keeping. `postStartCommand` on line 156 is unaffected.

The three Dockerfiles are **not** touched. They were rebuilt and verified in the Turborepo migration.

### 6. Dead code

| Target | Evidence |
|---|---|
| `scripts/generate-pwa-icons.ts` | Referenced by no package.json script, no Makefile target, no other file. |
| `packages/ui/tsconfig.lint.json` | `packages/ui` has `"scripts": {}`; nothing references this config. |
| `.agents/skills/apollo-client` | Zero matching dependencies in any workspace. |
| `.agents/skills/better-auth-best-practices` | Zero matching dependencies. |
| `.agents/skills/graphql-operations` | Zero matching dependencies. |
| `.agents/skills/graphql-schema` | Zero matching dependencies. |
| `.agents/skills/postgres-drizzle` | Zero matching dependencies. |

A grep for `@apollo/client`, `graphql`, `drizzle-orm`, `better-auth` and `@supabase/*` across the
root and every workspace `package.json` returns nothing. `CLAUDE.md` states the repo is
frontend-only with backend, data layer and auth intentionally deferred. These five skills document a
stack that does not exist and would actively mislead an agent.

The remaining six skills (`fixing-motion-performance`, `react-hook-form-zod`, `shadcn`,
`skill-creator`, `vercel-composition-patterns`, `vercel-react-best-practices`) match the real stack
and are kept.

### 7. Follow-on cleanup from the deletions

Deleting `k8s/` and `Makefile` orphans references elsewhere:

- `.vscode/tasks.json` — 11 tasks invoke `make` (`k3d-*`, `k8s-*`, `helm-*`). Remove them. The
  `docker:`, `mono:` and `shadcn:` tasks stay.
- `.vscode/settings.json` — remove the two helm file associations, the two k8s JSON-schema mappings,
  and the `"Makefile": "*.mk"` nesting rule.
- `.editorconfig` — remove the `[Makefile]` and `[k8s/**/*.yaml]` / `[k8s/charts/**/*.tpl]` sections.
- `.claudeignore` — remove the `k8s/` entry, and the `apps/docs/.source/` / `apps/legal/.source/`
  entries.

### 8. Stale references

Update references to workspaces that do not exist:

| File | Detail |
|---|---|
| `LLMS.txt` | Lines 10-11 list `apps/legal:3002` and `apps/docs:3003`; lines 59-60 point at their content dirs |
| `README.md` | Lines 125-126 link to `apps/docs/content/docs/…` |
| `CONTRIBUTING.md` | Line 149 tells contributors to run `bun --filter @repo/docs dev` |
| `CLAUDE.md` | Line 44 reads ``> Future subdomain apps follow the same pattern: `apps/auth` (auth.brand.com), `apps/docs` (docs.brand.com), etc.`` The literal string `apps/docs` must not survive, or verification item 7 fails. Replace the second example, e.g. ``…: `apps/auth` (auth.brand.com), `apps/blog` (blog.brand.com), etc.`` |
| `workspace.code-workspace` | Lines 8-9 add folders `./apps/docs` and `./apps/legal` |
| `.claude/agents/component-architect.md` | Lines 23-24 |
| `.claude/agents/docs-writer.md` | Lines 14-15, 18, 93, 99 — the file is largely about Fumadocs sites that no longer exist |
| `.claude/commands/dev.md` | Lines 10-11 and 25-29 document `legal` and `docs` targets |
| `.github/CODEOWNERS` | Lines 10-11 |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Lines 19-20 offer them as dropdown options |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Lines 19-20 |
| `.github/ISSUE_TEMPLATE/documentation.yml` | Lines 31-32, 45 |

`.claude/agents/docs-writer.md` (100 lines) needs a rewrite rather than line edits: with both
Fumadocs sites gone, most of it describes nothing that exists. Rewrite it so that:

- Its documentation-target table lists only real destinations: `README.md`, `CLAUDE.md`,
  `CONTRIBUTING.md`, `LLMS.txt`, and Storybook stories under `apps/story/stories/`.
- Every command it gives resolves against the current root `package.json` — notably
  `bun --filter @repo/story dev` for Storybook. `bun --filter @repo/docs dev|build` must go.
- No mention of Fumadocs, MDX content directories, or `content/docs/` paths remains.

Keep the file's existing structure and voice; replace its content. If after rewriting there is no
meaningful documentation role left for a dedicated agent, deleting the file is an acceptable
outcome — say so in the implementation report rather than padding it out.

`apps/app/CHANGELOG.md` and `apps/www/CHANGELOG.md` mention the Makefile and k8s. These are
historical release records and are **not** edited.

## Out of scope

- The 70 lint errors and 996 `@repo/story` type errors. Both are documented debt in
  `2026-08-01-turborepo-to-bun-workspaces-design.md` and need their own plan.
- Adding a real unit-test suite, or a Playwright config and e2e tests. Deleting the two no-op CI
  jobs does not commit us to replacing them.
- Re-enabling `auto-merge-dependabot`, `contributors`, `docker-build` or `release` workflows.
- The three Dockerfiles, verified working in the previous migration.
- Renaming the repo's lingering `kitchensink-react` identity (`package.json` `repository.url`,
  changeset config `repo`) — unrelated to these failures.

## Verification

1. `bun run typecheck` and `bun run build` pass.
2. `bun --filter @repo/story test --run` — 299 passed, 6 skipped (305 files), 1228 tests passing,
   exit 0 and **no `Errors` line**. Vitest exits non-zero on unhandled errors even when every test
   passes, so the exit code matters as much as the counts.
3. `docker compose config` parses with no `docs` service.
4. All three images build: `docker build -f docker/{app,www,dev}.Dockerfile .`
5. The devcontainer image builds and its `postCreateCommand` runs without a missing-directory error.
6. `bun run doctor` — the migrated checks pass (`apps/app/.env.local` may fail; it is gitignored and
   machine-local).
7. No reference to `apps/docs`, `apps/legal`, `apps/web`, `packages/utils`, `@repo/docs`,
   `@repo/legal` or `@repo/utils` outside `docs/` and `apps/*/CHANGELOG.md`:

   ```bash
   grep -rn "apps/docs\|apps/legal\|apps/web\|packages/utils\|@repo/docs\|@repo/legal\|@repo/utils" \
     --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock \
     --exclude-dir=docs --exclude=CHANGELOG.md .
   ```

8. `k8s/`, `Makefile`, `.github/workflows/deploy-k8s.yml.disabled`,
   `scripts/generate-pwa-icons.ts`, `packages/ui/tsconfig.lint.json` and the five stale
   `.agents/skills/` directories no longer exist.
9. No orphaned `make` task remains in `.vscode/tasks.json`.
10. After push: the four previously failing Dependabot jobs succeed, and the new `ci.yml` runs and
    goes green on the PR.

Item 10 is the only one that cannot be verified locally — it requires a push to GitHub.
