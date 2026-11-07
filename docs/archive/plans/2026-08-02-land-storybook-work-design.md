# Land the stranded Storybook work on main

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning

## Summary

Eight commits — the Storybook 10.5.5 upgrade, the Chromatic removal, and their design and plan
documents — are committed and pushed but exist only on `chore/storybook-10.5`. `main` does not have
them. Open a pull request from that branch to `main` and merge it.

## What happened

The branch was stacked: `chore/storybook-10.5` was based on `chore/repo-hygiene-ci-green`, which was
itself awaiting review as PR #2.

| Time | Event |
|---|---|
| 2026-08-01 20:08 | PR #2 (`chore/repo-hygiene-ci-green` → `main`) merged |
| 2026-08-01 21:57 | PR #5 (`chore/storybook-10.5` → `chore/repo-hygiene-ci-green`) merged |

PR #5 merged into a branch that had already been merged and would not be merged again, so its
content never propagated to `main`. Both PRs report `MERGED`, which is why the gap is easy to miss.

The stacking risk was flagged twice while planning, but always as "the child cannot merge until the
parent lands". The failure mode was the reverse: the parent landed *first*, leaving the child's base
stale.

Current state on `main`: `apps/story/package.json` still reads `"storybook": "^10.1.8"` and still
contains three `chromatic` references.

## Verified: the merge is clean

This was tested, not reasoned about, after an initial incorrect claim (see below).

```
git merge --no-commit --no-ff origin/main
MERGE_EXIT=0 — "Automatic merge went well"
git diff --name-only --diff-filter=U → empty (no conflicts)
```

Post-merge file state:

| File | Result |
|---|---|
| `.github/workflows/ci.yml` | `actions/checkout@v7`, `actions/cache@v6` — Dependabot's bumps preserved |
| `apps/story/package.json` | `"storybook": "^10.5.5"` — the upgrade preserved |

> **Correction.** This spec originally asserted that merging would regress Dependabot's
> `actions/checkout@v7` and `actions/cache@v6` bumps, because the branch's `ci.yml` still reads
> `@v4`. That was wrong. `chore/storybook-10.5` never modified `ci.yml` relative to the merge base,
> so a three-way merge takes `main`'s version outright. The claim came from comparing the two files'
> current contents rather than testing the merge.

The branch diverges from `main` in only seven files: `apps/story/.storybook/main.ts`,
`apps/story/.vscode/tasks.json`, `apps/story/chromatic.config.json` (deleted),
`apps/story/package.json`, `bun.lock`, and the two new documents under `docs/plans/`.

Dependabot's merged PRs (#3 `actions/checkout` 4→7, #4 `actions/cache` 4→6) touched only
`.github/workflows/`, so there is no overlap with `bun.lock` either.

## Design

### 1. Open a pull request from `chore/storybook-10.5` to `main`

The branch is already pushed and its commits are intact. PR #5 cannot be reused — it is `MERGED`,
pointing at a stale base. A new PR is required.

**No local merge of `main` into the branch first.** GitHub runs `pull_request` CI against the merge
commit (`refs/pull/N/merge`), which is `main` + branch. That verifies the true post-merge state —
including that the 1228-test suite still passes with Dependabot's action bumps in place — which is
stronger evidence than merging locally and testing that.

**Not a rebase or cherry-pick.** Both rewrite history for no benefit when the merge is already
clean. A merge also preserves the commit trail, including the two commits that record corrections
made during the Storybook work.

### 2. Note the stacked-PR hazard in CLAUDE.md

Add to `CLAUDE.md` as a new `###` subsection at the end of the existing `## Troubleshooting`
section — after `### Module Resolution Issues` (currently line 165) and before `## Slash Commands`
(currently line 169). That section already collects "things that go wrong and what to do about it",
which is exactly what this is.

```markdown
### Stacked pull requests

When a PR is based on another unmerged branch rather than `main`, merging the parent first strands
the child: its merge lands in a branch nobody will merge again, and the work never reaches `main`.
Both PRs still report `MERGED`.

Either merge child-first, or retarget the child to `main` as soon as the parent lands.
```

This is the actual lesson, and it cost eight commits' worth of work sitting unnoticed off `main`.
The note is prose only — no tooling, no automation.

## Verification

1. A new PR exists from `chore/storybook-10.5` to `main`, reporting `MERGEABLE`.
2. CI on that PR: `verify` and `storybook` both green. The `storybook` job runs the full suite, so
   this confirms 1228 tests still pass against merged `main`.
3. After merge, `git show origin/main:apps/story/package.json` shows `"storybook": "^10.5.5"` for
   all seven Storybook packages.
4. After merge, `git show origin/main:apps/story/package.json | grep -c chromatic` returns `0`.
5. After merge, `git show origin/main:.github/workflows/ci.yml` still shows `actions/checkout@v7`
   and `actions/cache@v6` — the Dependabot bumps survived.
6. After merge, `git log origin/main..chore/storybook-10.5` is empty — nothing left stranded.
7. `CLAUDE.md` contains the stacked-PR note.

Item 5 is the one that would have been easy to lose. It is listed explicitly because the original
version of this spec predicted the opposite outcome.

## Out of scope

- The 996 `@repo/story` type errors and 65 lint errors. Both remain documented debt.
- Enabling a11y enforcement. `parameters.a11y.test` is `"todo"` (warning mode) and
  `tags: ["a11y-test"]` in `preview.tsx` is dead config from Storybook 8.5. Switching it on would
  likely turn some of the 1228 green tests red and needs its own plan.
- Adding unit tests. `bun test` matches zero files repo-wide.
- Deleting `chore/repo-hygiene-ci-green` or any other merged branch.
- Any tooling or CI automation to detect stranded stacked PRs. The CLAUDE.md note is prose only.
