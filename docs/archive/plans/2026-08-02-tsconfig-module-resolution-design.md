# Fix module resolution in the shared React library tsconfig

**Date:** 2026-08-02
**Status:** Approved, ready for implementation planning

## Summary

`packages/typescript-config/react-library.json` inherits `moduleResolution: "NodeNext"` from
`base.json`, but both of its consumers — `apps/story` and `packages/ui` — are reached through
bundlers: Vite for Storybook, and Next.js for `apps/app` and `apps/www`, which import
`packages/ui`. Switching that config to `module: "ESNext"` / `moduleResolution: "Bundler"` removes
**109 type errors** without touching a line of application code.

This is the first of several independent projects addressing the repo's accumulated debt. It was
sequenced first because it is small, fully measurable, and shrinks the problem before any decision
is made about the rest.

## Correction to the original framing

The work was requested as *"the 103 TS2305 'module has no exported member' are the ones most likely
to be real broken imports."* That was wrong, and the error came from an earlier summary of mine.

**101 of the 103 `TS2305` errors are a single package: `ogl`.** The remaining two are
`@react-three/postprocessing`. None of them is a broken import.

`ogl@1.0.11` ships type definitions and declares them correctly:

```json
"types": "./types/index.d.ts",
"exports": { ".": { "types": "./types/index.d.ts", "default": "./src/index.js" } }
```

Its `types/index.d.ts` re-exports everything the components use:

```ts
export * from './core/Program';
export * from './core/Renderer';
export * from './core/Mesh';
```

Those relative specifiers have **no file extensions**. Under `moduleResolution: "NodeNext"`,
TypeScript applies ESM resolution rules and requires explicit extensions, so every re-export fails
and the module presents as having no exports. Hence 101 identical "has no exported member" errors
against a package whose types are fine.

## Measured evidence

Both figures come from running `tsc` on `apps/story`, changing only the resolution flags:

```
bunx tsc --noEmit                                            → 986 errors
bunx tsc --noEmit --module esnext --moduleResolution bundler → 877 errors
```

The change is not purely subtractive. Per error code:

| | Codes | Net |
|---|---|---|
| **Removed** | `TS2305` 103→0, `TS7006` 19→9, `TS2307` 4→2, `TS2590` 7→5, `TS2724` 3→0, `TS2835` 1→0 | −121 |
| **Surfaced** | `TS2532` +4, `TS2322` +3, `TS2339` +3, `TS2345` +1, `TS2578` +1 | +12 |
| **Total** | 986 → 877 | **−109** |

The 12 newly surfaced errors are a good sign, not a regression. When a module resolves to "no
exports," everything imported from it is implicitly `any`, which suppresses downstream type errors.
Once `ogl`'s types resolve, TypeScript can finally see real mismatches. `TS2578` is the clearest
tell: an `@ts-expect-error` directive that becomes unnecessary — a comment that was asserting
something untrue.

## Design

### 1. The change

`packages/typescript-config/react-library.json` becomes:

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

Both options are required together: TypeScript rejects `moduleResolution: "Bundler"` unless `module`
is `ESNext`, `Preserve`, or another ES-flavoured value. These match what
`packages/typescript-config/nextjs.json` already declares, so the repo converges on one convention
instead of gaining a third.

`base.json` is deliberately left alone. It is the Node-oriented default and remains correct for any
future package that genuinely runs under Node resolution.

### 2. Blast radius: exactly two consumers

| Config | Extends | Affected |
|---|---|---|
| `apps/story/tsconfig.json` | `@repo/typescript-config/react-library.json` | **yes** |
| `packages/ui/tsconfig.json` | `@repo/typescript-config/react-library.json` | **yes** |
| `apps/app/tsconfig.json` | *(standalone)* — already `module: esnext`, `moduleResolution: bundler` | no |
| `apps/www/tsconfig.json` | *(standalone)* — already `module: esnext`, `moduleResolution: bundler` | no |

Nothing emits from the two affected configs, though not because either sets `noEmit` — neither does,
and both inherit `declaration: true` from `base.json`. It is simpler than that: nothing runs `tsc` as
a build step. `apps/story` invokes it only via its `typecheck` script, which passes `--noEmit` on the
command line, and `packages/ui` has no build script at all (`"scripts": {}`). The change is
typecheck-only and cannot alter any shipped artifact.

### 3. Changeset

Add a **patch** changeset naming `@repo/typescript-config`.

Do not name `@repo/mono` — that is the workspace root, which `@manypkg/get-packages` returns as
`rootPackage` rather than a member, and `changeset version` fails on it. `@repo/typescript-config`
sits in the `fixed` group in `.changeset/config.json`, so the patch propagates across that group.

## Verification

### An honest limitation

**No CI check will detect this change.** The root `typecheck` script is
`bun run --filter @repo/app --filter @repo/www typecheck` — both unaffected. `packages/ui` has no
`typecheck` script at all. The improvement is visible only through
`bun run --filter @repo/story typecheck`, which is deliberately excluded from CI because it is red
with 877 remaining errors.

This makes the change very low-risk, since no gate depends on it — and equally means nothing guards
it against silent reversion. Adding `@repo/story` to CI's typecheck is not viable until those 877
errors are addressed, which is a separate project.

### Checks

| Check | Expected |
|---|---|
| `bun run --filter @repo/story typecheck` error count | **exactly 877** (was 986) |
| `TS2305` occurrences in that output | **0** (was 103) |
| `bun run typecheck` (root: app + www) | exit 0, unchanged |
| `bun run build` | exit 0 |
| `bun --filter @repo/story test --run` | exit 0, `299 passed \| 6 skipped (305)`, `1228 passed`, no `Errors` line |
| `bunx biome lint . --max-diagnostics=none` | `Found 65 errors.` / `Found 412 warnings.`, unchanged |
| `.changeset/*.md` | one new patch entry naming `@repo/typescript-config` |

The exact figure **877** is the gate, not "fewer errors". A higher count means the change introduced
problems; a lower count means it masked something. Either way the measured prediction would be
wrong and worth understanding before proceeding.

Always pass `--max-diagnostics=none` to Biome. Its default cap of 20 silently truncates the count.

## Branching

Branch `fix/tsconfig-module-resolution` from `main`. Nothing is stacked this time — `main` currently
contains all merged work, so there is no parent branch to depend on.

## Out of scope

- **The 877 remaining type errors**, including the 12 newly surfaced by this change. They are
  concentrated in vendored WebGL components — `gravity-stars` (73), `ImageTrail` (71),
  `MetallicPaint` (40), `Ballpit` (36), `SplashCursor` (32), `MetaBalls` (32) — and the real
  question there is fix-versus-exclude, not grinding through them. Its own project.
- **The 65 lint errors / 412 warnings.** Same vendored files, different tool. Its own project.
- **Enabling a11y enforcement.** `parameters.a11y.test` is unset so checks run in warning mode, and
  `tags: ["a11y-test"]` in `preview.tsx` is dead config from Storybook 8.5. Its own project.
- **Adding a unit test suite.** `bun test` matches zero files repo-wide; only 11 lib/hooks files
  exist to cover. Its own project.
- Adding a `typecheck` script to `packages/ui`, or adding `@repo/story` to CI's typecheck. Both
  would be immediately red against the 877.
- Changing `base.json`, or the standalone configs in `apps/app` and `apps/www`.
