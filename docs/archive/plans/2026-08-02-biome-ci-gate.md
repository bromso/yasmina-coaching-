# One Biome CI Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take `biome ci .` from 196 errors to zero and make it the single Biome gate in CI, so the command developers run locally is the command that blocks a merge.

**Architecture:** Three unrelated causes produce the 196. Fix them in dependency order — hoist a misplaced ignore list (kills 44 parse errors), run an assist nothing has ever run (96), format (48) — then reconcile the root scripts with the workflow so `bun run ci` is exactly the four steps CI runs.

**Tech Stack:** Biome 2.3.8, Bun workspaces, GitHub Actions.

## Global Constraints

- Biome must be **2.3.8**. Confirm with `bunx biome --version` before any measurement. A different version produces different counts and invalidates every figure in this plan.
- Always pass `--max-diagnostics=none`. Biome's default cap of 20 silently truncates.
- Always pass `--colors=off` when grepping Biome output. Its ANSI codes make `grep -E "^Found"` match nothing, which reads as "no errors" and is not.
- Biome prints **no** `Found N errors.` line at zero. Absence of the line is the pass condition, not a `Found 0 errors.` string.
- **Never** use `--config-path` with a scratch directory. It fails with `Biome couldn't find an ignore file in the following folder`, which looks like a bad config but is not; copying `.gitignore` beside it makes Biome walk `node_modules` and hang. Test config changes in place and revert.
- **No suppressions.** Do not resolve anything with `biome-ignore`, `@ts-ignore`, `@ts-expect-error`, `any`, `as any`, or a non-null `!`. Task 5 greps the branch diff for these.
- **Vendored files:** `packages/ui/src/components/Crosshair.tsx` is the only vendored file this project may touch, and only via formatting and import order. "Formatting" here means everything `biome format` rewrites — not just whitespace, but semicolons, quote style, trailing commas, arrow parentheses and JSX wrapping. This file was never in Biome style, so its diff is large. No other file matching `packages/ui/src/components/([A-Z]|animate-ui/|magicui/)` may appear in the diff.
- `packages/ui/tsconfig.json`, `packages/ui/tsconfig.typecheck.json`, and the `overrides` block of `biome.json` must all remain unmodified. This project changes the ignore list, not the boundary.
- Branch: `chore/biome-ci-gate`, already created from `main` at `881ace8`.

---

### Task 1: Hoist the ignore list into `files.includes`

**Files:**
- Modify: `biome.json` — `files` (lines 9-11), `formatter.includes` (lines 19-41), `linter.includes` (lines 77-99)

**Interfaces:**
- Consumes: nothing.
- Produces: a `files.includes` array that all later measurements depend on. Tasks 2 and 3 assume parse errors are gone.

- [ ] **Step 1: Confirm the Biome version and record the baseline**

```bash
bunx biome --version
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
```

Expected: `Version: 2.3.8`, then `Checked 845 files`, `Found 196 errors.`, `Found 62 warnings.`, `Found 46 infos.`

If the version is not 2.3.8, run `bun install --frozen-lockfile` and re-check. Do not proceed on another version.

- [ ] **Step 2: Confirm the two ignore lists are identical**

```bash
python3 -c "
import json
d=json.load(open('biome.json'))
print('identical:', d['formatter']['includes']==d['linter']['includes'])
print('entries:', len(d['formatter']['includes']))
"
```

Expected: `identical: True`, `entries: 21`.

This confirms one list duplicated, not two that diverged. If they are not identical, stop and report —
this plan assumes a single duplicated list.

It does **not** mean the hoisted copy must match them character for character. See Step 3, where 13
patterns intentionally change form.

- [ ] **Step 3: Add `includes` to `files`**

Replace `biome.json` lines 9-11:

```json
  "files": {
    "ignoreUnknown": true
  },
```

with:

```json
  "files": {
    "ignoreUnknown": true,
    "includes": [
      "**",
      "!**/.git",
      "!**/.turbo",
      "!**/.agents/**/templates",
      "!**/.next",
      "!**/.swc",
      "!**/.sourcemaps",
      "!**/.source",
      "!**/.cursor",
      "!**/.vscode",
      "!**/workspace.code-workspace",
      "!**/node_modules",
      "!**/dist",
      "!**/build",
      "!**/coverage",
      "!**/bun.lockb",
      "!**/bun.lock",
      "!**/package-lock.json",
      "!**/yarn.lock",
      "!**/public/sw.js",
      "!**/public/sw.js.map"
    ]
  },
```

