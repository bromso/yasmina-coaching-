# Migrate from Turborepo to Bun workspaces

**Date:** 2026-08-01
**Status:** Approved, ready for implementation planning

## Summary

Remove Turborepo from the monorepo and orchestrate all tasks with `bun run --filter`.

The repo already uses Bun workspaces — root `workspaces: ["apps/*", "packages/*"]`, `bun.lock`,
the `catalog:` protocol, and `workspace:*` dependencies. Turborepo sits on top purely as a task
runner. This migration removes that layer. It is not a workspace restructure, and it does not
change how dependencies are declared, resolved, or versioned.

## Motivation

1. Fewer tools and less config — the toolchain becomes Bun + Biome + Next.
2. Turbo's cache is not earning its keep at three apps and three packages.
3. Independence from Vercel's remote cache service.
4. This is a Bun boilerplate; it should demonstrate Bun's own monorepo story end to end.

## Verified behaviour of `bun run --filter`

All checks run against **Bun 1.3.14** in a scratch workspace before writing this spec.

| Behaviour | Result |
|---|---|
| Does `--filter '*'` match the root package? | **No.** A root `build` script calling `bun run --filter '*' build` does not recurse. |
| Packages lacking the script | Silently skipped. No stub scripts needed for `@repo/ui` or `@repo/typescript-config`. |
| Topological ordering | **Honoured.** A dependency that slept 1s still completed before its dependent started. |
| Exit code on failure | **Propagates.** A task exiting 3 produced an overall exit code of 3. |
| Dependents of a failed task | **Still run.** Bun does not skip them the way Turbo does. See "Accepted regressions". |
| Path filters (`--filter './packages/b'`) | Work as documented. |
| `bun install --filter <pkg>` | Installs only that package's subtree, including transitive workspace deps. Unrelated workspaces get no `node_modules`. |

That last row is what makes the Docker migration viable — it is a working replacement for
`turbo prune`.

## Design

### 1. Root script surface

| Script | Before | After |
|---|---|---|
| `build` | `turbo build` | `bun run --filter '*' build` |
| `build:app` | `turbo build --filter @repo/app` | `bun run --filter @repo/app build` |
| `build:www` | `turbo build --filter @repo/www` | `bun run --filter @repo/www build` |
| `build:docs` | `turbo build --filter @repo/docs` | **deleted** — `@repo/docs` does not exist |
| `build:legal` | `turbo build --filter @repo/legal` | **deleted** — `@repo/legal` does not exist |
| `dev` | `turbo dev` | `bun run --filter '*' dev` |
| `dev:app` | `turbo dev --filter @repo/app` | `bun run --filter @repo/app dev` |
| `dev:www` | `turbo dev --filter @repo/www` | `bun run --filter @repo/www dev` |
| `start` | `turbo start` | `bun run --filter '*' start` |
| `lint` | `turbo lint` | `biome lint .` |
| `typecheck` | `turbo check-types` | `bun run --filter @repo/app --filter @repo/www typecheck` — see "Type debt uncovered" |
| `ci` | `biome ci . && turbo check-types && turbo build` | `biome ci . && bun run typecheck && bun run build` |
| `clean` | `rm -rf .turbo && rm -rf node_modules && rm -rf .next` | see below |

Unchanged: `check`, `check:fix`, `lint:fix`, `format`, `format:fix`, `validate`, `doctor`, `story`,
`changeset*`, `release`, `prepare`, `commit`, `commitlint`. These already invoke Biome or Bun
directly and never touched Turbo.

`bun run --filter '*' dev` starts `@repo/app` (3001), `@repo/www` (3000) and `@repo/story` (6006) —
identical to `turbo dev` today.

The `clean` script drops `.turbo` and, while we are here, becomes correct. Today it deletes only the
*root* `.next`, which does not exist — the real build outputs live under each workspace:

```
rm -rf node_modules apps/*/node_modules packages/*/node_modules \
       apps/*/.next packages/tokens/dist apps/story/storybook-static
```

### 2. Lint, format and typecheck run once at the root

Biome is repo-aware and already excludes `node_modules`, `.next` and `.turbo`. Running it once over
the whole tree is faster than fanning six processes out over overlapping directories, and it removes
the need to add `lint`/`format` scripts to `packages/ui`, `packages/tokens` and
`packages/typescript-config` — none of which have them today.

