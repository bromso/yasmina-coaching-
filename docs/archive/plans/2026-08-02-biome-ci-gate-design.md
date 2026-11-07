# One Biome gate, and the three reasons `validate` is red

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning

## Summary

The previous project gated `bun run lint` and `bun run --filter @repo/ui typecheck` in CI. It left two
root scripts red and ungated: `bun run validate` and `bun run ci` both report **196 errors**, and CI
runs neither. A developer can run the repo's own documented validation command, watch it fail, and
still open a green pull request.

"Formatting is red" turns out to be three unrelated problems sharing one symptom. Only 48 of the 196
are formatting. Fix all three, then make `biome ci .` the single Biome gate in CI so that the command
developers run locally and the command that blocks a merge are the same thing.

This makes the gate **stricter**, not merely tidier: `biome ci` covers formatting and import
organisation on top of lint, so it catches drift `bun run lint` cannot see.

## The finding: 196 errors, three unrelated causes

`biome ci .` and `biome check .` report identical totals — 196 errors, 62 warnings, 46 infos, across
845 files. Broken down by category with `--reporter=json`:

| Category | Errors | Where |
|---|---|---|
| `parse` | 44 | **one file** |
| `assist/source/organizeImports` | 104 | 93 `apps/story`, 8 `.agents`, 3 `packages/ui` |
| `format` | 48 | 40 stories, 6 `.claude` JSONs, `.mcp.json`, `Crosshair.tsx` |

`biome lint .` reports **0 errors** over the same tree. The gate that exists is not the gate these
scripts run.

### Cause 1: an ignore list in the wrong place

All 44 parse errors are in a single file:
`.agents/skills/react-hook-form-zod/templates/server-validation.ts`. It is a skill *template*, not
compilable source, and Biome fails to parse it 44 different ways (`unterminated regex literal`,
`expected ',' but instead found '.'`).

Both `formatter.includes` and `linter.includes` already exclude `**/.agents/**/templates/**`. They
carry the **same 20-entry ignore list, duplicated verbatim**. But `files.includes` is unset, and
parsing happens at the `files` layer — so `check` and `ci` parse what the formatter and linter have
both been told to skip.

The fix is to hoist the list once into `files.includes` and delete both copies. One source of truth,
and `parse` starts respecting it like everything else.

### Cause 2: an assist nothing runs

`assist.actions.source.organizeImports` is configured `"level": "on"`. No script in the repo runs the
assist, so 104 violations accumulated unobserved. `biome lint` does not run assists; only `check` and
`ci` do.

### Cause 3: formatting

48 files, of which 40 are `apps/story/stories/**` — stories for vendored components (30 `animate-ui`,
4 `magicui`, 6 top-level). The rest are 6 `.claude/skills/**/*.json`, `.mcp.json`, and
`packages/ui/src/components/Crosshair.tsx`.

## Measured, not assumed

Hoisting the ignore list was tested in place against the real config and then reverted:

| | Before | After |
|---|---|---|
| `biome ci` errors | 196 | 145 |
| `parse` | 44 | **0** |
| `assist/organizeImports` | 104 | 96 |
| `format` | 48 | 48 |
| Files checked | 845 | 816 |
| `biome lint` errors | 0 | 0 |
| `biome lint` files checked | 812 | 812 |

**The 145 includes one artifact.** The probe rewrote `biome.json` with Python's JSON formatting, so
`biome.json` itself became the 49th format error. The true post-hoist figure is expected to be
**144** — 48 format + 96 assist. The implementation must confirm this rather than inherit the number.

Two things this table settles. Lint coverage is unchanged: identical error count over an identical
812 files, so the hoist cannot silently shrink what the existing gate sees. And `biome ci` honours
the vendored lint override from the previous project — its output contains no lint errors.

## Design

### 1. Hoist the ignore list to `files.includes`

Move the 20 `!`-prefixed patterns into `files.includes` (as `["**", ...the 20]`) and remove them from
`formatter.includes` and `linter.includes`. This kills all 44 parse errors and removes a two-way
duplication that was already a latent drift hazard.

### 2. Run the assist, then format

Order matters, and each gets its own commit so a bisect can separate a cosmetic change from a
semantic one:

1. Config hoist — shrinks everything downstream
2. `organizeImports` — the only step that can alter behaviour
3. Formatting — whitespace only

### 3. Reconcile the scripts with the workflow

The repo currently holds two contradictory definitions of "CI", and CI uses neither.

`validate` is `bun format && bun lint && bun check && bun run build`. Since `check` is a superset of
`format` and `lint`, a third of it is redundant. `ci` is `biome ci . && bun run typecheck && bun run
build`, whose `typecheck` covers only `@repo/app` and `@repo/www` — it misses the `@repo/ui`
typecheck that the previous project added as a gate.

Target state:

```
typecheck:ui   bun run --filter @repo/ui typecheck
validate       bun run check:fix && typecheck && typecheck:ui && build
ci             bunx biome ci . && typecheck && typecheck:ui && build
```

`typecheck:ui` is new — the gate CI already runs had no script of its own. `validate` becomes the
*writing* twin of `ci`, which is what is actually wanted locally.

`lint`, `format`, `check` and their `:fix` variants stay unchanged. `CLAUDE.md` documents them and
they are standard Biome convention.

### 4. Replace the workflow's lint step

The `verify` job becomes:

```
Typecheck → Typecheck UI package → Biome CI → Build
                                   ^^^^^^^^ replaces `bun run lint`
```

Typechecks and build stay discrete so a failure names itself in the Actions UI. `bun run ci` is then
exactly these four steps in order — local and CI agree by construction.

### 5. The vendored invariant is relaxed

The previous project held that **no vendored file may be modified**. `Crosshair.tsx` is vendored and
is the sole vendored file this project touches, hitting both `format` and `organizeImports`.

The invariant becomes **no vendored file modified *semantically***. Formatting is whitespace and
cannot change behaviour; import organisation is verified against the build and the full test suite.

The alternative — adding formatter and assist exclusions for the vendored boundary — would mean a
**third** copy of the 106-entry boundary list in `biome.json`, to serve exactly one file. The
previous project already identified that duplication as the cost to avoid.

## Risks

**`organizeImports` across 96 files is the only real risk.** Reordering imports changes behaviour
when an import has side effects. Checked directly: **zero of the affected files contain a
side-effect-only import** (`import "..."` with no bindings). That is strong evidence, not proof — a
reordered type-only import interacting with declaration merging could still bite. The build and the
1228-test suite are what would catch it.

**`.mcp.json` and the six `.claude/skills/**/*.json` files are live agent configuration.**
Reformatting is whitespace-only, but the implementation must confirm `.mcp.json` still parses and its
servers still load rather than assume it.

## Measurement hazards

Three traps cost real time while investigating this, all worth avoiding again:

- **Biome's output is ANSI-coloured**, so `grep -E "^Found"` silently matches nothing. Pass
  `--colors=off`.
- **`--max-diagnostics=none` is mandatory.** The default cap of 20 silently truncates counts.
- **`--config-path` pointing at a scratch directory fails** with
  `Biome couldn't find an ignore file in the following folder`, because `vcs.useIgnoreFile` resolves
  relative to the config directory. The error looks like a bad config but is not. Copying
  `.gitignore` alongside it makes Biome walk `node_modules` and hang. Test config changes in place
  and revert.

All measurements must use Biome **2.3.8**, the locked version.

## Verification

1. `bunx biome ci . --max-diagnostics=none --colors=off` — no `Found N errors.` line. Biome prints
   nothing at zero; absence of the line is the pass condition.
2. `bun run ci` — exit 0.
3. `bun run validate` — exit 0.
4. `bun run lint` — exit 0, unchanged.
5. `bun run --filter @repo/ui typecheck` and `bun run typecheck` — exit 0, unchanged.
6. `bun run build` — exit 0.
7. `bun --filter @repo/story test --run` — `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no
   `Errors` line. This is the primary evidence that `organizeImports` changed nothing semantic.
8. `.mcp.json` parses (`python3 -c "import json;json.load(open('.mcp.json'))"`) and its server list is
   byte-identical in content to before, whitespace aside.
9. The only vendored file in the diff is `packages/ui/src/components/Crosshair.tsx`:
   `git diff origin/main...HEAD --name-only | grep -E "packages/ui/src/components/([A-Z]|animate-ui/|magicui/)"`
   returns that path and nothing else.
10. `git diff origin/main...HEAD -- packages/ui/src/components/Crosshair.tsx` contains no change other
    than whitespace and import order.
11. `packages/ui/tsconfig.typecheck.json` and the `biome.json` vendored override are unmodified — this
    project changes the ignore list, not the boundary.
12. CI on the PR: `verify` and `storybook` both green, with `verify` running Biome CI in place of
    lint.

## Out of scope

- **The 48 lint errors behind the vendored boundary.** Deliberately scoped out by the previous
  project and documented in `CLAUDE.md`.
- **The 62 lint warnings and 46 infos.** The gate is error-only. Promoting warnings to errors is a
  separate decision with its own cost.
- **The 86 dependency vulnerabilities**, including `next` at `^16.0.8` against an advisory range of
  `>=16.0.0 <16.2.5`. The highest-stakes item in the backlog and its own project.
- **The four merged branches still on the remote**, and `packages/typescript-config/nextjs.json`,
  which has zero consumers.
- **Storybook's a11y runner**, still in warning mode with dead `tags: ["a11y-test"]` config.
- **Unit tests.** `bun test` still matches zero files repo-wide.
- **Fixing `server-validation.ts` so it parses.** It is a skill template and is not meant to compile;
  this project excludes it rather than repairs it.