**The 13 folder patterns deliberately drop the `/**` suffix that `formatter.includes` and
`linter.includes` carried.** This is *not* a transcription error, and the list is therefore **not**
byte-identical to the two it replaces. Biome 2.3.8 ships a lint rule,
`suspicious/useBiomeIgnoreFolder`, whose entire purpose is to flag `"!**/dist/**"` with *"Incorrect
usage of ignore a folder found."* Writing the suffixed form here produces **13 new warnings against
`biome.json` itself** (62 → 75). Both forms exclude the directory's contents identically, so the
error counts are unaffected either way — only the warning count distinguishes them.

The suffixed form survived in `formatter.includes` and `linter.includes` because the rule does not
fire there. Moving the list to `files.includes` is what exposes it.

Verify after editing: `bunx biome lint biome.json --max-diagnostics=none --colors=off` must report no
`useBiomeIgnoreFolder` diagnostic.

- [ ] **Step 4: Remove `includes` from `formatter`**

In the `formatter` block, delete the entire `"includes": [ ... ]` array (21 entries) and the trailing comma on the preceding `"lineEnding": "lf"` line. The block becomes:

```json
  "formatter": {
    "enabled": true,
    "formatWithErrors": false,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100,
    "lineEnding": "lf"
  },
```

- [ ] **Step 5: Remove `includes` from `linter`**

In the `linter` block, delete the entire `"includes": [ ... ]` array (21 entries). The block begins:

```json
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
```

Leave `rules` and everything under it untouched.

- [ ] **Step 6: Confirm `biome.json` is still valid and correctly formatted**

```bash
python3 -c "import json;json.load(open('biome.json'));print('valid json')"
bunx biome format biome.json --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "biome.json FORMATTED CORRECTLY"
```

Expected: `valid json`, then `biome.json FORMATTED CORRECTLY`.

If it reports a format error, run `bunx biome format --write biome.json`. `biome.json` must not leak into Task 3's file set.

- [ ] **Step 7: Verify the parse errors are gone and lint coverage is unchanged**

```bash
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 \
  | grep -oE "^[^ ]+ (format|assist/[a-zA-Z/]+|parse)" \
  | awk '{print $2}' | sed -E 's#assist/.*#assist/organizeImports#' | sort | uniq -c
bunx biome lint . --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
```

Expected:
- `Checked 816 files`, `Found 144 errors.`
- Category breakdown: `96 assist/organizeImports`, `48 format`, and **no `parse` line**
- Lint: `Checked 812 files`, **no `Found N errors.` line**, `Found 62 warnings.`, `Found 46 infos.`

The lint figures are the safety check: identical file count and still zero errors means the hoist did not shrink what the existing gate sees. If lint's file count changes, stop and report.

If the error total is 145 rather than 144 and the extra one is `biome.json`, Step 6 was skipped — go back and run it.

- [ ] **Step 8: Commit**

```bash
git add biome.json
git commit -m "fix: hoist the shared ignore list into files.includes

The same 20-entry ignore list was duplicated verbatim in
formatter.includes and linter.includes, and absent from files.includes.
Parsing happens at the files layer, so biome check and biome ci parsed
what both the formatter and the linter were told to skip -- 44 parse
errors, every one of them in a single skill template that is not meant
to compile.

Hoisting the list to files.includes and deleting both copies gives one
source of truth and takes biome ci from 196 errors to 144. Lint is
unaffected: same 812 files, same zero errors."
```

---

### Task 2: Organize imports

**Files:**
- Modify: 96 files across `apps/story` (93), `packages/ui/src/components/Crosshair.tsx`, `packages/ui/src/hooks/use-is-in-view.ts`, `packages/ui/src/hooks/use-motion-value-state.ts`

**Interfaces:**
- Consumes: Task 1's `files.includes`. Without it this command also reports 44 parse errors.
- Produces: zero `assist/source/organizeImports` errors.

- [ ] **Step 1: Confirm the starting count**