Typecheck keeps the fan-out, because `tsc` genuinely needs per-project invocation.

`turbo check-types` is **broken today**: no package in the repo defines a `check-types` script
(`@repo/story` defines `typecheck`). The task has been silently doing nothing. Fixing it requires
adding to both apps:

```json
"typecheck": "tsc --noEmit"
```

- `apps/app` — add
- `apps/www` — add
- `apps/story` — already present, no change

### 3. Docker

`turbo prune --docker` has no Bun equivalent, but `bun install --filter` achieves the same goal:
a lean install layer that caches independently of source changes.

`docker/app.Dockerfile` (and `docker/www.Dockerfile`, identically, substituting `@repo/www` and
port 3000):

```dockerfile
FROM oven/bun:1 AS base
WORKDIR /app

FROM base AS installer
# manifests only — this layer stays cached until a package.json or the lockfile changes
COPY package.json bun.lock ./
COPY apps/app/package.json                   ./apps/app/
COPY apps/www/package.json                   ./apps/www/
COPY apps/story/package.json                 ./apps/story/
COPY packages/ui/package.json                ./packages/ui/
COPY packages/tokens/package.json            ./packages/tokens/
COPY packages/typescript-config/package.json ./packages/typescript-config/
RUN bun install --frozen-lockfile --filter '@repo/app'

FROM installer AS builder
COPY . .
RUN bun run --filter '@repo/app' build

FROM oven/bun:1-slim AS runner
# unchanged from current
```

Notes:

- **All seven manifests are copied**, even though only `@repo/app`'s subtree is installed. The root
  `workspaces` globs and `bun.lock` describe the full workspace set, so `--frozen-lockfile` fails if
  manifests are absent. The files are tiny; `--filter` still keeps the *installed* tree lean. This
  mirrors what `turbo prune`'s `out/json/` stage produced.
- **`apt-get install unzip` is removed** from `base`. It existed only so `bun add -g turbo` could
  unpack the Turbo binary.
- The `pruner` stage disappears entirely.

`docker/dev.Dockerfile`: remove `RUN bun add -g turbo@2.5.5`, and remove `turbo.json` from the
`COPY package.json bun.lock turbo.json ./` line.

### 4. Pre-existing Docker breakages, fixed in passing

Both sit in files this migration already edits, and leaving them would mean shipping Dockerfiles
that cannot build.

1. `docker/dev.Dockerfile` copies `apps/docs/package.json` and `apps/legal/package.json`. Neither
   app exists, so `docker build` hard-fails on those lines today. **Delete both lines.**
2. `docker/www.Dockerfile` copies `.next/standalone`, but `apps/www/next.config.ts` never sets
   `output: "standalone"`. **Add `output: "standalone"` to `apps/www/next.config.ts`**, matching
   `apps/app/next.config.mjs:16`.

## Removal sweep

Scope decision: update every file that references **Turborepo**. Unrelated staleness in files that
do not mention Turbo is out of scope.

`turbopack` is **Next.js Turbopack**, not Turborepo. The hits in `apps/app/next.config.mjs:19`,
`apps/www/next.config.ts:11` and `cspell.json:35` must **not** be touched.

### Deleted

| Target | Detail |
|---|---|
| `turbo.json` | Whole file |
| `package.json` | `"turbo": "^2.5.5"` from `devDependencies` |
| `package.json` | `"turborepo"` from `keywords` |
| `packages/ui/package.json` | `"@turbo/gen": "^2.5.5"` — dead; no `turbo/generators` directory exists and nothing references it |
| `packages/ui/tsconfig.lint.json` | `"turbo"` from the `include` array — leftover generators path |
| `.github/CODEOWNERS` | The `/turbo.json` line |

### Rewritten

