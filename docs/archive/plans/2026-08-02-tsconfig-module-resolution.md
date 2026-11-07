# Shared tsconfig Module Resolution Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Switch `packages/typescript-config/react-library.json` to `module: "ESNext"` / `moduleResolution: "Bundler"`, removing 109 type errors without touching application code.

**Architecture:** Two lines change in one shared config. Everything else is measurement. The decisive check is cheap and runs first: the `@repo/story` type-error count must go from exactly 986 to exactly 877.

**Tech Stack:** TypeScript 5.9, Bun workspaces, Vite, Storybook 10.5.5, changesets.

**Spec:** `docs/plans/2026-08-02-tsconfig-module-resolution-design.md`

## Global Constraints

- **Branch:** `fix/tsconfig-module-resolution`, created from `main`. Nothing is stacked — `main` currently contains all merged work. The branch also carries this project's two documents (`docs/plans/2026-08-02-tsconfig-module-resolution-design.md` and `-tsconfig-module-resolution.md`), which ride along in the same pull request rather than being pushed straight to `main`.
- **The gate is an exact number, not a direction.** `bun run --filter @repo/story typecheck` must report exactly **877** errors, down from exactly **986**. Higher means the change introduced problems; lower means it masked something. Either way the measured prediction was wrong and must be understood before proceeding — do not adjust the expected number to match whatever the run produces.
- `TS2305` occurrences must go from **103** to **0**.
- **Do not fix any of the 877 remaining type errors**, including the 12 this change newly surfaces (`TS2532` +4, `TS2322` +3, `TS2339` +3, `TS2345` +1, `TS2578` +1). They belong to a separate project. `TS2578` — a now-unnecessary `@ts-expect-error` in `apps/story/stories/Tokens.stories.tsx`, a first-party story file, not a vendored component — is especially tempting, since fixing it is a one-line deletion, but it stays deferred so it remains visible in the separate project's error count rather than being quietly absorbed by this config change.
- Change **only** `packages/typescript-config/react-library.json`, plus one new changeset file. Do not touch `base.json`, `apps/app/tsconfig.json`, `apps/www/tsconfig.json`, `apps/story/tsconfig.json`, or `packages/ui/tsconfig.json`.
- Do **not** add a `typecheck` script to `packages/ui`, and do **not** add `@repo/story` to CI's typecheck. Both would be immediately red against the 877.
- **Lint baseline:** `bunx biome lint . --max-diagnostics=none` → `Found 65 errors.` / `Found 412 warnings.` Never omit `--max-diagnostics=none`; Biome's default cap of 20 silently truncates the count.
- **Storybook suite baseline:** exit 0, `Test Files 299 passed | 6 skipped (305)`, `Tests 1228 passed (1228)`, no `Errors` line. The suite takes ~150 seconds — allow a 15-minute timeout and never kill a run early.
- Do **not** fix or suppress the 65 pre-existing lint errors.
- Commits run commitlint (Conventional Commits) and lint-staged via husky.

## Testing note for this plan

There is no new code to test-drive. The cycle is: **record the exact baseline, make the two-line change, re-measure, reconcile against the predicted number.** The type-error count is the test.

---

### Task 1: Switch the shared config to bundler resolution

**Files:**
- Modify: `packages/typescript-config/react-library.json`

**Interfaces:**
- Consumes: nothing.
- Produces: `apps/story` and `packages/ui` resolving modules the way Vite actually does. Task 2 adds the changeset describing this; Task 3 verifies nothing else regressed.

- [ ] **Step 1: Record the exact baseline**

Run:

```bash
bun run --filter @repo/story typecheck > /tmp/tc-before.log 2>&1
echo "total: $(grep -cE 'error TS' /tmp/tc-before.log)"
echo "TS2305: $(grep -c 'TS2305' /tmp/tc-before.log)"
```

Expected: `total: 986` and `TS2305: 103`.

If either differs, **stop and report**. The branch is not in the state this plan measured, and every later comparison would be meaningless.

