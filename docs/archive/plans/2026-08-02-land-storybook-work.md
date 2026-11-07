# Land the Stranded Storybook Work Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Get the eight commits on `chore/storybook-10.5` — the Storybook 10.5.5 upgrade, the Chromatic removal, and their documents — onto `main`.

**Architecture:** The work is already committed and pushed; it is only pointing at a stale base. A short note goes into `CLAUDE.md` first so it rides along in the same pull request, then a single PR against `main` carries everything. The merge is clean and was verified by test-merge, so there is nothing to reconcile.

**Tech Stack:** git, GitHub CLI (`gh`), GitHub Actions.

**Spec:** `docs/plans/2026-08-02-land-storybook-work-design.md`

## Global Constraints

- Work on branch `chore/storybook-10.5`. Do **not** create a new branch, rebase, cherry-pick, or force-push. The commits are already correct and pushed; rewriting them is the one way to make this worse.
- **The merge in Task 3 is the only irreversible, outward-facing action in this plan.** The controller must confirm with the human before executing it. Everything up to and including Task 2 is safe and reversible.
- The merge is clean — verified by test-merge before this plan was written: `MERGE_EXIT=0`, "Automatic merge went well", zero conflicting files. If an implementer hits a conflict, something has changed since; stop and report rather than resolving it.
- **`main` must keep `actions/checkout@v7` and `actions/cache@v6`** after the merge. These came from merged Dependabot PRs #3 and #4. The branch's own `ci.yml` still reads `@v4`, but it never modified that file relative to the merge base, so a three-way merge takes `main`'s version. Verify this rather than assume it — an earlier version of the spec predicted the opposite outcome.
- Do **not** delete `chore/repo-hygiene-ci-green`, `chore/storybook-10.5`, or any other branch. Out of scope.
- Do **not** touch the 996 `@repo/story` type errors, the 65 lint errors, or the a11y configuration. All are documented debt with their own follow-ups.
- Do **not** add tooling, CI checks, or automation to detect stranded stacked PRs. The `CLAUDE.md` note is prose only.
- Commits run commitlint (Conventional Commits) and lint-staged via husky.
- Repo merge style: PRs #1, #2 and #5 all landed as merge commits (`Merge pull request #N from …`). Use `gh pr merge --merge`, not squash or rebase.

## Testing note for this plan

There is no code to test-drive. The suite that matters — 1228 Storybook tests — runs in CI against the pull request's merge commit, which is exactly the post-merge state. Task 3 then verifies the result on `main` directly.

---

### Task 1: Record the stacked-PR hazard in CLAUDE.md

This lands on the same branch so it ships in the same pull request.

**Files:**
- Modify: `CLAUDE.md` (new `###` subsection at the end of `## Troubleshooting`)

**Interfaces:**
- Consumes: nothing.
- Produces: a committed `CLAUDE.md` change that Task 2's pull request will include.

- [ ] **Step 1: Confirm the insertion point**

Run: `grep -n "^## \|^### " CLAUDE.md`

Expected: `### Module Resolution Issues` appears at roughly line 165 and `## Slash Commands` at roughly line 169, with `## Troubleshooting` at roughly 158. The new subsection goes between the last `###` of Troubleshooting and `## Slash Commands`.

- [ ] **Step 2: Add the subsection**

`CLAUDE.md` currently reads, at the end of the Troubleshooting section:

```markdown
### Module Resolution Issues
1. Ensure `@repo/ui` exports the component (check `packages/ui/package.json` `exports`)
2. Restart dev server after package changes

## Slash Commands
```

Change it to:

```markdown
### Module Resolution Issues
1. Ensure `@repo/ui` exports the component (check `packages/ui/package.json` `exports`)
2. Restart dev server after package changes

### Stacked pull requests

When a PR is based on another unmerged branch rather than `main`, merging the parent first strands
the child: its merge lands in a branch nobody will merge again, and the work never reaches `main`.
Both PRs still report `MERGED`.

Either merge child-first, or retarget the child to `main` as soon as the parent lands.

## Slash Commands
```

Add nothing else. No tooling, no checklist, no automation — the note is prose.

- [ ] **Step 3: Verify the placement**

Run: `grep -n "^## \|^### " CLAUDE.md | tail -5`

