# Quality Gates for First-Party Code Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the repo two green quality gates — a `packages/ui` typecheck and `bun run lint` — covering first-party code, and wire them into CI.

**Architecture:** Draw an explicit boundary around vendored components, fix the small residual behind it, then gate. The boundary is an explicit ~106-path list because neither TypeScript nor Biome supports character-class globs — both were measured, not assumed.

**Tech Stack:** TypeScript 5.9, Biome 2.3.8, Bun workspaces, GitHub Actions.

**Spec:** `docs/plans/2026-08-02-quality-gates-design.md`

## Global Constraints

- **Branch:** `chore/quality-gates`, already created from `main` and carrying the design doc. Do not create another branch.
- **Measure with the locked tool versions.** Biome must be **2.3.8** (`bunx biome --version`). An investigation run on 2.5.6 reported 90 errors including 34 in SVG files that 2.3.8 does not flag. If the version differs, run `bun install --frozen-lockfile` before measuring anything.
- Always pass `--max-diagnostics=none` to Biome. Its default cap of 20 silently truncates counts.
- **Baselines to reproduce:** `bunx biome lint . --max-diagnostics=none` → `Found 65 errors.` / `Found 412 warnings.` `bun run --filter @repo/story typecheck` → **877** errors.
- **`bun run --filter @repo/story typecheck` will DECREASE from 877, and that is correct.** *(Corrected during execution — the original constraint wrongly demanded it stay at 877.)* That check is unscoped, so it reaches the same first-party files this work fixes; repairing them necessarily lowers its count. Measured: it went 877 → 859, exactly the 18 errors that live in the six fixed files stories can reach (`cool-mode` 11, `file-tree` 2, `hyper-text` 2, `icon` 1, `scroll-based-velocity` 1, `spinner` 1).
- **The real boundary invariant is that no vendored file is modified.** Check it directly: `git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"` must return nothing. That is the signal a fix did not cross the boundary — the story count is not.
- **Never use `any`, `@ts-ignore`, `@ts-expect-error`, or `biome-ignore` to make an error go away.** Every residual error gets a real fix. If one genuinely cannot be fixed without them, stop and report rather than suppressing.
- Do **not** add vendored files to the exclusion list to avoid fixing them. The list is exactly: files matching `^[A-Z].*\.tsx$` directly under `packages/ui/src/components/`, plus the `animate-ui/**` and `magicui/**` subdirectories. Nothing else.
- Do **not** modify `packages/ui/tsconfig.json`. Editors read it; excluding vendored files there would blind the editor. The exclusions go in a separate config.
- Do **not** physically move any component. Relocation into a `vendor/` directory was considered and rejected.
- Do **not** fix the broken registries or the shadcn MCP blind spot. Both are recorded as separate findings.
- The Storybook suite takes ~150 seconds. Allow a 15-minute timeout and never kill a run early.
- Commits run commitlint (Conventional Commits) and lint-staged via husky.

## Testing note for this plan

The gates are the tests. Each task ends with a measured number: 33 → 0 type errors, 65 → 0 lint errors, and no vendored file modified at any point.

---

### Task 1: Draw the boundary and expose the residual

**Files:**
- Create: `packages/ui/tsconfig.typecheck.json`
- Modify: `packages/ui/package.json` (scripts)

**Interfaces:**
- Consumes: nothing.
- Produces: `bun run --filter @repo/ui typecheck`, reporting exactly 33 errors. Task 2 drives that to 0.

- [ ] **Step 1: Confirm the tool versions and baselines**

```bash
bunx biome --version
bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"
bun run --filter @repo/story typecheck 2>&1 | grep -cE "error TS"
```

Expected: `Version: 2.3.8`, `Found 65 errors.` / `Found 412 warnings.`, and `877`.

If Biome is not 2.3.8, run `bun install --frozen-lockfile` and re-check. If any baseline differs, **stop and report** — every later number in this plan is relative to these.

- [ ] **Step 2: Generate the exclusion list**

Run this to produce the config, which writes the 104 PascalCase paths plus the two subdirectory globs:

