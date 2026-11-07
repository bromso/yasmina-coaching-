# Storybook Typecheck Gate (Phase 14C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `bun run --filter @repo/story typecheck` exit 0 and gate it in CI, by redirecting stories' vendored imports to generated declarations and fixing the stories' own type errors.

**Architecture:** A generator emits `.d.ts` declarations for every vendored `packages/ui` component (TypeScript emits them even though the sources have type errors) into `apps/story/types/vendored/`, committed; `apps/story/tsconfig.json` `paths` send vendored `@repo/ui/components/...` specifiers there, so `tsc` sees only their public types; `typecheck` first runs the generator in `--check` mode (drift fails with the regenerate command); then the stories' own errors are fixed and `@repo/story` joins the root `typecheck` list.

**Tech Stack:** TypeScript 6 (`tsc` via the root binary, no new dependency), Storybook 10 (`@storybook/react-vite` types), Bun scripts.

**Spec:** `docs/superpowers/specs/2026-10-29-tech-debt-sweep-design.md` (section 14C).

## Global Constraints

- Branch `chore/phase-14c-story-gate` from `main` (14A #129 and 14B #132 merged).
- Baseline on `main` at `32bc3561` (after the Storybook 10 group bump #130): `@repo/story typecheck` = **2615** errors — 1900 in the same 80 vendored `packages/ui` files, **711 in 49 story files** (`stories/animate-ui` 428, top-level `stories/*` 258, `stories/magicui` 14; 671 are TS2322, mostly a story object not supplying args its `Meta` type requires).
- Spike result (2026-10-30): `tsc` with `declaration`, `emitDeclarationOnly`, `noEmitOnError: false`, `skipLibCheck` over the vendored set emitted 363 `.d.ts` files despite 87 source errors, with real prop types (only 9 files mention `any`). TypeScript's `include` does not support character classes, so the PascalCase vendored files must be passed as an explicit list (the same list `packages/ui/tsconfig.typecheck.json`'s `exclude` and `biome.json`'s vendored override hold — read it from `packages/ui/tsconfig.typecheck.json`). Emitted declarations import by package name, `@repo/ui/...` and relative paths (216 relative), so the generator commits the **whole emitted tree** (vendored files plus the first-party files they import relatively), mirroring `packages/ui/src/`, `.d.ts` only (no `.d.ts.map`).
- No new dependency: the generator runs the root `tsc` binary through `Bun.spawn`, never imports `typescript` (CLAUDE.md dependency rule 2). The Storybook build (Vite) is untouched and still bundles the real `.tsx`.
- No change to any `packages/ui` source in this phase. Story fixes keep each story's rendered output and its `play` test unchanged.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; `git commit --only <paths>`; `bunx biome ci .` clean (generated `.d.ts` files: format them with Biome or add `apps/story/types/vendored/**` to `biome.json` `files.includes` exclusions — rule: generated, so excluded, with a comment-free entry next to the other generated paths); run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, Storybook's browser tests or docker; the controller runs the full gate.

## Review Focus

1. A vendored component whose declaration emits `any` props: a story using it is silently unchecked — the generator must print each such file (Task 1).
2. A `paths` entry shadowing a first-party `@repo/ui/components/<kebab>` import, so first-party types stop being checked through stories (Task 1).
3. Drift: a vendored source edited without regenerating must fail `typecheck` with the regenerate command, and a regenerated tree must be byte-identical across runs (stable order, no absolute paths) (Task 1).
4. A story "fix" that changes what renders or what its `play` asserts (adding default `args` that differ from what `render` used, `as any`/`@ts-expect-error` hiding a real mismatch) — casts and `@ts-expect-error` are not allowed (Tasks 2–3).
5. `@repo/story` added to the root `typecheck` gate must not make the CI planner run it for unrelated changes beyond what `workspace:*` closure already implies (Task 3).

---

### Task 1: Generated vendored declarations and the redirect

Files: create `apps/story/scripts/vendored-types.ts`, `apps/story/types/vendored/**` (generated), modify `apps/story/tsconfig.json`, `apps/story/package.json` (`generate:vendored-types`, `typecheck`), `biome.json` (exclusion, if chosen).

- [ ] Generator: writes a temporary tsconfig extending `packages/ui/tsconfig.typecheck.json` with the vendored include set (`src/components/{animate-ui,magicui,charts}/**/*.{ts,tsx}` plus each PascalCase vendored file by name, tests excluded), emits declarations to a temp dir, then copies `.d.ts` files into `apps/story/types/vendored/` mirroring `packages/ui/src/` (deleting files no longer emitted), sorted, with no absolute paths; prints every emitted file containing `any` in an exported signature; `--check` regenerates into a temp dir and diffs, failing with "Vendored declarations are stale — run `bun run --filter @repo/story generate:vendored-types`" and the differing paths.
- [ ] `apps/story/tsconfig.json` `paths`: `@repo/ui/components/animate-ui/*`, `@repo/ui/components/magicui/*`, `@repo/ui/components/charts/*`, `@repo/ui/components/charts` and each PascalCase vendored file → its `types/vendored/components/...` declaration; keep `@/*`. Nothing else under `@repo/ui` is redirected.
- [ ] `apps/story/package.json`: `"generate:vendored-types": "bun scripts/vendored-types.ts"`, `"typecheck": "bun scripts/vendored-types.ts --check && tsc --noEmit"`.
- [ ] Verify: `bun run --filter @repo/story typecheck` now reports errors only under `stories/` and `.storybook/` (record the count); `--check` passes right after generating; editing a vendored file's prop type makes `--check` fail (revert after).
- [ ] Commit `chore(story): typecheck stories against generated vendored declarations`.

### Task 2: Fix the `stories/animate-ui` errors

- [ ] Fix every error under `apps/story/stories/animate-ui/` (≈428 at baseline; recount after Task 1). The common TS2322 shape: `const meta = { component: X, … } satisfies Meta<typeof X>` with stories that use `render` and no `args` — give `meta` the `args` the component requires (the same values the `render` passes, so nothing renders differently) or type those stories as `StoryObj<typeof meta>` built from a `Meta` without `component` args, whichever keeps the file's existing pattern. No `as any`, no `@ts-expect-error`, no change to `play` assertions.
- [ ] `bun run --filter @repo/story typecheck` shows no errors under `stories/animate-ui/`.
- [ ] Commit `fix(story): type-correct the animate-ui stories`.

### Task 3: Fix the remaining story errors; gate it

- [ ] Fix every remaining error (top-level `stories/*`, `stories/magicui`, `stories/bklit`, `stories/email`, `stories/react-bits`, `.storybook/`), same rules as Task 2.
- [ ] `bun run --filter @repo/story typecheck` exits 0.
- [ ] Add `--filter @repo/story` to the root `typecheck` script; run `bun test scripts` (the CI planner reads the gate from that script — fix any planner test expectation it changes, keeping the planner's behaviour of running only affected workspaces).
- [ ] CLAUDE.md Quality gates: replace the "`bun run --filter @repo/story typecheck` remains red at **858 errors** and is not a gate…" paragraph with the new truth (a gate; vendored imports typecheck against generated declarations in `apps/story/types/vendored/`, regenerated with `bun run --filter @repo/story generate:vendored-types`, drift fails `typecheck`; vendored internals remain unchecked, as under `packages/ui`'s gate); add `story` to the typecheck list in the `bun run ci` description.
- [ ] Commit `chore(story): gate the Storybook typecheck`.

### Task 4 (controller): full gate and PR

- [ ] `bun run validate`, `bun --filter @repo/e2e e2e`, `bun scripts/bundle-budget.ts`, `bun run security`, the `--range` secrets scan; CI's storybook job runs the browser tests.
- [ ] PR to `main` per the template, label `enhancement`, project 25 Start date.