```bash
bunx biome check --formatter-enabled=false --linter-enabled=false . \
  --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
```

Expected: `Found 96 errors.` and no `parse` diagnostics.

If this reports 148, Task 1 was not applied — stop and report.

- [ ] **Step 2: Record which files will change, for the review in Step 5**

```bash
bunx biome check --formatter-enabled=false --linter-enabled=false . \
  --max-diagnostics=none --colors=off 2>&1 \
  | grep -oE "^[^ ]+ assist/" | awk '{print $1}' | cut -d: -f1 | sort -u \
  > /tmp/oi-files.txt
wc -l < /tmp/oi-files.txt
```

Expected: `96`.

- [ ] **Step 3: Confirm no file being changed has a side-effect-only import**

```bash
xargs -a /tmp/oi-files.txt grep -lE "^import ['\"][^'\"]+['\"];?$" 2>/dev/null | wc -l
```

Expected: `0`.

This is the reason this task is considered safe. A side-effect-only import (`import "./styles.css"`) executes for its effect, and moving it can change behaviour. If this returns anything other than 0, **stop and report** — the affected files need reading before the assist runs.

- [ ] **Step 4: Apply the assist, formatter and linter disabled**

```bash
bunx biome check --write --formatter-enabled=false --linter-enabled=false . --max-diagnostics=none
```

The two `-enabled=false` flags are what keep this commit separate from Task 3's formatting, so a bisect can tell a semantic change from a cosmetic one.

- [ ] **Step 5: Verify only import order changed**

```bash
bunx biome check --formatter-enabled=false --linter-enabled=false . \
  --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "ASSIST CLEAN"
git diff --stat | tail -1
git diff | grep -E "^[+-]" | grep -vE "^[+-]{3}" | grep -vE "^[+-]\s*(import|})" | grep -vE "^[+-]\s*$" | head -20
```

Expected: `ASSIST CLEAN`, 96 files changed, and the third command prints **nothing** — every changed line is an import line.

If the third command prints non-import lines, stop and report what they are.

- [ ] **Step 6: Confirm the vendored constraint held**

```bash
git diff --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"
```

Expected: exactly `packages/ui/src/components/Crosshair.tsx` and nothing else.

- [ ] **Step 7: Build and test**

```bash
bun run build && echo "BUILD OK"
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `BUILD OK`, `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no `Errors` line.

This is the primary evidence that reordering imports changed nothing semantic. If any test fails, stop and report the failure — do not adjust the test.

If `apps/www/next-env.d.ts` is regenerated, revert it with `git checkout apps/www/next-env.d.ts`.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "style: organize imports across 96 files

assist.actions.source.organizeImports has been configured 'on' all
along, but no script in the repo runs assists -- biome lint does not,
and only check and ci do. 104 violations accumulated unobserved, 96
after the ignore-list fix.

Applied with the formatter and linter disabled so this commit contains
only import reordering, which is the one change here that could alter
behaviour. Verified no affected file has a side-effect-only import, and
that the build and all 1228 tests still pass."
```

---

### Task 3: Format

**Files:**
- Modify: 48 files — 40 under `apps/story/stories/`, 6 under `.claude/skills/`, `.mcp.json`, `packages/ui/src/components/Crosshair.tsx`

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: zero `format` errors, so `biome ci .` reaches zero.

- [ ] **Step 1: Confirm the starting count and capture the file list**

```bash
bunx biome format . --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
bunx biome format . --max-diagnostics=none --colors=off 2>&1 \
  | grep -oE "^[^ ]+ format " | awk '{print $1}' | sort -u > /tmp/fmt-files.txt
