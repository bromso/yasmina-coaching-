# Close the sharp advisory on the production image path

**Date:** 2026-08-03
**Status:** Approved, ready for implementation planning

## Summary

One advisory still sits on a production request path. `next@16.2.12` declares
`sharp: "^0.34.5"` as an **optionalDependency**, and a `0.x` caret cannot reach the fixed `0.35.x`.
So even after the previous project raised this repo's own `sharp` floor to `^0.35.3`, the copy Next
bundles internally is still `0.34.5` — and that is the copy that runs.

Force `sharp` to `^0.35.3` through the root `overrides` block, and add a check that proves Next's
image optimizer still works, because nothing in this repository currently exercises it.

**The override is one line. The check is the deliverable.**

## Why this one matters more than the other 55

`GHSA-f88m-g3jw-g9cj` is a set of inherited libvips CVEs in **image decoding**. The code path is
`/_next/image`, which fetches and transcodes image data at request time.

Evidence that it ships:

- `apps/app/next.config.mjs:16` and `apps/www/next.config.ts:10` both set `output: "standalone"`.
- Both standalone bundles contain the vulnerable copy:
  `apps/app/.next/standalone/node_modules/.bun/sharp@0.34.5/` and
  `apps/www/.next/standalone/node_modules/.bun/sharp@0.34.5/`.
  `apps/www` does not declare `sharp` at all — its copy arrives purely as Next's nested optional
  dependency.
- `apps/app` configures `images.remotePatterns` for `images.unsplash.com` and `images.pexels.com`,
  so it decodes **remote, attacker-influenced** binary input.

The previous project's PR initially described `next` as "the only one of the three that executes in
production at runtime", which implied this leftover was harmless build tooling. That was wrong and
was corrected before merge. This project closes it.

## The override

Add to the root `overrides`:

```json
"sharp": "^0.35.3"
```

**The mechanism is already proven in this repository.** The existing block forces `react`,
`react-dom` and `react-hook-form`, and each resolves to exactly one version in `bun.lock` with no
nested copies surviving. There is no reason to expect `sharp` to behave differently.

There is no upstream fix to wait for: `16.2.12` is the latest `next` and still declares
`sharp: ^0.34.5`.

## Why forcing an untested combination is defensible here

Overriding a dependency means running a combination the parent never tested. That is a real risk and
the reason the previous project deliberately left it alone. Two things make it acceptable now:

**The API surface is tiny and stable.** `next/dist/server/image-optimizer.js` uses only
`sharp.concurrency`, `.resize()`, `.rotate()`, `.toBuffer()`, `.jpeg()`, `.png()`, `.webp()` and
`.avif()`. All are core sharp APIs unchanged across 0.34→0.35. The engine floors are compatible too —
`sharp@0.35.3` requires `node >=20.9.0`, which `next@16.2.12` already requires.

**Failure is loud, not silent.** `getSharp()` wraps `require('sharp')` in a `try` and **throws** on
failure — either `Module \`sharp\` not found` or the original error. Next does not fall back to
serving the unoptimized original. A broken sharp therefore produces a 500 on `/_next/image`, which a
check can catch.

## The check

Nothing in this repository exercises image optimization. `bun run build` never issues a request, and
the 1228 Storybook tests do not run Next at all. That gap is why this advisory survived unexamined,
so closing it without adding a check would repeat the mistake.

Add `scripts/check-image-optimizer.ts`, following the existing `scripts/doctor.ts` convention, run
from a root script and wired into CI's `verify` job **after** the Build step, which produces the
output it needs.

It must:

1. Start `apps/www` with `next start` on a fixed, unusual port.
2. Wait for readiness rather than sleeping a fixed interval.
3. Request `/_next/image?url=%2Fog-image.jpg&w=640&q=75` with an `Accept: image/webp` header.
4. Assert **HTTP 200**, `content-type: image/webp`, a body beginning with the `RIFF`/`WEBP` magic
   bytes, and a body smaller than the 119,470-byte source.
