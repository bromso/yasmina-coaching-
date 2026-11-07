# Quality gates for first-party code

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning

## Summary

This repo has no working quality gate for the code it owns. `bun run lint` is red with 65 errors and
`bun run --filter @repo/story typecheck` is red with 877 — so neither can sit in CI, and nothing
stops new first-party code from regressing.

Almost all of that redness is in vendored components no application imports. Drawing that boundary
explicitly leaves a residual of **33 type errors and 15 lint errors** — small enough to fix.
Fix them, and the repo gains two green checks covering code you wrote, wired into CI.

The deliverable is a gate that can be green, not a smaller error count.

## The finding: `packages/ui` is two things under one name

The applications import exactly **13 paths** from `@repo/ui`:

```
@repo/ui/blocks/hero
@repo/ui/components/{alert-dialog, button, calendar, dropdown-menu, form,
                     label, popover, select, sonner, switch, tooltip}
@repo/ui/lib/utils
```

Eleven components, one block, one utility. There are **206 top-level components**, so 195 are
gallery — vendored via `shadcn add` from three registries configured in
`packages/ui/components.json`: `@react-bits`, `@animate-ui`, `@magicui`.

Every measurement below splits along that line.

| | Type errors | Lint **errors** |
|---|---|---|
| Vendored (~137 files) | 834 (95%) | 50 (77%) |
| Everything else | 43 (5%) | 15 (23%) |

Lint totals are 65 errors, 412 warnings, 46 infos. Only the 65 errors gate anything, so they are what
this design counts. All measurements must be taken with the **locked** Biome version (2.3.8) — an
investigation run with 2.5.6 reported 90 errors including 34 in SVG files that 2.3.8 does not flag.

## Two registries are broken

Checked directly, across multiple component-name forms:

| Registry | Result |
|---|---|
| `@react-bits` — `reactbits.dev/r/{name}.json` | `200 text/html` for every name tried. SPA fallback; no JSON registry at that path. |
| `@animate-ui` — `animate-ui.com/r/{name}.json` | `404` for all five names tried. |
| `@magicui` — `magicui.design/r/{name}.json` | `200 application/json`. Works. |

`bunx shadcn@latest view @react-bits/ImageTrail` fails with
`Unexpected token '<', "<!doctype "... is not valid JSON`.

This matters for two reasons.

First, it kills the idea of repairing these components by **re-fetching** an improved upstream
version. Not possible for the two registries carrying most of the errors.

Second, it inverts an argument made earlier in favour of excluding rather than fixing — that a
registry re-fetch would overwrite any hand-edits. There will be no re-fetch. These 195 components
are permanently owned code. That makes fixing them defensible in principle; it is still rejected
here on cost (877 errors across 154 files that no application imports), not on futility.

Fixing or removing the broken registries is **out of scope** and recorded as a separate finding.

## The shadcn MCP is configured but blind

`.mcp.json` registers a `shadcn` MCP server, and its tools load. But it resolves `components.json`
from the **repository root**, where none exists — the registries live in `packages/ui/components.json`,
and neither `apps/app/components.json` nor `apps/www/components.json` declares any. So
`get_project_registries` returns nothing and the MCP cannot see this repo's registries at all.

Also out of scope, also recorded — it is a small fix that would pay off whenever the registry
question is picked up.

## Design

### 1. The boundary is an explicit list, because globs cannot express it

TypeScript's `include`/`exclude` support `*`, `?` and `**/` — **not** character classes. This was
measured rather than assumed:

| Exclude pattern | Result |
|---|---|
| `src/components/[A-Z]*.tsx` | **571 errors** — silently matched nothing; vendored files still checked |
| Two explicit paths (`ImageTrail.tsx`, `MetallicPaint.tsx`) | **460 errors** — exactly the 71 + 40 those files carried |

So the exclusion is:

- `src/components/animate-ui/**` and `src/components/magicui/**` as globs
- **104 explicit PascalCase file paths** under `src/components/`

The list is generated once, reviewed, and committed. It is then left to go stale **deliberately**: a
newly added vendored component fails the gate until someone adds it to the list, forcing a conscious
decision. A regenerating script was considered and rejected — it would make the boundary implicit
again, silently absolving anything PascalCase, which is the property this design is trying to avoid.

### 2. The exclusion lives in a separate tsconfig

Create `packages/ui/tsconfig.typecheck.json`. Do **not** put the exclusions in
`packages/ui/tsconfig.json`.

Editors read the main config. Excluding vendored files there would stop the editor reporting errors
when someone opens `ImageTrail.tsx` to work on it. A separate config keeps editor feedback intact
while the gate ignores those paths.

Add a `typecheck` script to `packages/ui/package.json` running against it. The package currently has
`"scripts": {}` and is never typechecked at all.

### 3. Fix the residual, do not exclude it

With the boundary applied, `packages/ui` reports **33 errors**:

| File | Errors |
|---|---|
| `cool-mode.tsx` | 11 |
| `gradient-blur.tsx` | 6 |
| `dot-grid.tsx` | 6 |
| `kanban.tsx`, `hyper-text.tsx`, `file-tree.tsx` | 2 each |
| `spinner.tsx`, `scroll-based-velocity.tsx`, `icon.tsx`, `customized/progress/progress-08.tsx` | 1 each |