| File | Change |
|---|---|
| `scripts/doctor.ts` | Two checks break. "Node modules installed" probes `node_modules/turbo/package.json` → repoint to `node_modules/@biomejs/biome/package.json`. "Turbo config" checks `turbo.json` exists → replace with a check that root `package.json` declares `workspaces`. |
| `.github/workflows/ci.yml.disabled` | Remove `TURBO_TOKEN`/`TURBO_TEAM` env block and all four "Cache Turbo" steps |
| `.vscode/tasks.json` | Rename labels `turbo: dev` → `mono: dev`, etc.; update the commands they run |
| `.vscode/keybindings.reference.json` | Update `args` to match the renamed task labels (they must stay in sync or the keybindings break) |
| `.vscode/extensions.json` | Remove `Vercel.turbo-vsc` |
| `.vscode/settings.json` | Remove the `"turbo.json": "jsonc"` file association |
| `.devcontainer/devcontainer.json` | Remove `Vercel.turbo-vsc` and the `"turbo.json": "jsonc"` association |
| `.claude/settings.json` | Remove the `Bash(bun turbo:*)` permission |
| `CLAUDE.md` | Lines 9, 36, 162, 164 — command docs, "Turborepo for build orchestration", `bun turbo check-types`, `rm -rf .turbo` |
| `README.md` | Turborepo badge (line 7) and the Monorepo row of the stack table (line 68) |
| `LLMS.txt` | Lines 3 and 25 — stack line and `bun turbo check-types` |
| `apps/www/src/views/home-view.tsx` | Line 9 — marketing copy naming Turborepo |
| `.claude/commands/dev.md` | Turborepo mention; also references non-existent `legal`/`docs` apps |
| `.claude/commands/build.md` | Turborepo mention |
| `.claude/commands/typecheck.md` | `bun turbo check-types` → `bun run typecheck` |
| `.claude/commands/clean.md` | `.turbo` cache entry |
| `.claude/commands/doctor.md` | `bunx turbo --version` check |
| `.claude/agents/test-debugger.md` | Lines 8, 12, 26, 53, 62, 76 |
| `.claude/agents/feature-builder.md` | Line 63 |
| `.claude/skills/repo-conventions/SKILL.md` | Description line naming "Bun + Turborepo" |
| `.claude/skills/monorepo-deps/SKILL.md` | Lines 8, 15, 60 |

`.claude/skills/*/eval-results.json` files embed copies of skill descriptions. Regenerate or update
them to match their `SKILL.md` so the two do not drift.

### Deliberately left alone

`.gitignore`, `.dockerignore`, `.claudeignore`, `biome.json`, `cspell.json`,
`workspace.code-workspace`, `.editorconfig` — these only *ignore* `.turbo` or `turbo.json`. Harmless
once Turbo is gone, and editing them is churn with no benefit.

`docs/plans/*.md` — historical design records. They describe what was true when written and are not
rewritten.

### Version pin

Root `packageManager` pins `bun@1.3.4`; the verified behaviour above was measured on `1.3.14`. Bump
the pin to `bun@1.3.14` so the topological-ordering guarantee this design depends on is explicit.

## Pre-existing debt uncovered

Consolidating the task runner surfaced two piles of pre-existing debt. Neither is caused by this
migration, and this migration fixes neither.

### Lint: 70 errors, 415 warnings

**Added 2026-08-01, during implementation of Task 2b.**

Moving `lint` from `turbo lint` (per-package) to `biome lint .` (root) widened coverage. The full
figure — measured with `--max-diagnostics=none`, because Biome's default cap of 20 silently
truncates it — is **70 errors and 415 warnings across 818 files**, almost all in the vendored
`packages/ui/src/components/**` components.

Nothing regressed. Before this migration the root `check` script was already `biome check .` and
`ci` was already `biome ci .`, so both already scanned these paths and already failed. The migration
only makes `lint` agree with them.

Two genuine improvements were made and kept: `.agents/**/templates/**` is excluded from Biome
(illustrative skill samples, not source), and dead code was removed from
`scripts/install-registry.mjs`. Forcing lint green would have required ignore-listing the vendored
UI components, which would hide real accessibility and type-safety errors in code that ships — so
it was deliberately not done.

### Types: 996 errors

**Added 2026-08-01, during implementation of Task 1.**

Making `typecheck` actually run revealed **996 pre-existing type errors in `@repo/story`**, which
transitively type-checks `packages/ui`. `turbo check-types` had been hiding them by referencing a
script no package defined. `@repo/app` and `@repo/www` are clean (both verified exit 0).

