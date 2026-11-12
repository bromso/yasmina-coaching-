---
name: repo-conventions
description: MUST USE before answering ANY question about THIS repo (boilerplate-bun — a Bun workspaces monorepo with nine Next.js apps and two Bun services). Read this FIRST whenever the user mentions "this repo", "this monorepo", "this codebase", "the app shell", "the marketing app", "the API", "the AI service", or asks "where should I put", "where is", "where are", "how do I run", "what's the X command", "should I add a changeset", or about file locations, dev servers, lint, build, commits, or package layout. Trigger examples — "where should I put a new shared button component", "where do blocks go", "where do views go", "how do I run the marketing site dev server", "what's the lint command in this repo", "should I add a changeset for this refactor", "how do I make a conventional commit". Read this BEFORE shadcn, biome-linting, or commit skills, because only this skill knows this repo's specific paths and scripts.
---

# boilerplate-bun Conventions

Quick reference for working in this repo.

## Layout

```
apps/
├── www/      # Marketing site      (Next 16, :3000 — www.brand.localhost)
├── app/      # Application shell   (Next 16, :3001 — app.brand.localhost)
├── auth/     # Auth screens        (Next 16, :3002 — auth.brand.localhost)
├── account/  # Account settings    (Next 16, :3003 — account.brand.localhost)
├── docs/     # Docs shell          (Next 16, :3004 — docs.brand.localhost)
├── help/     # Help / support      (Next 16, :3005 — help.brand.localhost)
├── jobs/     # Jobs shell          (Next 16, :3006 — jobs.brand.localhost)
├── api/      # Bun service: Bun.serve + oRPC + Bun.sql   (:3007 — api.brand.localhost)
├── ai/       # Bun service: AI SDK chat + structured out (:3008 — ai.brand.localhost)
└── story/    # Storybook for packages/ui (:6006)
packages/
├── ui/                  # Shared shadcn/ui + Radix + Base UI components, blocks, charts
├── tokens/              # Design tokens
├── api-contract/        # oRPC contract for apps/api (clients import ApiClient)
├── ai-contract/         # oRPC contract + ChatMessage for apps/ai (clients import AiClient)
└── typescript-config/   # Shared tsconfig presets (base, nextjs, react-library, bun)
```

## Frontend Architecture

Five layers, one-way import direction:

```
tokens → components → blocks → views → pages
```

- **tokens** (`packages/tokens/`): design tokens
- **components** (`packages/ui/src/components/`): low-level primitives (Button, Card, Input)
- **blocks** (`packages/ui/src/blocks/`): reusable section patterns (Hero, FeatureGrid, Footer) — content-agnostic, take props
- **views** (`apps/<app>/src/views/`): page-level compositions specific to one app
- **pages** (`apps/<app>/src/app/.../page.tsx`): thin wrappers — import a view, render it

A block may import components but NOT views or pages. A view may import blocks/components but is never imported by them.

The Next apps are frontend-only. Server-side work lives in the Bun services (`apps/api`,
`apps/ai`); frontends call them only through `@repo/api-contract` / `@repo/ai-contract` and never
import another app. Real user auth is still deferred.

## Where Things Go

| New thing | Goes in |
|---|---|
| UI primitive used by 2+ apps | `packages/ui/src/components/` |
| Block (shared section pattern) | `packages/ui/src/blocks/` |
| View (page-level composition) | `apps/<app>/src/views/` |
| App-specific layout component | `apps/<app>/src/components/` |
| Marketing page | `apps/www/src/app/<route>/page.tsx` (renders a view) |
| App page | `apps/app/src/app/<route>/page.tsx` (renders a view) |
| Storybook story | `apps/story/stories/<Component>.stories.tsx` |
| Typed API endpoint | `packages/api-contract` (contract) → `apps/api/src/router.ts` (handler) → test |
| AI tool / AI endpoint | `packages/ai-contract` (`chatTools` / contract) → `apps/ai/src/tools/` or `src/router.ts` |
| Shared dependency | root `package.json` `catalog`, referenced as `"catalog:"` |

**Never** add shadcn components directly to an app — always to `packages/ui`:

```bash
bunx --bun shadcn@latest add <component> -c packages/ui
```

## Commands

Always Bun, never npm/pnpm/yarn.

```bash
# Dev (one app — any workspace name from the layout above)
bun --filter @repo/app dev    # :3001
bun --filter @repo/api dev    # :3007
bun --filter @repo/story dev  # Storybook :6006

# Dev (everything)
bun dev

# Validate before committing / before claiming done
bun run validate   # = biome check + typechecks + @repo/ui typecheck + service tests + build
bun run ci         # same checks with `biome ci` (what CI runs)

# Single steps
bun run typecheck
bun run test:services   # bun test for apps/api + apps/ai
bun lint
bun lint:fix
bun format:fix
bun run build
```

## Linting & Formatting

- **Biome** (not ESLint, not Prettier)
- Config: `biome.json` at root
- Rules: double quotes, no semicolons (ASI), 2-space indent, 100-char width
- A pre-commit hook runs `biome check --write` on edited files via Husky + lint-staged
- An EditHook runs `biome check --write` after every Edit/Write tool call

## Commits

- Conventional Commits enforced by commitlint
- Use `bun commit` for an interactive commitizen prompt, OR write conventional commit messages by hand:
  - `feat(scope): summary`
  - `fix(scope): summary`
  - `refactor(scope): summary`
  - `chore(scope): summary`
  - `docs(scope): summary`
- Husky's commit-msg hook validates the format

## Changesets

Use changesets when shipping a user-facing change to a versioned package:

```bash
bun changeset            # create a changeset entry
bun changeset:version    # bump versions (CI usually runs this)
```

Skip changesets for internal-only refactors and tooling changes.

## Code Style

- Components: PascalCase (`UserProfile.tsx`)
- Blocks: kebab-case (`hero.tsx`, `feature-grid.tsx`) with PascalCase exports
- Views: kebab-case (`home-view.tsx`) with PascalCase exports (`HomeView`)
- Utilities: camelCase (`formatDate.ts`)
- Pages: lowercase-with-hyphens (`user-settings/page.tsx`)
- Type-only files: `*.types.ts` when separated