- [ ] **Step 2: Confirm the diagnosis before changing anything**

Run:

```bash
grep 'TS2305' /tmp/tc-before.log | grep -oE "Module '\"[^\"]+\"'" | sort | uniq -c | sort -rn
```

Expected: `101 Module '"ogl"'` and `2 Module '"@react-three/postprocessing"'`.

This is the evidence that these are a resolution problem with one package rather than 103 separate broken imports. Record it in your report.

- [ ] **Step 3: Make the change**

`packages/typescript-config/react-library.json` currently reads:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "React Library",
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-jsx"
  }
}
```

Change it to:

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "display": "React Library",
  "extends": "./base.json",
  "compilerOptions": {
    "jsx": "react-jsx",
    "module": "ESNext",
    "moduleResolution": "Bundler"
  }
}
```

Both options are required together — TypeScript rejects `moduleResolution: "Bundler"` unless `module` is `ESNext`, `Preserve`, or another ES-flavoured value. These match `packages/typescript-config/nextjs.json`, so the repo keeps one convention rather than gaining a third.

Do not touch `base.json`. It is the Node-oriented default and stays correct for future packages that genuinely resolve under Node rules.

- [ ] **Step 4: Measure the result**

Run:

```bash
bun run --filter @repo/story typecheck > /tmp/tc-after.log 2>&1
echo "total: $(grep -cE 'error TS' /tmp/tc-after.log)"
echo "TS2305: $(grep -c 'TS2305' /tmp/tc-after.log)"
```

Expected: `total: 877` and `TS2305: 0`.

**877 is the gate.** If the number differs in either direction, stop and report the actual figure plus the per-code breakdown from Step 5. Do not edit any component to reach 877.

- [ ] **Step 5: Confirm the change did what was predicted, not something else**

Run:

```bash
python3 - <<'PY'
import re, collections
def counts(p):
    c = collections.Counter()
    for line in open(p):
        m = re.search(r'error (TS\d+)', line)
        if m: c[m.group(1)] += 1
    return c
b, a = counts('/tmp/tc-before.log'), counts('/tmp/tc-after.log')
print(f"{'code':<10}{'before':>8}{'after':>8}{'delta':>8}")
for k in sorted(set(b) | set(a), key=lambda k: -(b.get(k,0) - a.get(k,0))):
    d = a.get(k,0) - b.get(k,0)
    if d: print(f"{k:<10}{b.get(k,0):>8}{a.get(k,0):>8}{d:>+8}")
print(f"{'TOTAL':<10}{sum(b.values()):>8}{sum(a.values()):>8}{sum(a.values())-sum(b.values()):>+8}")
PY
```

Expected, matching the spec's measured table:

```
TS2305       103       0    -103
TS7006        19       9     -10
TS2724         3       0      -3
TS2307         4       2      -2
TS2590         7       5      -2
TS2835         1       0      -1
TS2345        92      93      +1
TS2578         0       1      +1
TS2322       265     268      +3
TS2339        23      26      +3
TS2532       146     150      +4
TOTAL        986     877    -109
```

The `+12` are previously-masked errors, not new breakage: a module that resolves to "no exports" makes everything imported from it implicitly `any`, which suppresses downstream errors. They stay. Do not fix them.

- [ ] **Step 6: Confirm the apps are untouched**

Run: `bun run typecheck`

Expected: exit 0 for `@repo/app` and `@repo/www`. Both have standalone tsconfigs already on `module: esnext` / `moduleResolution: bundler` with no `extends`, so this change cannot reach them — this step proves it rather than assuming it.

- [ ] **Step 7: Commit**

```bash
git add packages/typescript-config/react-library.json
git commit -m "fix: use bundler module resolution in the react library tsconfig

react-library.json inherited moduleResolution NodeNext from base.json,
but both consumers -- apps/story and packages/ui -- are bundled by Vite.

ogl's type definitions re-export with extensionless relative paths
(export * from './core/Mesh'), which NodeNext rejects, so the module
presented as having no exports. That produced 101 of the 103 TS2305
errors against a package whose types are fine.

Takes @repo/story from 986 type errors to 877. The 12 errors that newly
surface were masked: an unresolvable module makes its imports implicitly
any, suppressing downstream errors."
```