```bash
cd packages/ui && python3 - <<'PY'
import os, json, re
comp = 'src/components'
vendored = [f'{comp}/{f}' for f in sorted(os.listdir(comp)) if re.match(r'^[A-Z].*\.tsx$', f)]
cfg = {
  "extends": "@repo/typescript-config/react-library.json",
  "compilerOptions": {"baseUrl": ".", "noEmit": True, "paths": {"@repo/ui/*": ["./src/*"]}},
  "include": ["src"],
  "exclude": ["node_modules", "dist", f"{comp}/animate-ui/**", f"{comp}/magicui/**"] + vendored,
}
json.dump(cfg, open('tsconfig.typecheck.json', 'w'), indent=2)
open('tsconfig.typecheck.json', 'a').write('\n')
print("PascalCase entries:", len(vendored))
PY
cd - > /dev/null
```

Expected: `PascalCase entries: 104`.

The list is committed as generated and then left to go stale **deliberately**. A newly added vendored component will fail the gate until someone adds it, forcing a conscious decision. Do not add a script that regenerates it — that would make the boundary implicit again.

- [ ] **Step 3: Sanity-check the generated config**

```bash
python3 -c "
import json; d=json.load(open('packages/ui/tsconfig.typecheck.json'))
e=d['exclude']
print('total exclude entries:', len(e))
print('has animate-ui glob:', any('animate-ui' in x for x in e))
print('has magicui glob:', any('magicui' in x for x in e))
print('first 3 pascal:', [x for x in e if '/components/' in x and '**' not in x][:3])
"
```

Expected: `total exclude entries: 108` (2 base + 2 globs + 104 files), both globs present, and the first PascalCase entries look like `src/components/ASCIIText.tsx`.

- [ ] **Step 4: Add the typecheck script**

`packages/ui/package.json` currently has `"scripts": {}`. Change it to:

```json
  "scripts": {
    "typecheck": "tsc -p tsconfig.typecheck.json --noEmit"
  },
```

- [ ] **Step 5: Measure the residual**

```bash
bun run --filter @repo/ui typecheck 2>&1 | grep -cE "error TS"
```

Expected: **33**.

If the number differs, **stop and report** with the per-file breakdown. A higher count means the exclusion list is incomplete; a lower one means it excluded something first-party.

- [ ] **Step 6: Confirm the unscoped view is untouched**

```bash
bun run --filter @repo/story typecheck 2>&1 | grep -cE "error TS"
```

Expected: still **877**. This check is deliberately unscoped and must not move.

- [ ] **Step 7: Commit**

```bash
git add packages/ui/tsconfig.typecheck.json packages/ui/package.json
git commit -m "build: add a scoped typecheck for packages/ui

packages/ui was never typechecked -- it had no scripts at all. This adds
a typecheck that excludes vendored components, which no application
imports, leaving 33 errors in first-party code.

The exclusion is an explicit list because neither TypeScript nor Biome
supports character-class globs: src/components/[A-Z]*.tsx silently
matches nothing. It is left to go stale on purpose, so a new vendored
component fails the gate until someone acknowledges it.

Exclusions live in a separate config so editors, which read
tsconfig.json, still report errors in vendored files."
```

---

### Task 2: Fix the 33 type errors

**Files:** all under `packages/ui/src/components/`:
- `cool-mode.tsx` (11), `dot-grid.tsx` (6), `gradient-blur.tsx` (6), `file-tree.tsx` (2), `hyper-text.tsx` (2), `kanban.tsx` (2), `icon.tsx` (1), `spinner.tsx` (1), `scroll-based-velocity.tsx` (1), `customized/progress/progress-08.tsx` (1)

**Interfaces:**
- Consumes: Task 1's `bun run --filter @repo/ui typecheck`.
- Produces: that command exiting 0. Task 4 gates CI on it.

- [ ] **Step 1: See the errors**

```bash
bun run --filter @repo/ui typecheck 2>&1 | grep -E "error TS" | sed 's|^@repo/ui typecheck: ||' | sort
```

Expected: 33 lines. They fall into three groups:

**Group A — `noUncheckedIndexedAccess` (29 errors).** `packages/typescript-config/base.json` sets
`noUncheckedIndexedAccess: true`, so indexing an array or record yields `T | undefined`. Affects
`cool-mode.tsx`, `dot-grid.tsx`, `gradient-blur.tsx`, `hyper-text.tsx`, `file-tree.tsx`,
`scroll-based-velocity.tsx`, `progress-08.tsx`.

**Group B — Iconify props (2 errors).** `icon.tsx:10` and `spinner.tsx:7`: a spread of intrinsic SVG
props is not assignable to `IconifyIconProps`.

**Group C — ref types (2 errors).** `kanban.tsx:737` and `:795`: `HTMLTextAreaElement | null` and
`HTMLDivElement | null` assigned where the non-null type is required.

