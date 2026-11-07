---
name: monorepo-deps
description: MUST USE for ANY request involving npm/bun packages, dependencies, versions, lockfiles, or security audits in this Bun workspaces monorepo. Use when adding, removing, updating, bumping, upgrading, or downgrading any package or library (React, date-fns, lodash, etc.) in any workspace (apps/app, apps/www, packages/ui, etc.), checking what's outdated, running security audits, fixing peer dependency warnings, resolving lockfile (bun.lock) merge conflicts, or deciding whether a dep change needs a changeset. Trigger phrases — "update React", "bump packages", "upgrade to latest", "add date-fns", "add a dependency to apps/app", "what's outdated", "outdated packages in the monorepo", "lockfile conflict", "merge conflict in bun.lock", "security audit", "bun audit", "do I need a changeset for this dep bump", "peer dependency warning", "bun install".
---

# Monorepo Dependency Management

Manage dependencies in this Bun workspaces monorepo.

## Project Context

- **Package manager:** Bun 1.4.x (declared in root `package.json` as `"packageManager": "bun@1.4.2"`)
- **Workspaces:** `apps/*`, `packages/*`
- **Lockfile:** `bun.lock` at repo root (single lockfile for the whole monorepo)
- **Build orchestration:** Bun workspaces (`bun run --filter`)
- **Releases:** changesets (`bun changeset` to create one)
- **Shared versions:** the root `package.json` `catalog`; workspaces reference them as `"catalog:"`
- **Root `overrides`:** only `react` / `react-dom` (forces transitive React-18 consumers up to 19)
- **The rules** (full text in CLAUDE.md → "Dependency Versioning"):
  1. Needed by 2+ workspaces, or part of a lockstep family (`@orpc/*`, `ai` / `@ai-sdk/*`) →
     catalog entry + `"catalog:"` everywhere. Never a literal range for a catalogued package.
  2. Binary-only tooling run from scripts (`typescript`, `@biomejs/biome`) → root
     `devDependencies` only. Anything a workspace's own files import or name → declared in that
     workspace via `catalog:` (no phantom dependencies).
  3. Used by exactly one workspace → a literal range in that workspace.

## Adding a Dependency

Workspace-specific (rule 3):

```bash
bun add <pkg> --cwd apps/app          # runtime dep
bun add -d <pkg> --cwd apps/app       # dev dep
```

Shared (rule 1) — add the version to the root `catalog`, then reference it:

```jsonc
// root package.json
"catalog": { "<pkg>": "^1.2.3" }
// each workspace that uses it
"dependencies": { "<pkg>": "catalog:" }
```

Check `npm view <pkg> version` for the current release first. To the root `devDependencies`
(rare — only binary tooling that runs at repo level):

```bash
bun add -D <pkg>
```

After adding, run from root:

```bash
bun install   # ensures lockfile and node_modules are coherent
```

## Updating Dependencies

Check what's outdated:

```bash
bun outdated                          # whole monorepo
bun outdated --filter @repo/app       # one workspace
```

Update:

```bash
bun update <pkg>                      # all workspaces using it
bun update --cwd apps/app <pkg>       # just one workspace
bun update --latest                   # major bumps too (caution)
```

For a catalogued package, bump the version in the root `catalog` and run `bun install` — never edit
a workspace's `"catalog:"` reference into a literal range.

After any update:
1. `bun install`
2. `bun run ci` — Biome, typechecks (app, www, api, api-contract, ai, ai-contract, ui), service
   tests and the full build
3. If a Dockerfile or the install layout could be affected: build one image, e.g.
   `docker build -f docker/next.Dockerfile --build-arg APP=www --build-arg PORT=3000 .`
4. If runtime libs changed: `bun --filter @repo/app dev` and smoke-test
5. If breaking changes were necessary: add a changeset (`bun changeset`)

## React Pinning

Root `package.json` `overrides` holds only `react` / `react-dom`, to force transitive React-18
consumers up to 19. Their versions live in the `catalog` too — bump both together. Don't add other
packages to `overrides`: it silently wins over the catalog and the two drift apart.

## Security Audits

```bash
bun audit
```

For high/critical advisories, prefer upgrading to the patched version. If no patch exists, document the rationale in the changeset.

## Lockfile Conflicts

When `bun.lock` conflicts on a merge:

1. Don't edit it by hand
2. Take the incoming version: `git checkout --theirs bun.lock` (or `--ours`)
3. `bun install`
4. Commit the regenerated lockfile

## Common Pitfalls

- Don't run `npm install` or `pnpm install` — only `bun install`
- Don't edit `bun.lock` manually
- Don't add a changeset for internal-only changes (e.g., bumping a dev tool nobody depends on)
- After major bumps, ALWAYS run the full `bun validate` before declaring done