---

### Task 2: Add the changeset

**Files:**
- Create: `.changeset/<two-random-words>.md`

**Interfaces:**
- Consumes: Task 1's change, which this describes.
- Produces: a changeset entry that Task 3 verifies.

- [ ] **Step 1: Check the existing format**

Run: `cat .changeset/quiet-moons-repeat.md`

Expected: YAML frontmatter naming packages and bump levels, then a prose summary. Match that shape.

- [ ] **Step 2: Confirm the package name is valid**

Run:

```bash
python3 -c "import json;d=json.load(open('.changeset/config.json'));print('fixed:',d['fixed']);print('ignore:',d['ignore'])"
```

Expected: `@repo/typescript-config` appears in the `fixed` group, and `ignore` is `['@repo/story']`.

Do **not** name `@repo/mono`. That is the workspace root, which `@manypkg/get-packages` returns as `rootPackage` rather than a member, and `changeset version` fails with "not in the workspace".

- [ ] **Step 3: Create the changeset**

Create `.changeset/lazy-pandas-argue.md` containing exactly:

```markdown
---
"@repo/typescript-config": patch
---

Use `module: ESNext` and `moduleResolution: Bundler` in the shared React library config. Both consumers — `apps/story` and `packages/ui` — are bundled by Vite, so Node-flavoured resolution was wrong for them. Removes 109 type errors, including all 103 `TS2305` "no exported member" errors caused by `ogl` re-exporting without file extensions.
```

Patch, not minor: nothing gains a feature and no consumer's API changes. `@repo/typescript-config` is in the `fixed` group, so the bump propagates across that group.

- [ ] **Step 4: Verify changesets accepts it**

Run: `bunx changeset status 2>&1 | tail -15`

Expected: it lists a patch bump and does **not** error. Specifically there must be no `ValidationError` and no "not in the workspace" message.

- [ ] **Step 5: Commit**

```bash
git add .changeset/lazy-pandas-argue.md
git commit -m "chore: add changeset for the tsconfig resolution fix"
```

---

### Task 3: Verify nothing regressed, then open the PR

**Files:** none modified unless a check fails.

**Interfaces:**
- Consumes: Tasks 1 and 2.
- Produces: a pull request with green CI.

- [ ] **Step 1: Verify the Storybook suite is unchanged**

Run:

```bash
bun --filter @repo/story test --run > /tmp/sb.log 2>&1; echo "EXIT=$?"
grep -E "Test Files|Tests |Errors " /tmp/sb.log | tail -4
```

Expected: `EXIT=0`, `Test Files 299 passed | 6 skipped (305)`, `Tests 1228 passed (1228)`, and **no `Errors` line**.

Exit code is a gate independent of the counts — Vitest exits non-zero on unhandled errors even when every test passes.

This matters more than it looks: a tsconfig change should not affect Vite's runtime behaviour at all, so any movement here would mean the change did something unexpected.

- [ ] **Step 2: Verify the build**

Run: `bun run build`

Expected: exit 0 across all four workspaces.

If `apps/www/next-env.d.ts` is regenerated, revert it with `git checkout apps/www/next-env.d.ts` before committing anything — it is an auto-generated artifact.

- [ ] **Step 3: Verify lint has not moved**

Run: `bunx biome lint . --max-diagnostics=none 2>&1 | grep -E "^Found"`

Expected: `Found 65 errors.` and `Found 412 warnings.` — unchanged.

- [ ] **Step 4: Verify the diff is exactly two files**

Run: `git diff --stat origin/main...HEAD`

Expected exactly these four files and nothing else:

| File | Change |
|---|---|
| `packages/typescript-config/react-library.json` | 2 insertions |
| `.changeset/lazy-pandas-argue.md` | new |
| `docs/plans/2026-08-02-tsconfig-module-resolution-design.md` | new |
| `docs/plans/2026-08-02-tsconfig-module-resolution.md` | new |

The two documents are this project's spec and plan, carried on the branch so they land through the
same review as the change they describe. If any **fifth** file appears — particularly a component,
a tsconfig other than `react-library.json`, or `apps/www/next-env.d.ts` — **stop and report**.

- [ ] **Step 5: Confirm the working tree is clean**

Run: `git status --porcelain`

Expected: no output.

- [ ] **Step 6: Push and open the PR**

```bash
git push -u origin fix/tsconfig-module-resolution
gh pr create --base main --title "fix: use bundler module resolution in the shared react library tsconfig" --body "<body>"
```

Base is `main`. Nothing is stacked.

For the body, cover:

- What changed: two compiler options in one shared config.
- Why: `ogl` re-exports with extensionless relative paths, valid under bundler resolution and rejected by `NodeNext`, which made the module present as having no exports.
- The result: `@repo/story` type errors 986 → 877, `TS2305` 103 → 0.
- That 12 errors newly surface because an unresolvable module makes its imports implicitly `any`, masking downstream errors — and that those stay, belonging to a separate project.
- That no CI check covers this: root `typecheck` is scoped to `apps/app` and `apps/www`, both unaffected, and `packages/ui` has no typecheck script. The improvement is real but unguarded.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 7: Confirm CI is green**

Run: `gh pr checks --watch --interval 30`

Expected: `verify` and `storybook` both pass. `verify` takes about 3 minutes, `storybook` about 12.

A second run may appear and be **cancelled** — the workflow's concurrency group deduplicates the `push` and `pull_request` events for the same branch. A cancelled duplicate is expected. Confirm with:

```bash
gh run list --branch fix/tsconfig-module-resolution --limit 2 --json event,conclusion
```

- [ ] **Step 8: Report, do not merge**

Report the PR number and CI results. Do not merge — that decision is the human's.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. The change — `module: ESNext` + `moduleResolution: Bundler` in `react-library.json` | 1, Step 3 |
| 1. `base.json` deliberately untouched | Global Constraints; 1, Step 3 |
| 2. Blast radius — apps unaffected | 1, Step 6 (proves it, rather than asserting) |
| 3. Changeset — patch, `@repo/typescript-config`, not `@repo/mono` | 2 |
| Verification — `@repo/story` exactly 877 | 1, Step 4 |
| Verification — `TS2305` → 0 | 1, Steps 1 and 4 |
| Verification — root `typecheck` exit 0 | 1, Step 6 |
| Verification — `bun run build` exit 0 | 3, Step 2 |
| Verification — Storybook suite unchanged | 3, Step 1 |
| Verification — lint 65/412 unchanged | 3, Step 3 |
| Verification — one new changeset entry | 2, Step 4 |
| Out of scope — the 877, the 12 surfaced, `packages/ui` typecheck script, CI typecheck | Global Constraints |

No gaps. The spec's "honest limitation" (no CI check detects this change) is not a verification step — it is context, and it is carried into the PR body in Task 3 Step 6 so reviewers know the improvement is unguarded.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Every step is an exact command with expected output, or literal before/after file content. Task 3 Step 6's PR body is specified by required content rather than dictated verbatim, which suits prose.

**Type consistency:** No code is introduced. Cross-task consistency checked: the branch name `fix/tsconfig-module-resolution` is identical in Global Constraints and Task 3 Steps 6-7; the changeset filename `.changeset/lazy-pandas-argue.md` is identical in Task 2 Steps 3 and 5; and the baseline triple (986 → 877, `TS2305` 103 → 0) is quoted identically in Global Constraints and Task 1 Steps 1, 4 and 5.

**Ordering dependency:** Task 1 must precede Task 2, since the changeset describes a change that must exist first. Task 3 must follow both — Step 4 asserts the complete diff is exactly two files, which is only true once both prior tasks have committed.
