# Vendored Bug-Class Fixes (Phase 14B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix every bug-class lint finding the vendored override hides and turn those five rules back on for vendored files, so the override exempts only style-class rules.

**Architecture:** Hand-fix 24 findings in 17 vendored `packages/ui` components, each read and reasoned (no unread autofix); remove `useIterableCallbackReturn`, `noAssignInExpressions`, `noUnsafeOptionalChaining`, `noUnusedVariables` and `noImplicitAnyLet` from `biome.json`'s vendored override; update CLAUDE.md's hidden-debt paragraph.

**Tech Stack:** Biome 2.6, React 19, three.js / ogl / gsap vendored effect components.

**Spec:** `docs/superpowers/specs/2026-10-29-tech-debt-sweep-design.md` (section 14B).

## Global Constraints

- Branch `chore/phase-14b-vendored-bugs` from `main` (14A merged as #129). `bunx biome ci .` ends with no errors, warnings or infos.
- Each fix is behaviour-preserving, or a genuine bug fix stated in the commit body and PR (what was wrong, what a user would have seen). Never accept a Biome `--write --unsafe` result unread (Phase 13: an autofix turned a string comparison into `Math.min`, returning `NaN`).
- `useIterableCallbackReturn` has two cases: a `forEach` callback that returns a value (an expression-bodied arrow such as `items.forEach((x) => x.dispose())`) → give it a block body, no behaviour change; a `map`/`filter`/`find`/`some`/`every`/`sort`/`reduce` callback with a path that returns nothing → a real bug: return what the call needs, judged from how the result is used.
- `noAssignInExpressions` → hoist the assignment to its own statement, keeping evaluation order exactly. `noUnsafeOptionalChaining` (`a?.b.c`, or `?.` result used where `undefined` throws) → guard the whole chain so the failure path is the same no-op/fallback the surrounding code already intends. `noUnusedVariables` → remove the binding (keep any side-effecting call). `noImplicitAnyLet` → annotate the `let` with the type its assignments use.
- Never restructure a component; no prop, export or rendering change beyond a stated bug fix.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base origin/main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker; the controller runs the full gate.

## Review Focus

1. A `map`/`filter` "fix" that returns the wrong thing (e.g. returning the element where the caller expects a boolean, or `undefined` kept in a mapped array that is later indexed) — each judged from the result's use (Task 1).
2. A hoisted assignment that changes evaluation order or runs once where it used to run per iteration (`FluidGlass:252`, `FlyingPosters:169`) (Task 1).
3. An optional-chain guard that swallows a case the old code threw on deliberately, or changes the fallback value (`ASCIIText:535`, `LetterGlitch:119`) (Task 1).
4. A removed "unused" binding whose initialiser had a side effect (`PixelTrail:12`, `ScrollStack:110`) (Task 1).
5. CLAUDE.md figures left inconsistent with the override after the five rules come out (Task 1).

---

### Task 1: Fix the 24 findings, rules back on

Findings (path under `packages/ui/src/components/`, as of `main` after #129):
- `useIterableCallbackReturn` (16): `animate-ui/components/community/radial-intro.tsx:97`, `CircularGallery.tsx:613,623`, `Cubes.tsx:125`, `FlyingPosters.tsx:477,505`, `FuzzyText.tsx:131`, `GooeyNav.tsx:108`, `LogoLoop.tsx:73`, `Masonry.tsx:12,13`, `ModelViewer.tsx:463`, `ReflectiveCard.tsx:63`, `Ribbons.tsx:130`, `ScrollReveal.tsx:108`, `TargetCursor.tsx:171`
- `noAssignInExpressions` (3): `FluidGlass.tsx:252` (two), `FlyingPosters.tsx:169`
- `noUnsafeOptionalChaining` (2): `ASCIIText.tsx:535`, `LetterGlitch.tsx:119`
- `noUnusedVariables` (2): `PixelTrail.tsx:12`, `ScrollStack.tsx:110`
- `noImplicitAnyLet` (1): `Orb.tsx:306`

- [ ] Remove the five rules from the vendored override in `biome.json` (`suspicious.useIterableCallbackReturn`, `suspicious.noAssignInExpressions`, `suspicious.noImplicitAnyLet`, `correctness.noUnsafeOptionalChaining`, `correctness.noUnusedVariables`); `bunx biome lint packages/ui/src/components --max-diagnostics=none` lists exactly the 24 above.
- [ ] Fix each site per the Global Constraints, recording per site in the report: which case it was, the change, and whether it was a real bug (with the user-visible effect).
- [ ] `bunx biome ci .` clean; `bun test` in `packages/ui`; `bun run --filter @repo/ui typecheck`.
- [ ] CLAUDE.md Quality gates: the override now disables 9 rules (count the per-group split from `biome.json`), the "That debt is mostly bug-class" paragraph becomes "the bug-class part is fixed and its rules are on for vendored files too"; the remaining exemptions (`noExplicitAny`, `noNonNullAssertion`, `noArrayIndexKey`, `useExhaustiveDependencies`, `useTemplate`, plus the four a11y rules) each get a one-line reason; re-measure the hidden total with the override's rules emptied and state it.
- [ ] Commit `fix(ui): fix the vendored bug-class lint findings and turn their rules on` (body lists every real bug fixed).

### Task 2 (controller): full gate and PR

- [ ] `bun run validate`, `bun --filter @repo/e2e e2e`, `bun --filter @repo/story test` is covered by CI's storybook job (the touched components are effect demos with stories), `bun scripts/bundle-budget.ts`, `bun run security`, the `--range` secrets scan.
- [ ] PR to `main` per the template, labels `bug` (if a real bug was fixed) or `enhancement`, project 25 Start date.
