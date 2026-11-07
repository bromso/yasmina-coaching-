# Tech-debt sweep — design (Phase 14)

Approved in chat on 2026-10-29. Four PRs, merged in order: **14A** a11y rules on → **14B** vendored
bug-class fixes → **14C** Storybook typecheck gate → **14D** docs drift guard.

## Intent

Make the quality gates mean what they say. A rule that is off is either turned back on, or off for
a narrow, documented reason with nothing real hidden behind it; the figures CLAUDE.md quotes stay
true because a test recomputes them. No product behaviour changes — every fix keeps what a user
sees and can do, or improves its accessibility.

Decided with the owner:
- All four parts are in scope.
- Vendored components may keep exemptions for style-class rules, never for bug-class ones.
- Storybook's typecheck becomes a gate through **generated declarations** for the vendored
  components stories import (option 3 of three offered), not by fixing vendored internals and not
  by filtering `tsc` output.

## Baseline (measured 2026-10-29 on `main` at `84d889b0`)

| Area | Today |
|---|---|
| The four repo-wide a11y rules (`useSemanticElements`, `useAriaPropsSupportedByRole`, `useKeyWithClickEvents`, `noStaticElementInteractions`) at `error` | 67 errors: **0 in `apps/*`**, 11 first-party in `packages/ui` (`input-group` 3, `carousel` 2, `mdx/schema-table`, `lens`, `kanban`, `item`, `field`, `button-group` 1 each — 9 `useSemanticElements`, 1 `useKeyWithClickEvents`, 1 `useAriaPropsSupportedByRole`), 56 vendored (36 `noStaticElementInteractions`, 12 `useKeyWithClickEvents`, 5 `useAriaPropsSupportedByRole`, 3 `useSemanticElements`) |
| `useValidAnchor` (at `warn`) | 0 findings |
| The vendored override's 11 rules removed | 36 errors + 392 warnings — bug-class: `useIterableCallbackReturn` 16, `noAssignInExpressions` 3, `noUnsafeOptionalChaining` 2, `noUnusedVariables` 2, `noImplicitAnyLet` 1; style/noise: `noExplicitAny` 189, `noNonNullAssertion` 77, `noArrayIndexKey` 67, `useExhaustiveDependencies` 57, `useTemplate`, `noSvgWithoutTitle` |
| `bun run --filter @repo/story typecheck` | **1975** errors: 509 in `apps/story` itself, 1464 in 80 vendored `packages/ui` files reached through story imports (mostly TS18048/TS2532 "possibly undefined", TS2322) |
| CLAUDE.md | quotes "48 errors" (override debt) and "858 errors" (Storybook) — both stale |

Every story imports components through `@repo/ui/components/...` (none by relative path), so a
`paths` redirect covers all of them.

## 14A — a11y rules on

- Fix the 11 first-party violations in `packages/ui` with semantic elements or the correct role
  and keyboard handling, keeping each component's rendered behaviour and existing tests; a change
  to a component's DOM (`<div role="group">` → `<fieldset>`, say) is checked against its stories
  and the e2e a11y sweep.
- `biome.json`: the four rules go from `off` to the default (`error`), `useValidAnchor` from
  `warn` to the default — the top-level `linter.rules.a11y` block is removed.
- Vendored files: where a fix is cheap and keeps behaviour (a `role`, a `<button type="button">`,
  `onKeyDown` alongside `onClick`), fix it; what remains is listed per rule in the vendored
  override (only the rules a vendored file still breaks after the cheap fixes — expected
  `noStaticElementInteractions` and `useKeyWithClickEvents` — `off` there, with a comment that
  they are decorative pointer effects) — never a repo-wide exemption again.
- Gate: `bunx biome ci .` clean with zero warnings; e2e (a11y sweep, keyboard journeys) green.

## 14B — vendored bug-class fixes

- Fix all 24 bug-class findings: a `.map`/`.filter`/comparator that forgets to return, an
  assignment inside an expression, `a?.b.c` that still throws, an unused variable, an implicit-any
  `let`. Each fix is read by hand (Phase 13's sweep showed Biome's unsafe autofix can change
  meaning — a string `Math.min` returning `NaN`); behaviour-preserving, or a genuine bug fix noted
  in the PR.
- Those five rules come back on for vendored files (removed from the override); the override keeps
  only `noExplicitAny`, `noNonNullAssertion`, `noArrayIndexKey`, `useExhaustiveDependencies`,
  `useTemplate` and `noSvgWithoutTitle`, each with a one-line reason in CLAUDE.md.

## 14C — Storybook typecheck gate (generated vendored declarations)

- `apps/story/scripts/vendored-types.ts` (`bun run --filter @repo/story generate:vendored-types`):
  finds every vendored module a story imports (`@repo/ui/components/{animate-ui,magicui,charts}/…`
  and the PascalCase top-level files the override lists), runs TypeScript's declaration emit on
  them (`emitDeclarationOnly`, which still emits when the implementation has type errors) and
  writes `apps/story/types/vendored/<same path>.d.ts`, committed.
- `apps/story/tsconfig.json` gains one wildcard `paths` entry per vendored directory
  (`@repo/ui/components/animate-ui/*`, `magicui/*`, `charts/*`) plus one entry per PascalCase
  top-level vendored file, written by the same generator, pointing at the `.d.ts`, ahead of `@repo/ui`'s own mapping;
  the Storybook build (Vite) is untouched and still bundles the real `.tsx`.
- A drift test regenerates the declarations in memory and fails when a committed file differs,
  naming the command — like `apps/docs`'s API-reference test.
- Fix the stories' own errors (509 today) so `@repo/story typecheck` exits 0, then add it to the
  root `typecheck` list (so CI's `verify` and `bun run ci` / `validate` run it).
- Boundary, documented: vendored internals stay type-unchecked, exactly as under `packages/ui`'s
  gate today; the story gate checks how stories use those components. A declaration that emits as
  `any` (unannotated vendored props) is reported by the generator, so a story using it is not
  silently unchecked.

## 14D — docs drift guard

- `scripts/quality-figures.test.ts` (in `bun test scripts`) recomputes the figures CLAUDE.md's
  Quality gates section quotes — vendored file counts by pattern and directory, the override's
  rule list, the imported `@repo/ui` specifier and block counts — and fails naming the stale line.
  Figures that need Biome or `tsc` to compute (hidden lint debt) are written by a
  `bun run quality:figures` script into a committed JSON the test reads, regenerated like the
  bundle budgets.
- CLAUDE.md's Quality gates section rewritten to the post-14A–C state: what is gated, what each
  remaining exemption is and why, no stale counts.

## Testing, rules

Each PR runs the full gate (validate, e2e, bundle budgets, security, the `--range` secrets scan);
Biome warnings stay at zero; commit trailer and Conventional Commits as usual; no budget loosened.

## Out of scope

Rewriting or replacing vendored components; `noExplicitAny`/`noNonNullAssertion` clean-up in
vendored code; new lint rules beyond those already configured.