5. Shut the server down on every exit path, including assertion failure.

`apps/www/public/og-image.jpg` is a real 1800×945 baseline JPEG. Requesting it at `w=640` as WebP is
unambiguously a transform.

**The content-type assertion is the load-bearing one.** A JPEG returning as WebP can only happen if
sharp decoded and re-encoded it. Status alone would be too weak; body-size alone could pass on a
truncated response.

`apps/www` is the target because it holds the raster test images. One app suffices: the optimizer is
Next's own code and both apps resolve the same sharp.

## Measuring against a moving target

`bun audit` queries a live advisory database, and it moves. Between the previous project's
verification and this one's baseline — a single day, with a **byte-identical** lockfile — the total
went from 53 to 56 because `ajv`, `fast-uri`, `js-yaml`, `lodash` and `rollup` gained advisories.

So this spec does **not** name a target total. The binding checks are relative:

- `sharp` must be **absent** from `bun audit` output entirely.
- The total must fall by exactly the number of advisories `sharp` carried in the baseline measured
  at implementation time — 1 as of this writing.
- No severity band may be larger than that same baseline.

Record the baseline immediately before the change rather than inheriting any figure from this
document.

## Verification

1. `bun audit 2>&1 | grep -cE "^sharp\s+[<>=]"` returns `0`.
2. `bun.lock` resolves exactly one `sharp` version, `0.35.3`. No `0.34.5` remains anywhere.
3. No severity band exceeds the baseline captured before the change.
4. `bun run build` — exit 0.
5. The new check passes locally.
6. **The check actually fails when sharp is broken.** Prove it once, by temporarily pointing the
   override at a version Next cannot use or otherwise breaking the resolution, confirming the check
   reports failure, then reverting. A check never observed failing is not yet evidence of anything.
7. `bun --filter @repo/story test --run` — `299 passed | 6 skipped (305)`, `1228 passed (1228)`.
8. `bunx biome ci . --max-diagnostics=none --colors=off` — no `Found N errors.` line. Note
   `grep -E "^Found"` does **not** prove this, since `Found N warnings.` also matches; use
   `grep -E "^Found [0-9]+ errors"`.
9. `bun run typecheck` and `bun run typecheck:ui` — exit 0.
10. `bun run ci` — exit 0.
11. CI green, with the new step running after Build in the `verify` job.

## Risks

**The override forces a combination Next never tested.** Mitigated by the narrow API surface and by
the check, but not eliminated. If Next later widens its sharp usage, the override could break
something the check does not cover.

**The check adds a server boot to CI.** Roughly 30 seconds. If it proves flaky — port contention or
readiness races — the correct response is to fix the readiness detection, not to add a retry that
masks a real failure.

**`next start` requires a prior build.** The CI step must come after Build, and the script should
fail with a clear message rather than a confusing crash if the build output is missing.

## Out of scope

- **The 3 critical `@repo/story` Vitest advisories.** Dev-only, and in the tooling that runs the
  suite this project relies on for evidence.
- **`mathjs` 14→15 and `style-dictionary` 4→5.** Major bumps on code that never ships.
- **The transitive-only advisories** — `brace-expansion`, `minimatch`, `picomatch`, `qs`, `tmp`,
  `ws`, `yaml`, plus the newly appeared `ajv`, `fast-uri`, `js-yaml`, `lodash` and `rollup`. Each
  would need its own justification for an override.
- **The stale nested `postcss@8.5.6`.** It is lockfile inertia rather than a range constraint —
  `8.5.25` satisfies both `@tailwindcss/postcss`'s `^8.4.41` and `vite`'s `^8.5.3` — so a plain
  dedupe would clear it. Worth doing, but it will not change the audit, because `next` pins
  `postcss` to an exact `8.4.31` regardless.
- **Adding unit tests.** `bun test` still matches zero files repo-wide. The check added here is an
  integration probe, not a test suite.
- **Deleting the four merged remote branches**, and `packages/typescript-config/nextjs.json`, which
  has zero consumers.