Most are magicui components that happen to use kebab-case, so the PascalCase heuristic misses them.
They are **fixed rather than added to the exclusion list**: 33 errors is cheaper than adjudicating
provenance file by file, and it keeps the exclusion list to a single, explicable rule.

The residual lint errors are fixed the same way. There are **15 across 11 files**, and 13 of them are
accessibility rules:

| Rule | Count |
|---|---|
| `lint/a11y/noSvgWithoutTitle` | 6 |
| `lint/a11y/useAnchorContent` | 4 |
| `lint/a11y/useButtonType` | 3 |
| `lint/suspicious/useIterableCallbackReturn` | 2 |

That makes the lint half of this work substantially an accessibility fix — real improvements to
markup that ships, not stylistic noise. They sit in story files, two magicui components with
kebab-case names, and one HTML file under `.agents/skills/`.

### 4. Lint scoping needs the same explicit list

Biome rejects character classes too, with an explicit error:

```
× Character class `[]` are not supported. Use `\[` and `\]` to escape the characters.
```

So `biome.json` needs an `overrides[]` entry carrying the **same ~106 paths** — the 104 PascalCase
files plus the two subdirectory globs — with the vendored-heavy rules disabled for them. Verified in
place: with that override applied, the only remaining errors are the 15 residual ones.

**This means the boundary is written twice**, once in `packages/ui/tsconfig.typecheck.json` and once
in `biome.json`. That duplication was weighed against physically relocating the vendored components
into a `vendor/` directory, which would reduce each config to a single glob. Relocation was rejected
on cost: ~195 file moves plus the `exports` map and every story import.

The duplication is tolerable because its failure mode is benign and asymmetric. Both lists are
generated once from the same rule (`^[A-Z].*\.tsx$` under `src/components/`, plus the two vendored
subdirectories). If they drift, a vendored file gets *checked* — noisy, but safe. Drift can never
cause a first-party file to escape a gate, which is the only direction that would matter.

Generate both from the same command so the initial state cannot disagree, and record that rule in
`CLAUDE.md` next to the gate description.

### 5. Wire both into CI

Add to the `verify` job in `.github/workflows/ci.yml`:

- `bun run --filter @repo/ui typecheck`
- `bun run lint`

Without this the work is cosmetic — the checks would be green but nothing would stop the next commit
breaking them. This is the step that converts the work into a gate.

## What stays red, and why that is correct

`bun run --filter @repo/story typecheck` **remains red at 877 errors** and stays out of CI.

That check follows imports from every story, so it necessarily reaches every vendored component. It
cannot be scoped the way `packages/ui` can, and it should not be: it is the honest full-picture view.
The new gate is a *different, narrower check* — not the old one made green.

Anyone reading "lint and typecheck pass" must be able to find, in one place, the statement that 877
type errors and 50 lint errors exist in vendored code and are deliberately unscoped. That
belongs in `CLAUDE.md` alongside the gate description.

## Verification

1. `bun run --filter @repo/ui typecheck` — exit 0.
2. `bun run lint` — exit 0.
3. `bunx biome lint . --max-diagnostics=none` — `Found 0 errors.` Warnings may remain; the error
   count is the gate. Always pass `--max-diagnostics=none`; Biome's default cap of 20 silently
   truncates.
4. `bun run typecheck` (root: `@repo/app`, `@repo/www`) — exit 0, unchanged.
5. `bun --filter @repo/story test --run` — exit 0, `299 passed | 6 skipped (305)`,
   `1228 passed (1228)`, no `Errors` line.
6. `bun run build` — exit 0.
7. `packages/ui/tsconfig.json` is unmodified — editors still see vendored files.
8. `bun run --filter @repo/story typecheck` reports **859**, down from 877.

   *(Corrected during implementation — this originally asserted the count must stay at 877.)* That
   was wrong: the check is unscoped, so it reaches the same first-party files this work fixes, and
   repairing them necessarily lowers its count. The drop of 18 is exactly the errors in the six
   fixed files that stories reach.

   The boundary invariant is instead that **no vendored file is modified**:
   `git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"`
   returns nothing.
9. CI on the PR: `verify` and `storybook` both green, with `verify` now running the two new checks.

## Out of scope

- **The 834 vendored type errors and 50 vendored lint errors** (plus ~400 vendored warnings).
  Explicitly scoped, documented, not fixed.
- **Fixing or removing the two broken registries** (`@react-bits`, `@animate-ui`). Its own project.
- **Fixing the shadcn MCP's blind spot** (no root `components.json`). Its own project.
- **Physically relocating vendored components** into a `vendor/` directory. Considered; it would
  reduce the exclusion list to one glob but touches 195 files, the `exports` map, and every story
  import.
- **Enabling a11y enforcement in Storybook.** `parameters.a11y.test` is unset so checks run in
  warning mode, and `tags: ["a11y-test"]` is dead config from Storybook 8.5. Note that 13 of the 15
  residual lint errors *are* accessibility rules and do get fixed here — that is Biome's static
  a11y linting, which is a different mechanism from the Storybook a11y runner and does not
  substitute for it.
- **Adding unit tests.** `bun test` still matches zero files repo-wide.
- **Deleting unused components.** The gallery is intentional.