- [ ] **Step 2: Fix Group A with real narrowing**

For each error, narrow the value rather than asserting it away. The shape that applies most often —
a value read by index then used:

```tsx
// before: `size` is `number | undefined` because it came from an indexed read
const size = sizes[i]
ctx.arc(x, y, size / 2, 0, Math.PI * 2)   // TS18048

// after: guard and skip, or supply an explicit default
const size = sizes[i]
if (size === undefined) continue
ctx.arc(x, y, size / 2, 0, Math.PI * 2)
```

Where a default is genuinely correct, prefer it to a guard:

```tsx
const color = palette[index] ?? palette[0] ?? "#000000"
```

For the `SetStateAction` cases in `file-tree.tsx:143,221` and `hyper-text.tsx:103`, the callback
produces `(string | undefined)[]` where `string[]` is required. Filter rather than cast:

```tsx
// before
setOpen((prev) => prev.map((id) => lookup[id]))
// after
setOpen((prev) => (prev ?? []).map((id) => lookup[id]).filter((v): v is string => v !== undefined))
```

**Do not** reach for `!`, `as`, `any`, or disabling `noUncheckedIndexedAccess`. That setting is
repo-wide and catching real gaps is its purpose.

- [ ] **Step 3: Fix Group B**

`icon.tsx:10` and `spinner.tsx:7` spread SVG intrinsic props into an Iconify component whose
`IconifyIconProps` accepts a narrower set. Type the component's own props to what it actually
forwards, rather than widening to `any`. Read both files first — they are short — and pick the
prop type that matches what each genuinely passes through.

If the mismatch turns out to be a genuine incompatibility in `@iconify/react`'s own types rather
than a misuse, **stop and report** instead of casting around it.

- [ ] **Step 4: Fix Group C**

`kanban.tsx:737,795` assign a possibly-null DOM ref where a non-null element is required. Guard at
the assignment or widen the receiving type to include `null`, whichever matches how the ref is used
a few lines later. Read the surrounding code before choosing.

- [ ] **Step 5: Verify the gate is green**

```bash
bun run --filter @repo/ui typecheck; echo "EXIT=$?"
```

Expected: `EXIT=0`, no error output.

- [ ] **Step 6: Verify the boundary held**

```bash
bun run typecheck && echo "ROOT OK"
git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)" || echo "NO VENDORED FILES TOUCHED"
bun run --filter @repo/story typecheck 2>&1 | grep -cE "error TS"
```

Expected: `ROOT OK`, `NO VENDORED FILES TOUCHED`, and a story count **below 877** — measured at
**859**.

The vendored-file check is the boundary invariant. The story count is *expected* to drop: that check
is unscoped, so it sees the same first-party files being fixed here. 877 − 859 = 18, exactly the
errors in the six fixed files that stories reach.

- [ ] **Step 7: Verify the components still work**

```bash
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `Test Files 299 passed | 6 skipped (305)`, `Tests 1228 passed (1228)`, no `Errors` line.
These are real behaviour changes to shipped components, so the suite is the check that the
narrowing did not alter runtime behaviour.

- [ ] **Step 8: Commit**

```bash
git add packages/ui/src/components
git commit -m "fix(ui): resolve type errors in first-party components

29 of the 33 come from noUncheckedIndexedAccess: indexed reads yield
T | undefined and were used unguarded. Fixed by narrowing or supplying
explicit defaults, not by assertions -- the setting exists to catch
exactly these gaps.

The rest are an Iconify prop mismatch in icon.tsx and spinner.tsx, and
two possibly-null DOM refs in kanban.tsx.