Expected: `### Stacked pull requests` appears after `### Module Resolution Issues` and before `## Slash Commands`.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: note the stacked pull request hazard

A PR based on another unmerged branch is stranded if the parent merges
first: the child's merge lands in a branch nobody will merge again and
the work never reaches main, while both PRs still report MERGED.

This cost eight commits sitting unnoticed off main."
```

---

### Task 2: Open the pull request and verify CI

**Files:** none modified.

**Interfaces:**
- Consumes: Task 1's commit, so it is included in the PR.
- Produces: an open, `MERGEABLE` pull request with green CI, which Task 3 merges.

- [ ] **Step 1: Confirm what is missing from main**

Run:

```bash
git fetch -q origin
git log --oneline origin/main..HEAD | wc -l
git show origin/main:apps/story/package.json | grep -E '"storybook"'
git show origin/main:apps/story/package.json | grep -c chromatic
```

Expected: a **non-zero** commit count — it will be around 11 (the original 8 stranded commits, plus
this project's design and plan documents, plus Task 1's) — with `main` still showing
`"storybook": "^10.1.8"` and `3` chromatic references.

Do not treat the exact count as the gate; it shifts as documents are committed. The two signals that
matter are that `main` still reads `^10.1.8` and that the count is not zero.

If `main` already shows `^10.5.5`, the work has landed by some other route — **stop and report** rather than opening a redundant PR.

- [ ] **Step 2: Push Task 1's commit**

Run: `git push`

Expected: succeeds. The branch already tracks `origin/chore/storybook-10.5`.

- [ ] **Step 3: Open the pull request**

```bash
gh pr create --base main --head chore/storybook-10.5 \
  --title "chore: upgrade Storybook to 10.5.5 and remove Chromatic" \
  --body "<body>"
```

Note the base is **`main`**, not `chore/repo-hygiene-ci-green`. PR #5 cannot be reused — it is already `MERGED`, into a base that had itself already merged, which is why this work never reached `main`.

For the body, cover:

- The seven Storybook packages moving `^10.1.8` → `^10.5.5`.
- Chromatic removed rather than bumped: its peer range caps at Storybook `^10.3.0-0`, and nothing drove it — no workflow, no `CHROMATIC_PROJECT_TOKEN`, and its config file was dead. Six touchpoints in total, including an orphaned `visual-test` VS Code task.
- The suite is unchanged at 299 passed / 6 skipped / 1228 tests.
- That `apps/story/.storybook/vitest.setup.ts` was evaluated against Storybook 10.3's "setup files optional" change and deliberately kept.
- That this PR exists because the original one merged into an already-merged base and stranded the work.

End the body with:

```
🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- [ ] **Step 4: Confirm the PR is mergeable**

Run: `gh pr view --json number,baseRefName,mergeable --jq '{n:.number, base:.baseRefName, mergeable}'`

Expected: base is `main` and `mergeable` is `MERGEABLE`. A `CONFLICTING` result contradicts the verified test-merge — **stop and report** rather than resolving conflicts.

- [ ] **Step 5: Wait for CI**

Run: `gh pr checks --watch --interval 30`

Expected: `verify` and `storybook` both pass. `verify` takes about 3 minutes; `storybook` about 12.

Two things to know while reading the output:

- A second run may appear and be **cancelled** — the workflow has a concurrency group that deduplicates the `push` and `pull_request` events for the same branch. A cancelled duplicate is expected, not a failure. Confirm with `gh run list --branch chore/storybook-10.5 --limit 2 --json event,conclusion`.
- CI runs against the PR's merge commit (`refs/pull/N/merge`), i.e. `main` + branch. So a green `storybook` job proves the 1228 tests pass against merged `main`, including Dependabot's action bumps.

If `storybook` fails, capture the real cause before changing anything:

```bash
gh run view <run-id> --log-failed | grep -E "Test Files|Tests |Errors |Error:" | head -20
```

- [ ] **Step 6: Report, do not merge**

Report the PR number and the CI results. **Do not merge.** Task 3 handles that, and it is gated on human confirmation.

---

### Task 3: Merge and verify main

**This task performs the only irreversible action in the plan. The controller must confirm with the human before dispatching it.**

**Files:** none modified.

**Interfaces:**
- Consumes: Task 2's green, mergeable pull request.
- Produces: `main` carrying the Storybook work.

- [ ] **Step 1: Re-confirm the PR is still green and mergeable**