wc -l < /tmp/fmt-files.txt
grep -c "^\.mcp\.json$" /tmp/fmt-files.txt
```

Expected: `Found 48 errors.`, `48`, and `1` for `.mcp.json`.

If `biome.json` appears in the list, Task 1 Step 6 was skipped.

- [ ] **Step 2: Record `.mcp.json`'s parsed content before the change**

```bash
python3 -c "
import json;d=json.load(open('.mcp.json'))
print(json.dumps(d,sort_keys=True))" > /tmp/mcp-before.json
wc -c < /tmp/mcp-before.json
```

`.mcp.json` is live agent configuration. Formatting is whitespace-only, but that is verified in Step 5 rather than assumed.

- [ ] **Step 3: Apply formatting**

```bash
bunx biome format --write . --max-diagnostics=none
```

- [ ] **Step 4: Verify formatting is clean and `biome ci` is at zero**

```bash
bunx biome format . --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "FORMAT CLEAN"
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "BIOME CI CLEAN"
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^(Found|Checked)"
```

Expected: `FORMAT CLEAN`, `BIOME CI CLEAN`, then `Checked 816 files` with `Found 62 warnings.` and `Found 46 infos.` but **no** `Found N errors.` line.

- [ ] **Step 5: Verify `.mcp.json` is semantically unchanged**

```bash
python3 -c "
import json;d=json.load(open('.mcp.json'))
print(json.dumps(d,sort_keys=True))" > /tmp/mcp-after.json
diff /tmp/mcp-before.json /tmp/mcp-after.json && echo "MCP CONFIG IDENTICAL"
```

Expected: `MCP CONFIG IDENTICAL`. If it differs, stop and report — reformatting must not alter agent configuration.

- [ ] **Step 6: Verify the vendored diff is whitespace and import order only**

```bash
git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"

WORK=$(mktemp -d)
git show origin/main:packages/ui/src/components/Crosshair.tsx > "$WORK/Crosshair.tsx"
(cd "$WORK" && bunx --bun @biomejs/biome@2.3.8 format --write \
   --config-path="$(git -C /Users/jonasbroms/Sites/boilerplate-bun rev-parse --show-toplevel)" \
   Crosshair.tsx >/dev/null 2>&1)
diff "$WORK/Crosshair.tsx" packages/ui/src/components/Crosshair.tsx \
  | grep -E "^[<>]" | grep -v "import" \
  || echo "CROSSHAIR: FORMATTER OUTPUT PLUS IMPORT ORDER ONLY"
```

Expected: only `packages/ui/src/components/Crosshair.tsx`, then
`CROSSHAIR: FORMATTER OUTPUT PLUS IMPORT ORDER ONLY`.

**Do not use `git diff -w` for this.** An earlier version of this step did, and it was the wrong
instrument: `-w` ignores whitespace, but Biome's formatter also rewrites semicolons, quote style,
trailing commas, arrow parentheses and JSX attribute wrapping. `Crosshair.tsx` was never in Biome
style, so `-w` reports all of those as real changes and the check fails on a file that is in fact
correct.

The test above is the right one. It regenerates the expected content from `origin/main` by running
the formatter, so anything that survives the comparison is a change the formatter did **not** make.
Import lines are excluded because Task 2 legitimately reordered them.

`--config-path` pointing at the repository root is safe. Pointing it at a scratch directory is the
failure documented in Global Constraints.

- [ ] **Step 7: Build and test**

```bash
bun run build && echo "BUILD OK"
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `BUILD OK`, `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no `Errors` line.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "style: format 48 files

40 are stories for vendored components, 6 are .claude skill JSON, plus
.mcp.json and Crosshair.tsx. Whitespace only.

Crosshair.tsx is vendored. The previous project's invariant was that no
vendored file may be modified; it is relaxed here to no vendored file
modified semantically, verified with git diff -w. The alternative was a
third copy of the 106-entry boundary list in biome.json to exempt one
file, and Biome's overrides scope lint rules rather than the formatter,
so there is no cheap way to express it.

biome ci . now reports zero errors."
```

---

### Task 4: Make `biome ci` the gate

**Files:**
- Modify: `package.json` — `scripts` block
- Modify: `.github/workflows/ci.yml:40-41`
- Modify: `CLAUDE.md` — the `### Quality gates` section

**Interfaces:**
- Consumes: Tasks 1-3. Gating on `biome ci` before it is green would break CI immediately.
- Produces: `bun run ci` equal to the workflow's four steps.

- [ ] **Step 1: Add `typecheck:ui` and rewrite `validate` and `ci`**

In `package.json`, add `typecheck:ui` immediately after the existing `typecheck` line, and replace `validate` and `ci`:

```json
    "typecheck": "bun run --filter @repo/app --filter @repo/www typecheck",
    "typecheck:ui": "bun run --filter @repo/ui typecheck",
    "validate": "biome check . --max-diagnostics=none && bun run typecheck && bun run typecheck:ui && bun run build",
    "ci": "biome ci . --max-diagnostics=none && bun run typecheck && bun run typecheck:ui && bun run build",
```