Storybook suite unchanged at 1228 passing."
```

---

### Task 3: Scope lint and fix its residual

**Files:**
- Modify: `biome.json` (add an `overrides` entry)
- Modify: `packages/ui/src/components/{animated-beam,animated-circular-progress-bar,pointer,smooth-cursor,sparkles-text}.tsx`
- Modify: `apps/story/stories/SmoothCursor.stories.tsx`
- Modify: `apps/story/stories/animate-ui/{BasePreviewCard,BasePreviewLinkCard,Magnetic}.stories.tsx`
- Modify: `apps/story/stories/magicui/WarpBackground.stories.tsx`
- Modify: `.agents/skills/skill-creator/eval-viewer/viewer.html`

**Interfaces:**
- Consumes: nothing from Tasks 1-2.
- Produces: `bun run lint` exiting 0. Task 4 gates CI on it.

- [ ] **Step 1: Confirm Biome rejects the glob, so the list is necessary**

This was measured; reproduce it so the reason for a 106-entry list is on record. Temporarily add to
`biome.json`:

```json
{ "includes": ["**/packages/ui/src/components/[A-Z]*.tsx"], "linter": { "rules": { "suspicious": { "noExplicitAny": "off" } } } }
```

Run `bunx biome lint . --max-diagnostics=none 2>&1 | head -5`.

Expected: `× Character class `[]` are not supported. Use `\[` and `\]` to escape the characters.`

**Revert that edit before continuing** (`git checkout biome.json`).

- [ ] **Step 2: Add the real override**

Append an entry to `biome.json`'s `overrides` array carrying the same boundary as Task 1 — the 104
PascalCase paths plus the two subdirectory globs, each prefixed `**/`:

```bash
python3 - <<'PY'
import json, os, re
comp = 'packages/ui/src/components'
vendored = [f'**/{comp}/{f}' for f in sorted(os.listdir(comp)) if re.match(r'^[A-Z].*\.tsx$', f)]
vendored += [f'**/{comp}/animate-ui/**', f'**/{comp}/magicui/**']
c = json.load(open('biome.json'))
c.setdefault('overrides', []).append({
  "includes": vendored,
  "linter": {"rules": {
    "a11y": {"noSvgWithoutTitle": "off"},
    "correctness": {"noUnusedVariables": "off", "useExhaustiveDependencies": "off"},
    "style": {"noNonNullAssertion": "off", "useTemplate": "off"},
    "suspicious": {"noArrayIndexKey": "off", "noAssignInExpressions": "off",
                   "noExplicitAny": "off", "useIterableCallbackReturn": "off"}
  }}
})
json.dump(c, open('biome.json', 'w'), indent=2)
open('biome.json', 'a').write('\n')
print("override entries:", len(vendored))
PY
```

Expected: `override entries: 106`.

- [ ] **Step 3: Confirm the config is valid and see the residual**

```bash
bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found|Character class"
```

Expected: `Found 15 errors.` and no configuration error. Warnings will still be present; only the
error count gates.

If a configuration error appears, **stop and report** — do not start deleting rules to make it pass.

- [ ] **Step 4: Fix the 6 `noSvgWithoutTitle` errors**

Each inline `<svg>` needs an accessible name. For decorative SVGs, mark them hidden; for meaningful
ones, add a `<title>`.

| File | Line context |
|---|---|
| `packages/ui/src/components/animated-beam.tsx` | beam path |
| `packages/ui/src/components/animated-circular-progress-bar.tsx` | progress ring |
| `packages/ui/src/components/pointer.tsx` | cursor glyph |
| `packages/ui/src/components/smooth-cursor.tsx` | cursor glyph |
| `packages/ui/src/components/sparkles-text.tsx` | sparkle glyph |
| `apps/story/stories/SmoothCursor.stories.tsx` | cursor glyph |

All six are decorative — they convey no information a screen reader user needs — so the correct fix
is:

```tsx
<svg aria-hidden="true" focusable="false" …>
```

Read each one to confirm it is genuinely decorative before applying that. If any conveys real
meaning, give it a `<title>` instead.

- [ ] **Step 5: Fix the 4 `useAnchorContent` errors**

`apps/story/stories/animate-ui/BasePreviewCard.stories.tsx` and `BasePreviewLinkCard.stories.tsx`
each have two `<a>` elements with no screen-reader-accessible content — typically an anchor wrapping
only an icon or an empty element. Give each either visible text or an `aria-label` describing the
destination.

- [ ] **Step 6: Fix the 3 `useButtonType` errors**

`apps/story/stories/animate-ui/Magnetic.stories.tsx` (2) and
`apps/story/stories/magicui/WarpBackground.stories.tsx` (1) have `<button>` elements without an
explicit `type`. Inside a form, an untyped button defaults to `submit`. Add `type="button"` to each.

- [ ] **Step 7: Fix the 2 `useIterableCallbackReturn` errors**

`.agents/skills/skill-creator/eval-viewer/viewer.html` has two `forEach` callbacks returning a
value. Either use the returned values — switching to `map`/`filter` — or make the callback body a
statement block so it returns nothing:

```js
items.forEach((item) => { doSomething(item) })
```

- [ ] **Step 8: Verify lint is green**

```bash
bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"
bun run lint; echo "EXIT=$?"
```

Expected: **no `Found N errors.` line at all** — Biome omits the category entirely at zero, so do not grep for the literal `Found 0 errors.`. Warnings and infos still print. `EXIT=0` is the gate.

- [ ] **Step 9: Verify the a11y fixes did not break rendering**

```bash
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no `Errors` line.