Run: `gh pr view --json number,mergeable,statusCheckRollup --jq '{n:.number, mergeable, checks:[.statusCheckRollup[].conclusion]}'`

Expected: `MERGEABLE`, and every non-null check conclusion is `SUCCESS`. Ignore `null` entries for the cancelled duplicate run.

- [ ] **Step 2: Merge**

```bash
gh pr merge --merge
```

Use `--merge`, not `--squash` or `--rebase`. PRs #1, #2 and #5 all landed as merge commits, and a merge preserves the commit trail — including the two commits that record corrections made during the Storybook work.

- [ ] **Step 3: Verify the upgrade reached main**

```bash
git fetch -q origin
git show origin/main:apps/story/package.json | grep -E '"storybook"|"@storybook/'
```

Expected: all seven Storybook entries read `^10.5.5`.

- [ ] **Step 4: Verify Chromatic is gone from main**

Run: `git show origin/main:apps/story/package.json | grep -c chromatic`

Expected: `0`. Before this merge it was `3`.

- [ ] **Step 5: Verify the Dependabot bumps survived**

Run: `git show origin/main:.github/workflows/ci.yml | grep -nE "actions/(checkout|cache)@"`

Expected: `actions/checkout@v7` and `actions/cache@v6` throughout — **not** `@v4`.

This is the check most likely to have gone wrong, and it is listed explicitly because an earlier version of the spec predicted these bumps would be regressed by the merge. They should not be: the branch never modified `ci.yml` relative to the merge base.

- [ ] **Step 6: Verify nothing is left stranded**

Run: `git log --oneline origin/main..chore/storybook-10.5 | wc -l`

Expected: `0`. This is the check that would have caught the original problem — it is the direct question "is anything on this branch missing from main?", which neither PR's `MERGED` status answers.

- [ ] **Step 7: Verify the CLAUDE.md note landed**

Run: `git show origin/main:CLAUDE.md | grep -A2 "Stacked pull requests"`

Expected: the subsection text appears.

- [ ] **Step 8: Report**

Report all six verification results. There is nothing to commit in this task — `main` is updated by the merge itself.

---

## Self-Review

**Spec coverage:**

| Spec section | Task |
|---|---|
| 1. Open a PR from `chore/storybook-10.5` to `main` | 2 |
| 1. No local merge first; CI verifies the merge commit | 2, Step 5 |
| 1. Not a rebase or cherry-pick | Global Constraints |
| 2. Note the stacked-PR hazard in `CLAUDE.md` | 1 |
| Verification 1 — new PR exists, `MERGEABLE` | 2, Step 4 |
| Verification 2 — `verify` and `storybook` green | 2, Step 5 |
| Verification 3 — `main` shows `^10.5.5` | 3, Step 3 |
| Verification 4 — `grep -c chromatic` returns `0` | 3, Step 4 |
| Verification 5 — Dependabot bumps survived | 3, Step 5 |
| Verification 6 — nothing stranded | 3, Step 6 |
| Verification 7 — `CLAUDE.md` contains the note | 3, Step 7 |
| Out of scope — no branch deletion, no debt work, no automation | Global Constraints |

No gaps.

**Placeholder scan:** No TBD/TODO, no "similar to Task N", no "handle edge cases". Every step is an exact command with an expected result, or literal before/after markdown. Task 2 Step 3's PR body is specified by required content rather than dictated verbatim, which is appropriate for prose.

**Type consistency:** No code is introduced. Cross-task consistency checked: the branch name `chore/storybook-10.5` is used identically in Global Constraints and Tasks 2-3, and the `MERGEABLE` / `SUCCESS` values in Task 3 Step 1 match what Task 2 Step 4 establishes.

Self-review caught one brittle assertion: Task 2 Step 1 originally expected exactly **9** commits ahead of `main`. That number was measured before this project's own design and plan documents were committed, and would have been wrong by the time an implementer ran it. The step now gates on the two signals that actually matter — a non-zero count, and `main` still reading `^10.1.8` — rather than an exact figure that drifts with every docs commit.

**Ordering dependency:** Task 1 must precede Task 2 so the `CLAUDE.md` note is included in the pull request rather than needing a second one. Task 3 must follow Task 2's green CI, and is additionally gated on human confirmation because it is the only irreversible step.