Leave `check`, `check:fix`, `lint`, `lint:fix`, `format`, `format:fix` exactly as they are — `CLAUDE.md` documents them and they are standard Biome convention.

Two things this fixes. `validate` previously ran `format`, `lint`, then `check`, and `check` is a
superset of the first two, so a third of it was redundant. And neither script ran the `@repo/ui`
typecheck that CI has gated since the previous project.

**`validate` must not write.** An earlier version of this plan used `check:fix`, reasoning that a
local command should fix what it can. Measured in a clean clone, `biome check --write .` rewrites
three files — `useConst` in `.agents/skills/skill-creator/assets/eval_review.html`, and two
`useImportType` fixes, one of them in `packages/ui/src/components/Crosshair.tsx`, **a vendored
file**. A writing `validate` therefore dirties the working tree on every run for as long as any
warn-severity issue with a safe fix exists, and edits vendored code with a lint fix rather than
formatting. Neither belongs in a command named "validate".

`validate` and `ci` consequently run the same checks, differing only in reporter: `biome check` for
readable local output, `biome ci` for CI annotations. That equivalence is the point — it is what
"local and CI agree" means here. `check:fix` remains the explicit, opt-in fixer.

- [ ] **Step 2: Replace the workflow's Lint step**

In `.github/workflows/ci.yml`, replace lines 40-41:

```yaml
      - name: Lint
        run: bun run lint
```

with:

```yaml
      - name: Biome CI
        # biome ci covers formatting, lint and import organisation in one
        # non-writing pass and annotates the PR inline. This is a strictly
        # wider gate than `bun run lint`, which sees only lint rules.
        run: bunx biome ci . --max-diagnostics=none
```

Do not touch the `Typecheck`, `Typecheck UI package` or `Build` steps, the `concurrency` block, the cache steps, or the `storybook` job. The `NODE_OPTIONS: --max-old-space-size=8192` env on Build and its comment must survive intact.

- [ ] **Step 3: Verify the script and the workflow now agree**

```bash
python3 -c "
import json;s=json.load(open('package.json'))['scripts']
print('ci     :',s['ci'])
print('validate:',s['validate'])
print('typecheck:ui:',s['typecheck:ui'])
"
grep -nE "name: (Typecheck|Biome CI|Build)|run: (bun run typecheck|bun run typecheck:ui|bunx biome ci|bun run build)" .github/workflows/ci.yml
grep -c "continue-on-error" .github/workflows/ci.yml
```

Expected: `ci` is `biome ci . --max-diagnostics=none && bun run typecheck && bun run typecheck:ui && bun run build`; the workflow shows Typecheck, Typecheck UI package, Biome CI, Build in that order; and `0` occurrences of `continue-on-error`.

The workflow orders typechecks before Biome; the `ci` script puts Biome first. That is deliberate — the script fails fastest on the cheapest check, while CI keeps its existing step order so a failure reads the same as it did before. The set of checks is identical, which is what "single definition" means here.

- [ ] **Step 4: Run both reconciled scripts**

```bash
bun run ci && echo "CI SCRIPT OK"
bun run validate && echo "VALIDATE OK"
git status --porcelain
```

Expected: `CI SCRIPT OK`, `VALIDATE OK`, and **no output** from `git status`. Both scripts are
non-writing, so any modification here means something else wrote to the tree — most likely the build
regenerating `apps/www/next-env.d.ts`, which the note below covers.

If `apps/www/next-env.d.ts` is regenerated, revert it with `git checkout apps/www/next-env.d.ts`.

- [ ] **Step 5: Update the Quality gates section in `CLAUDE.md`**

Two things in that section are now false and must change.

The opening paragraph currently names `bun run lint` as the gate. Replace it with `bunx biome ci .`, and state that the gate now covers formatting and import organisation as well as lint, making it strictly wider than before.

The paragraph beginning `Two root scripts are **not** what CI runs and are currently red:` is now entirely wrong — that was the problem this project fixed. Replace it with a statement that `bun run ci` runs exactly the workflow's four checks, that `bun run validate` is its writing twin, and that both pass.