- [ ] **Step 10: Commit**

```bash
git add biome.json packages/ui/src/components apps/story/stories .agents
git commit -m "fix: scope lint to first-party code and fix its residual

Adds a Biome override covering the same vendored boundary as the
typecheck -- an explicit list, because Biome rejects character classes
in globs with 'Character class [] are not supported'.

That leaves 15 real errors, 13 of them accessibility: decorative SVGs
without an accessible name, anchors with no screen-reader content, and
buttons without an explicit type. Fixed rather than suppressed."
```

---

### Task 4: Wire the gates into CI and document them

**Files:**
- Modify: `.github/workflows/ci.yml` (the `verify` job)
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: Tasks 1-3's green checks.
- Produces: CI that fails if either regresses.

- [ ] **Step 1: Add both checks to the verify job**

In `.github/workflows/ci.yml`, the `verify` job currently runs Typecheck then Build. Add lint and the
`packages/ui` typecheck so the step sequence becomes:

```yaml
      - name: Typecheck
        run: bun run typecheck

      - name: Typecheck UI package
        run: bun run --filter @repo/ui typecheck

      - name: Lint
        run: bun run lint

      - name: Build
        # @repo/story bundles 305 stories into a static Storybook site, which
        # exceeds Node's default ~4GB old-space limit on a runner and dies with
        # exit 134. Observed passing on one run and OOM-ing on the next, so the
        # default ceiling is marginal rather than merely tight.
        env:
          NODE_OPTIONS: --max-old-space-size=8192
        run: bun run build
```

Keep the existing `NODE_OPTIONS` comment and env on Build exactly as they are.

- [ ] **Step 2: Validate the workflow**

```bash
bunx js-yaml .github/workflows/ci.yml > /dev/null && echo "YAML VALID"
```

Expected: `YAML VALID`.

- [ ] **Step 3: Document the boundary in CLAUDE.md**

Add a `### Quality gates` subsection at the end of the `## Troubleshooting` section — after
`### Stacked pull requests` and before `## Slash Commands`:

```markdown
### Quality gates

`bun run lint` and `bun run --filter @repo/ui typecheck` both pass and gate CI. They cover
first-party code only.

`packages/ui` holds ~195 components vendored from third-party registries via `shadcn add`, which no
application imports — the apps use 11 components, one block and `lib/utils`. Those vendored files
carry roughly 877 type errors and 50 lint errors, and are deliberately excluded from both gates.

The boundary is files matching `^[A-Z].*\.tsx$` directly under `packages/ui/src/components/`, plus
the `animate-ui/` and `magicui/` subdirectories. It is written as an explicit list in two places —
`packages/ui/tsconfig.typecheck.json` and the `overrides` block in `biome.json` — because neither
TypeScript nor Biome supports character-class globs.

The list is intentionally not auto-generated. A newly added vendored component will fail the gates
until someone adds it, which forces a conscious decision.

`bun run --filter @repo/story typecheck` remains red at 877 errors and is not a gate. It follows
imports from every story, so it necessarily reaches every vendored component. It is the honest
full-picture view, not a check to be made green.
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/ci.yml CLAUDE.md
git commit -m "ci: gate on lint and the packages/ui typecheck

Without this the work is cosmetic -- both checks are green but nothing
stops the next commit breaking them.

CLAUDE.md records the vendored boundary, why it is an explicit list in
two files, and that the story typecheck stays red at 877 on purpose so
nobody mistakes a green gate for a clean tree."
```

---

### Task 5: Final verification and pull request

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: every prior task.
- Produces: a pull request with green CI.

- [ ] **Step 1: Run every gate**

```bash
bun run --filter @repo/ui typecheck && echo "UI TYPECHECK OK"
bun run typecheck && echo "ROOT TYPECHECK OK"
bun run lint && echo "LINT OK"
bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"
```

Expected: all three OK lines. Biome prints **no** `Found N errors.` line at zero — absence of that line is the pass condition, not a `Found 0 errors.` string. Warnings and infos still print.

- [ ] **Step 2: Confirm the unscoped view is unchanged**

