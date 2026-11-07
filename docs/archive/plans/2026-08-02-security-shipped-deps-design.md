# Patch the shipped dependencies

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning

## Summary

`bun audit` reports **86 vulnerabilities (3 critical, 45 high, 32 moderate, 6 low)**. Thirty-seven of
them sit in three packages that reach the applications: `next` (33), `postcss` (3) and `sharp` (1).

`next` is the one that matters most in raw count. At `16.0.8` against an advisory range of
`>=16.0.0 <16.2.5`, it carries Middleware and Proxy bypasses in App Router, server-side request
forgery in rewrites and in Server Actions, and several denial-of-service paths. It is not, however,
the only one of the three that executes in production at runtime — see the correction below on why
the residual `sharp` copy matters just as much despite being the smaller advisory count.

Bump all three and move them behind the workspace catalog. This is now a safe change to make: the
repository has three working quality gates and a 1228-test suite, none of which existed three
projects ago.

## The floors matter more than the versions

`next` is declared `catalog: ^16.0.8`. That caret **already permits** the fixed `16.2.12` — the
lockfile is what pins it to the vulnerable `16.0.8`. Refreshing the lockfile alone would fix today's
audit and leave nothing preventing a future resolution back below `16.2.5`.

So each floor is chosen to **exclude every vulnerable version**, not merely to permit a fixed one:

| Package | Declared now | Advisory | New floor | Why |
|---|---|---|---|---|
| `next` | `catalog: ^16.0.8` | `>=16.0.0 <16.2.5` | `^16.2.12` | `^16.0.8` admits the whole vulnerable range |
| `sharp` | `^0.34.5` (root **and** `apps/app`) | `<0.35.0` | `^0.35.3` | a `0.x` caret cannot cross a minor, so this needs an explicit bump |
| `postcss` | `^8` (`apps/app`), `^8.5.6` (`apps/www`) | `<8.5.10` | `^8.5.25` | both ranges still admit vulnerable versions |

## Compatibility

Checked directly rather than assumed:

- `@serwist/next@9.2.3` declares `peerDependencies: { next: ">=14.0.0" }` — unaffected.
- `next@16.2.12` requires `react ^19` and `node >=20.9.0`. The catalog pins `react ^19.1.1`.
- `sharp@0.35.3` requires `node >=20.9.0` — the same floor `next` already imposes.

No version conflicts.

## The catalog move

`sharp` and `postcss` are not catalog-managed, though `CLAUDE.md` describes the catalog as the single
source of truth for shared dependency versions. `sharp` is declared **twice** — in the root
`package.json` and again in `apps/app`. `postcss` is declared in both apps at **different ranges**,
`^8` and `^8.5.6`.

Both join `next` in the root `catalog`, and their four scattered declarations become `catalog:`
references. Four manifests collapse to two catalog entries, and the next security bump is a one-line
edit rather than a hunt.

This is deliberate scope beyond the security fix. It is not, however, because the divergent `postcss`
ranges caused one app to be vulnerable while the other was not — **both** were vulnerable (`^8` in
`apps/app`, `^8.5.6` in `apps/www`; the ceiling is `<8.5.10`, and both ranges admit versions below
it, as the table above already shows). The real lesson is the branch's own thesis: a range that
merely permits the fix is not a fix. What the divergence did cause is that the problem was harder to
see and harder to fix in one place — a genuine benefit of consolidating, just not the one originally
claimed. Note too that `catalog:` is a convention, not an enforcement mechanism: nothing stops a
future app or contributor from declaring a fresh range outside the catalog, so this is an improvement
to how easy the right thing is to do, not a structural guarantee.

## What is deliberately excluded

Two more direct dependencies carry advisories, and both are **major** version bumps:

| Package | From | Fix requires | Only consumer |
|---|---|---|---|
| `mathjs` | `^14.6.0` | `15.2.0` | `packages/ui/src/components/GradualBlur.tsx` |
| `style-dictionary` | `^4.3.2` | `5.4.4` | `packages/tokens/sd.config.js` |