Keep the rest of the section — the boundary rule, the 269-file count, the 48 errors behind the override, the a11y scoping, and the `@repo/story` 859 note — unchanged. None of it is affected by this project.

Add a short note recording that `files.includes` is now the single ignore list, and that `formatter.includes` and `linter.includes` no longer carry copies, so a future exclusion belongs in exactly one place.

- [ ] **Step 6: Verify every claim in the edited section**

```bash
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "BIOME CI CLEAN"
python3 -c "
import json;d=json.load(open('biome.json'))
print('files.includes entries:',len(d['files']['includes']))
print('formatter has includes:','includes' in d['formatter'])
print('linter has includes:','includes' in d['linter'])
"
```

Expected: `BIOME CI CLEAN`, `files.includes entries: 21`, and `False` for both.

Read the edited section back and check each sentence against these outputs. Three consecutive review rounds on the previous project each found a false claim in this exact section of `CLAUDE.md`; assume this edit contains one until proven otherwise.

- [ ] **Step 7: Commit**

```bash
git add package.json .github/workflows/ci.yml CLAUDE.md
git commit -m "ci: make biome ci the single Biome gate

The repo held two contradictory definitions of CI and used neither.
validate ran format, lint, then check -- and check is a superset of the
first two. ci's typecheck covered only app and www, missing the
@repo/ui typecheck that CI has gated since the last project. The
workflow ran bun run lint, which sees neither formatting nor import
organisation.

bun run ci is now exactly the workflow's four checks, validate is its
writing twin, and the workflow gates on biome ci -- a strictly wider
check than bun run lint."
```

---

### Task 5: Final verification and pull request

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: every prior task.
- Produces: a pull request with green CI.

- [ ] **Step 1: Run every gate**

```bash
bunx biome --version
bunx biome ci . --max-diagnostics=none --colors=off 2>&1 | grep -E "^Found [0-9]+ errors" || echo "BIOME CI CLEAN"
bun run ci && echo "CI OK"
bun run validate && echo "VALIDATE OK"
bun run lint && echo "LINT OK"
bun run typecheck && echo "ROOT TYPECHECK OK"
bun run typecheck:ui && echo "UI TYPECHECK OK"
```

Expected: `Version: 2.3.8`, then `BIOME CI CLEAN` and all five OK lines.

- [ ] **Step 2: Confirm the vendored boundary held**

```bash
git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"

WORK=$(mktemp -d)
git show origin/main:packages/ui/src/components/Crosshair.tsx > "$WORK/Crosshair.tsx"
(cd "$WORK" && bunx --bun @biomejs/biome@2.3.8 format --write \
   --config-path="$(git rev-parse --show-toplevel)" Crosshair.tsx >/dev/null 2>&1)
diff "$WORK/Crosshair.tsx" packages/ui/src/components/Crosshair.tsx \
  | grep -E "^[<>]" | grep -v "import" || echo "CROSSHAIR: NO SEMANTIC CHANGE"
```

Expected: exactly `packages/ui/src/components/Crosshair.tsx`, then `CROSSHAIR: NO SEMANTIC CHANGE`.

This regenerates the expected content by running the formatter over `origin/main`'s version, so
anything surviving the comparison is a change the formatter did not make. Do **not** substitute
`git diff -w` — it ignores whitespace but not semicolons, quotes, trailing commas, arrow parentheses
or JSX wrapping, all of which the formatter rewrites in this file.

- [ ] **Step 3: Confirm the boundary files were not touched**

```bash
git diff origin/main...HEAD --stat -- packages/ui/tsconfig.json packages/ui/tsconfig.typecheck.json
python3 -c "
import json
d=json.load(open('biome.json'))
o=[x for x in d['overrides'] if x.get('linter',{}).get('rules')][0]
print('override includes:',len(o['includes']))
print('override rules:',sum(len(v) for v in o['linter']['rules'].values()))
"
```

Expected: no output from the first command; `override includes: 106` and `override rules: 11`.

This project changes the ignore list, not the vendored boundary. Any change to these is a scope violation.

- [ ] **Step 4: Build and test**

```bash
bun run build && echo "BUILD OK"
bun --filter @repo/story test --run 2>&1 | grep -E "Test Files|Tests |Errors " | tail -4
```