Rough shape of the debt:

| Count | Kind |
|---|---|
| ~370 | Vendored WebGL/animation components in `packages/ui` — `ImageTrail`, `MetallicPaint`, `MetaBalls`, `Ballpit`, `SplashCursor`, `LiquidEther`, `gravity-stars`, `Cubes`, `Waves`, `GradientBlinds` |
| 115 | `Property 'args' is missing` in Storybook story files |
| 103 | `TS2305 — module has no exported member`; these may be genuinely broken imports in `packages/ui` and deserve their own investigation |
| remainder | `TS18048` / `TS2532` possibly-undefined, `TS2322` assignability |

**Decision:** the root `typecheck` script is scoped to `@repo/app` and `@repo/www`, so `bun run ci`
and `bun run validate` stay green. `@repo/story` keeps its own `typecheck` script, so
`bun run --filter @repo/story typecheck` still runs and still reports the debt.

This migration neither fixes nor suppresses these errors. Paying the debt down — starting with the
103 `TS2305` errors, which are the most likely to be real bugs — is follow-up work needing its own
plan.

## Accepted regressions

1. **No task cache.** `bun run build` rebuilds all three apps every time. Next.js retains its own
   `.next/cache`, so incremental compilation survives; what is lost is skipping a task wholesale.
   Remote caching also goes, which is an intended outcome.
2. **No `--affected`.** No changed-since-git-ref filtering. Use an explicit `--filter @repo/<app>`.
3. **A failing task does not stop its dependents.** Verified: a dependency exiting 3 did not prevent
   its dependent from running. The overall exit code is still correct, so CI remains trustworthy,
   but a failure produces extra downstream noise. Concretely: if `@repo/tokens` fails to build,
   `@repo/story` will still attempt its build and fail on a missing `dist`.
4. **No TUI.** `turbo.json`'s `ui: "tui"` is gone. Output is `pkg:script |`-prefixed and interleaved
   across packages.

Items 1 and 2 are the price of the four motivations. Items 3 and 4 are ergonomic and were not
weighed against alternatives, because no alternative preserves them without keeping Turbo.

## Out of scope

- Restructuring workspaces, or changing `catalog:` / `workspace:*` usage.
- Replacing Biome, Changesets, Husky, commitlint or lint-staged.
- Re-enabling any `.github/workflows/*.disabled` file. The CI workflow is edited to remove Turbo but
  stays disabled.
- The stale `@repo/docs` / `@repo/legal` references in `Makefile`, `k8s/`, and other files that do
  not mention Turbo.
- Building a caching layer to replace Turbo's.

## Verification

After implementation, all of the following must pass:

1. `bun install` — clean, lockfile unchanged apart from the two removed devDependencies.
2. `turbo.json` no longer exists.
3. This grep returns nothing:

   ```bash
   grep -ri "turborepo\|turbo build\|turbo dev\|turbo start\|turbo lint\|turbo check-types\|turbo prune\|@turbo/gen\|bun turbo" \
     --exclude-dir=node_modules --exclude-dir=.git --exclude=bun.lock --exclude-dir=docs .
   ```

   The pattern deliberately omits the bare string `turbo.json`, because `.editorconfig:34` and
   `.claudeignore:50` legitimately keep referencing it and are on the "left alone" list.
4. `bun run typecheck` — actually type-checks `@repo/app` and `@repo/www` and reports real results,
   rather than silently doing nothing as `turbo check-types` did. Both must be clean.
   `bun run --filter @repo/story typecheck` must still be runnable and still report its
   pre-existing errors — the debt is scoped out, not deleted.
5. `bun run lint` and `bun run check` — clean.
6. `bun run build` — all three apps build; `@repo/tokens` builds before `@repo/story`.
7. `bun run dev` — app on 3001, www on 3000, story on 6006, all reachable.
8. `bun run doctor` — passes with the rewritten checks.
9. `docker build -f docker/app.Dockerfile .` and `docker build -f docker/www.Dockerfile .` both
   succeed. The www build is the real test of the `output: "standalone"` fix.
10. `docker build -f docker/dev.Dockerfile .` succeeds — it cannot today.
11. `node_modules/turbo` is absent after a fresh install.