Neither reaches production. `GradualBlur.tsx` is a vendored component inside the lint boundary that
no application imports — only a Storybook story references it. `@repo/tokens` is depended on by
`apps/story` alone; neither application nor `packages/ui` consumes it, and CI builds it purely so
Storybook can resolve the import.

They are excluded because a Style Dictionary 4→5 migration is config work with its own design
questions, and `mathjs` needs a decision about whether to bump a major or drop a dependency that only
unimported vendored code uses. Mixing either into a project otherwise made of safe version bumps
would muddy what a failed verification is telling you. **Their own project.**

The 3 critical advisories are also excluded. They are RCE-class but confined to `@repo/story`'s
Vitest browser tooling — dev-only, and that tooling runs the very suite this project relies on for
evidence. Bumping it here would undermine the verification of everything else.

## Verification

1. `bun audit` no longer lists `next` at all, and the total falls from 86 to **53**. No severity band
   may be larger than its baseline of 3 critical / 45 high / 32 moderate / 6 low, and `critical` must
   stay at exactly 3.
2. This repo's own declarations resolve above every ceiling. `sharp` and `postcss` will each still
   have a vulnerable copy in the tree — see the correction below.
3. `sharp` appears exactly once outside the catalog — as `catalog:` in `apps/app`. No literal version
   range for it remains outside the catalog anywhere in the repo (the root `package.json` still
   declares `"sharp": "catalog:"` under `devDependencies`, which Task 2 explicitly expects — the
   catalog entry itself is the one place the range lives).
4. `postcss` appears as `catalog:` in both apps and nowhere else.
5. `bun run build` — exit 0. `sharp` ships native bindings, so a bad resolve fails here rather than
   silently.
6. `bun --filter @repo/story test --run` — `299 passed | 6 skipped (305)`, `1228 passed (1228)`, no
   `Errors` line. This is the primary evidence for the `next` bump.
7. `bunx biome ci . --max-diagnostics=none --colors=off` — no `Found N errors.` line. Biome prints
   nothing at zero; absence of the line is the pass condition. Note `grep -E "^Found"` does **not**
   prove this, because `Found 62 warnings.` also matches — use `grep -E "^Found [0-9]+ errors"`.
8. `bun run typecheck` and `bun run typecheck:ui` — exit 0.
9. `bun run ci` — exit 0, the whole gate in one command.
10. No source file changes. This project edits manifests and the lockfile only.

## Correction: only `next` can be cleared

This was found during implementation. The spec originally claimed all three packages would clear and
predicted a total of 49. That was wrong.

`next@16.2.12` — the *fixed* version — declares `postcss` as an **exact** dependency at `8.4.31`,
which no range can satisfy differently, and `sharp: "^0.34.5"` as an **optionalDependency**, whose
`0.x` caret cannot cross into the fixed `0.35.x`. Those two are the only genuinely unreachable copies
in the tree.