Expected: `BUILD OK`, `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no `Errors` line.

- [ ] **Step 5: Confirm no suppressions were introduced**

```bash
git diff origin/main...HEAD -- . ':(exclude)docs/plans/*' \
  | grep -nE "^\+.*(@ts-ignore|@ts-expect-error|biome-ignore|: any\b|as any)" \
  || echo "NO SUPPRESSIONS"
```

Expected: `NO SUPPRESSIONS`. The plan documents exclude these patterns because they quote the rule itself.

- [ ] **Step 6: Confirm the working tree is clean**

Run: `git status --porcelain`

Expected: no output.

- [ ] **Step 7: Push and open the PR**

```bash
git push -u origin chore/biome-ci-gate
gh pr create --base main --title "chore: make biome ci the single Biome gate" --body "<body>"
```

For the body, cover: that `bun run validate` and `bun run ci` both reported 196 errors while CI ran neither, so the repo's own validation command failed on a green PR; that the 196 was three unrelated causes, only 48 of them formatting; the misplaced ignore list and why parsing ignored it; that the assist had been configured on but never run; the script reconciliation; that the gate is now strictly wider than `bun run lint`; and the relaxed vendored invariant with `Crosshair.tsx` as its only instance.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 8: Confirm CI is green**

```bash
gh pr checks --watch --interval 30
```

Expected: `verify` and `storybook` both pass, with `verify` running Biome CI in place of Lint. A second run may appear and be **cancelled** — the workflow's concurrency group deduplicates `push` and `pull_request` for the same branch, and `gh pr checks` renders a cancelled run as `fail`. Confirm with `gh run view <id> --json conclusion` before treating it as a failure.

If `gh pr checks --watch` exceeds a command timeout, poll with plain `gh pr checks` instead of killing and restarting the watch.

- [ ] **Step 9: Report, do not merge**

Report the PR number and CI results. The merge decision is the human's.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| Cause 1 — ignore list in the wrong place | 1 |
| Cause 2 — assist nothing runs | 2 |
| Cause 3 — formatting | 3 |
| Design 1 — hoist to `files.includes` | 1 (Steps 3-5) |
| Design 2 — run assist, then format, separate commits | 2, 3 |
| Design 3 — reconcile scripts | 4 (Step 1) |
| Design 4 — replace the workflow's lint step | 4 (Step 2) |
| Design 5 — vendored invariant relaxed | 3 (Step 6), 5 (Step 2) |
| Risk — `organizeImports` side effects | 2 (Steps 3, 7) |
| Risk — `.mcp.json` is live config | 3 (Steps 2, 5) |
| Measurement hazards | Global Constraints |
| Verification 1-12 | 1 (Step 7), 2 (Step 7), 3 (Steps 4-7), 4 (Steps 3-6), 5 (Steps 1-6, 8) |
| Out of scope — vulnerabilities, branches, a11y runner, unit tests | not scheduled, by design |

No gaps. The spec's requirement that the post-hoist figure be confirmed rather than inherited is Task 1 Step 7, which names 144 and explains the 145 case.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Task 4 Step 5 describes the `CLAUDE.md` edit in prose rather than giving replacement text, because the surrounding section is long, was rewritten twice in the previous project, and the correct wording depends on its state at the time — so Step 6 verifies every claim mechanically instead. Every other step that changes a file shows the exact content.

**Type consistency:** No new APIs. Cross-task names checked: `typecheck:ui` is defined in Task 4 Step 1 and invoked identically in Task 4 Step 4 and Task 5 Step 1; `files.includes` is named identically in Tasks 1, 4 and 5; the vendored grep `packages/ui/src/components/([A-Z]|animate-ui/|magicui/)` is byte-identical in Tasks 2, 3 and 5; and the counts (196, 144, 96, 48, 21 entries, 106 includes, 11 rules, 1228 tests) are quoted identically throughout.

**Ordering dependency:** Task 1 must precede Task 2 — without it the assist command also reports 44 parse errors, which was verified directly. Task 3 may follow Task 2 in either order in principle, but is sequenced after it so that the one behaviour-capable change is isolated in an earlier commit. Task 4 must follow 1-3, since gating on a red check would break CI immediately. Task 5 follows everything.