```bash
git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)" || echo "NO VENDORED FILES TOUCHED"
bun run --filter @repo/story typecheck 2>&1 | grep -cE "error TS"
```

Expected: `NO VENDORED FILES TOUCHED`, and **859** (down from 877 before this branch).

The vendored-file check is the boundary assertion. The story count drops because that check is
unscoped and reaches the first-party files this branch fixes.

- [ ] **Step 3: Confirm `packages/ui/tsconfig.json` was not touched**

```bash
git diff origin/main...HEAD --stat -- packages/ui/tsconfig.json
```

Expected: no output. Editors must still see vendored files.

- [ ] **Step 4: Build and test**

```bash
bun run build && echo "BUILD OK"
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `BUILD OK`, `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no `Errors` line.

If `apps/www/next-env.d.ts` is regenerated, revert it with `git checkout apps/www/next-env.d.ts`.

- [ ] **Step 5: Confirm no suppressions were introduced**

```bash
git diff origin/main...HEAD | grep -nE "^\+.*(@ts-ignore|@ts-expect-error|biome-ignore|: any\b|as any)" || echo "NO SUPPRESSIONS"
```

Expected: `NO SUPPRESSIONS`. Every residual error was to be fixed, not silenced.

- [ ] **Step 6: Confirm the working tree is clean**

Run: `git status --porcelain`

Expected: no output.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin chore/quality-gates
gh pr create --base main --title "chore: add quality gates for first-party code" --body "<body>"
```

For the body, cover: that the repo had no working gate because both checks were red; that ~195
vendored components no app imports carried 95% of the errors; the explicit-list boundary and why
globs could not express it; the 33 type and 15 lint fixes, with 13 of the 15 being accessibility;
that the story typecheck stays red at 877 deliberately; and that CI now gates on both.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 8: Confirm CI is green**

Run: `gh pr checks --watch --interval 30`

Expected: `verify` and `storybook` both pass. `verify` will now take slightly longer with two extra
steps. A second run may appear and be **cancelled** — the workflow's concurrency group deduplicates
`push` and `pull_request` for the same branch, and a cancelled duplicate is expected.

If `gh pr checks --watch` exceeds a command timeout, poll with plain `gh pr checks` instead of
killing and restarting the watch.

- [ ] **Step 9: Report, do not merge**

Report the PR number and CI results. The merge decision is the human's.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Boundary is an explicit list; globs cannot express it | 1 (Step 2), 3 (Steps 1-2) |
| 2. Exclusion lives in a separate tsconfig, not `tsconfig.json` | 1 (Step 4); asserted in 5 (Step 3) |
| 3. Fix the residual rather than excluding it — 33 type | 2 |
| 3. Fix the residual — 15 lint, 13 of them a11y | 3 (Steps 4-7) |
| 4. Lint scoping needs the same explicit list | 3 (Step 2) |
| 5. Wire both into CI | 4 (Step 1) |
| "What stays red, and why" documented | 4 (Step 3) |
| Verification 1-9 | 1 (Steps 5-6), 2 (Steps 5-7), 3 (Steps 8-9), 5 (Steps 1-6) |
| Out of scope — registries, MCP, relocation, a11y runner, unit tests | Global Constraints |

No gaps. The spec's note that measurements require Biome 2.3.8 is in Global Constraints and gated in
Task 1 Step 1.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Task 2 Steps 3-4
and Task 3 Steps 4-6 describe fixes by pattern with a worked example rather than dictating 33
individual patches — the errors are one-line narrowings whose correct form depends on surrounding
code, and each names its exact file and line. Both carry an explicit stop-and-report instruction for
the case where the obvious fix is wrong.

**Type consistency:** No new APIs. Cross-task names checked: the script `typecheck` in
`packages/ui/package.json` (Task 1 Step 4) is invoked identically as
`bun run --filter @repo/ui typecheck` in Tasks 1, 2, 4 and 5; the file
`packages/ui/tsconfig.typecheck.json` is named identically in Tasks 1, 4 and 5; and the baseline
figures (65 lint errors, 877 story type errors, 33 UI type errors, 15 lint residual, 1228 tests) are
quoted identically throughout.

**Ordering dependency:** Task 1 must precede Task 2 — the gate has to exist before the residual can
be measured against it. Tasks 2 and 3 are independent of each other. Task 4 must follow both, since
gating on a red check would break CI immediately. Task 5 follows everything.