`@tailwindcss/postcss` is a separate, easily confused case. It requires `postcss: ^8.4.41` — and
`8.5.25` (this repo's new floor) satisfies that range, so it does **not** force a vulnerable version.
The nested `postcss@8.5.6` sitting under it is lockfile inertia: bun preserved a pre-existing
resolution rather than re-resolving up within a range that already permitted better. `vite@6.4.1`
requires `postcss: ^8.5.3` and shows the identical stale `8.5.6`, which corroborates that this is
inertia, not a constraint. Both are reachable with an ordinary dedupe — no `overrides` needed — and
are worth a cheap follow-up.

After this project the lockfile therefore holds:

```
next:    16.2.12
sharp:   0.34.5 (via next, unreachable), 0.35.3 (ours)
postcss: 8.4.31 (via next, exact, unreachable), 8.5.6 (via @tailwindcss/postcss and vite, dedupe-able), 8.5.25 (ours)
```

So **33 of the 37 advisories clear, not 37**, and the audit lands at 53. The four that remain are
`sharp`'s 1 and `postcss`'s 3.

Raising this repo's floors is still worth doing: it puts our own declarations on safe versions and
stops them regressing. But it cannot reach what `next` pins internally — the exact `postcss@8.4.31`
and the optionaldependency `sharp@^0.34.5`. Closing those would require forcing versions through the
root `overrides` block, and `next` pinning `postcss` to an exact version rather than a range is the
usual signal of a deliberate pin, so overriding it means running a combination Next never tested.
That is a decision with its own risk profile and belongs in its own project, alongside the 7 other
transitive-only advisories. Deduping `@tailwindcss/postcss`'s and `vite`'s stale `8.5.6` copies is a
much cheaper, separate follow-up, though it would not move the audit total: `next`'s exact `8.4.31`
keeps the three `postcss` advisories listed regardless of what those two copies resolve to.

The 33 that do clear are the ones that mattered: every Middleware and Proxy bypass, both SSRF paths,
and all the DoS advisories were `next`'s.

## The residual `sharp` copy is on a production runtime path, not just build tooling

Earlier drafts of this project framed `next` as "the only one of the three that executes in
production at runtime," implying the leftover `sharp` copy was harmless build-time residue. That is
wrong, and it is the single most consequential piece of remaining risk from this project.

Both `apps/app/next.config.mjs` and `apps/www/next.config.ts` set `output: "standalone"`. Both
standalone bundles contain the vulnerable copy —
`apps/app/.next/standalone/node_modules/.bun/sharp@0.34.5/` and
`apps/www/.next/standalone/node_modules/.bun/sharp@0.34.5/` — and `apps/www` does not declare
`sharp` at all, so its copy arrives purely as `next`'s own nested optional dependency. `apps/app`
configures `images.remotePatterns` for `images.unsplash.com` and `images.pexels.com` and imports
`next/image`.

The advisory is `GHSA-f88m-g3jw-g9cj`, inherited libvips CVEs in **image decoding** — precisely the
`/_next/image` fetch-and-transcode path, which processes remote binary input at request time. This
branch's bump to `^0.35.3` fixed only the `devDependency` copies (root and `apps/app`); it could not
touch the copy `next` bundles internally, which is the one that actually runs in production. That
outcome is the correct scope call, but it should be read as the most important open item from this
project, not as deferred build tooling.

## Risks

**`next` 16.0 → 16.2 is the only change that can alter runtime behaviour.** Both applications are
thin shells — a marketing site and an app shell — and Storybook does not use Next, so the blast
radius is small. The 1228-test suite and the build are what confirm it.

**`sharp` is a native module.** Its bump changes prebuilt binaries. This fails loudly at install or
build if it fails at all, which is the safe direction.

**`bun install` will rewrite `bun.lock` beyond these three packages.** Transitive resolutions may
move. The audit count is the check: it should fall to 53, and any *increase* in a severity band means
the refresh pulled in something new and needs investigating before the branch proceeds.

## Out of scope

- **`mathjs` and `style-dictionary`**, both major bumps on code that never ships. Their own project.
- **The 3 critical `@repo/story` Vitest advisories**, dev-only and load-bearing for verification.
- **The 7 transitive-only advisories** — `brace-expansion`, `minimatch`, `picomatch`, `qs`, `tmp`,
  `ws`, `yaml`. Fixing these means forcing versions through the root `overrides` block that the
  parent packages never tested against, so each needs its own justification.
- **Deleting the four merged remote branches**, and `packages/typescript-config/nextjs.json`, which
  has zero consumers.
- **The three Minor findings deferred from PR #9**: `check`/`lint`/`format` truncating at 20
  diagnostics, the unpinned `bunx biome ci .` in the workflow, and Biome now owning the formatting of
  `.claude/` and `.agents/`.
- **Adding unit tests.** `bun test` still matches zero files repo-wide.
