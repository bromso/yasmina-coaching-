# Frontend Boilerplate Cleanup — Design

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation plan

## Goal

Strip the repo to a clean frontend boilerplate organized around five layers: **tokens → components → blocks → views → pages**. Remove all backend/data plumbing (GraphQL, Apollo, Supabase, codegen) and all brand-specific copy. Fold in the four open items from the previous PR (catalog gaps, zod drift, Storybook build error, stale skills).

The intent is a clean slate to build the frontend on. Backend/data layer can be added later, fresh, when needed.

## Architecture

Five layers, strict one-way import direction:

```
page.tsx → view → block → component → token
```

| Layer | Lives in | Purpose |
|---|---|---|
| Tokens | `packages/tokens` | Design tokens (colors, spacing, type) |
| Components | `packages/ui/src/components/` | Primitives (Button, Card, Tabs) |
| Blocks | `packages/ui/src/blocks/` | Reusable section patterns (hero, features, footer) |
| Views | `apps/<app>/src/views/` | App-specific page-level compositions |
| Pages | `apps/<app>/src/app/.../page.tsx` | Thin Next.js routes that render a view |

Views may NOT be imported by blocks. Blocks may NOT be imported by components. The direction is one-way.

## Apps After Cleanup

- **apps/www** — minimal public site shell: `layout.tsx`, `page.tsx`, `404`, `robots.ts`, `sitemap.ts`, PWA assets. No subroutes.
- **apps/app** — minimal application shell: `layout.tsx`, `page.tsx`, PWA assets, `api/health/route.ts`. No `(auth)`, `(dashboard)`, `(errors)`, no `auth/callback`.
- **apps/story** — Storybook for `packages/ui` (components AND blocks), build fixed.

## What Gets Deleted

### Brand-monitor / Symbiora / kitchensink-react references
Sed-style replace with neutral boilerplate language across:
- All `package.json` `description` and `keywords` fields
- `README.md`, `CLAUDE.md`, `apps/*/CHANGELOG.md`
- `apps/www/src/app/{layout.tsx,robots.ts,sitemap.ts}`
- `apps/*/src/app/api/health/route.ts` strings
- Any other text content uncovered by the final sweep

### `apps/app` (full backend purge)
- `src/data/` — entire tree (queries, resolvers, schema, mock, hooks, services, config)
- `src/gql/` — gql.ts, index.ts
- `codegen.yml`
- `src/lib/{apollo-client,apollo-provider,graphql-server,supabase,supabase-server,cookie-domain}.{ts,tsx}`
- `src/middleware.ts` (Supabase-coupled)
- `src/hooks/use-current-user.ts`
- `src/app/{(auth),(dashboard),(errors),auth}/`
- `src/components/auth-tabs.tsx`
- Apollo provider mention in `src/app/providers.tsx`
- `codegen` and `codegen:watch` scripts in `package.json`

### `apps/www` (brand-flavored content)
- `src/components/blocks/` — all 10 brand-specific blocks
- `src/app/{about,contact,faq,pricing,login}/` — all subroutes
- `src/app/llms.txt/route.ts`
- `src/content/brand-monitor.ts`

### Dependencies
- `apps/app`: `@apollo/client`, `graphql`, `@graphql-typed-document-node/core`, `@graphql-codegen/cli`, `@graphql-codegen/client-preset`, `@supabase/ssr`, `@supabase/supabase-js`, `dotenv`, `@faker-js/faker`
- `apps/www`: `next-safe-action`, `@mdx-js/loader`, `@mdx-js/react`, `@next/mdx`, `@types/mdx`
- Root: `@faker-js/faker`

### Claude Code config
- `.claude/commands/codegen.md` (slash command — irrelevant)
- `.claude/commands/db-migrate.md` (no DB)
- `.claude/skills/add-dashboard-route/` — premise (GraphQL/Apollo/mocks/sidebar) is gone

### `.env.example`
- Commented `DATABASE_URL` block
- `NEXT_PUBLIC_COOKIE_DOMAIN`
- Anything Supabase-related

## What Gets Added

### New directories
- `packages/ui/src/blocks/` with a brief README documenting the block convention. Seed: a generic `Hero` block as an example.
- `apps/www/src/views/` with a brief README. Seed: `home-view.tsx`.
- `apps/app/src/views/` with a brief README. Seed: `home-view.tsx`.

### New / replaced pages
- `apps/www/src/app/page.tsx` — replaces existing; imports `HomeView`. View renders a generic "Frontend boilerplate" landing.
- `apps/app/src/app/page.tsx` — new (root route currently doesn't exist; routing went straight to `(dashboard)`); imports `HomeView`. Renders an "App shell" landing pointing to where to add real routes.

## Catalog Updates (folded-in fixes)

### Add `@iconify/react`
Dependabot PR #1 already aligned all workspaces to `^6.0.x`. Add to root catalog at `^6.0.0`; switch all 4 workspaces to `"catalog:"`.

### Align `zod` on v4 and add to catalog
Current drift: `app ^3.23.8`, `www ^3.24.0`, `ui ^3.25.76`, `story ^4.1.13`.
Plan:
- Drop `zod` from `apps/www` entirely (only use was in deleted `next-safe-action` flow)
- Drop `zod` from `apps/app` entirely (only use was in deleted login form)
- Bump `packages/ui` zod from `^3.x` to `^4.x` (fix call sites if zod 4 API differs)
- Add `zod: "^4.0.0"` (or appropriate pin) to root catalog
- Switch `packages/ui` and `apps/story` to `"catalog:"`

### Skill content updates
- `repo-conventions` SKILL.md — rewrite "Authentication Stack" and "Data Layer" sections to reflect frontend-only scope
- `nextjs-route-handlers` SKILL.md — drop the `apps/app` GraphQL-resolver-preference text
- `monorepo-deps` SKILL.md — minor updates if needed
- `add-dashboard-route` skill folder — delete entirely

## Storybook Babel Parse Error

Pre-existing failure during `bun --filter @repo/story build`. Investigation:
1. Run with verbose output to identify the file
2. Likely in `packages/ui` — probably a heavy/experimental component (`Waves.tsx`, `Threads.tsx`, R3F demos)
3. Fix the file OR temporarily exclude from Storybook scan with a clear note

Cap investigation at ~1 hour. If unsolvable cleanly, document as known issue and ship the rest of the PR.

## CLAUDE.md Refresh

- Remove "Authentication" section entirely (no auth)
- Remove "State Management" section (no Apollo)
- Remove "App Routing" section (no auth/dashboard/errors/quiz route groups)
- Replace with a "Frontend Architecture" section documenting the five layers and import direction
- Update "Common Tasks" — remove "Adding a New Dashboard Feature", "Updating Authentication"
- Add "Adding a New Block", "Adding a New View", "Adding a New Page" sections

## .env.example

Shrinks to a stub or minimum (e.g., just `NEXT_PUBLIC_API_URL` placeholder for whoever adds an API later, or removed entirely).

## Execution Order

1. Brand-monitor sweep
2. Backend purge (GraphQL/Apollo separate commit from Supabase/auth, separate from data dir)
3. Brand-flavored content delete
4. Architecture scaffolding (blocks dir, views dirs, seeds, homepages)
5. Catalog updates (@iconify, zod 4)
6. Storybook fix
7. Skill content updates
8. Doc & config cleanup (CLAUDE.md, .env.example, slash commands)
9. Verification (typecheck + build all 3 apps; greps for residual brand strings)
10. Push + PR

## Risks

- `packages/ui` may import deleted modules → caught in Phase 9 verification, fixed inline
- Storybook babel error may have deeper cause → 1-hour investigation cap; defer with note if not solved
- Residual brand strings → final grep sweep catches escapees
- The remaining homepage will look bare — intentional; clean slate

## Out of Scope (Future Work)

- Re-adding GraphQL / Supabase / auth (when needed, fresh)
- Creating `apps/auth`, `apps/docs`, `apps/help`
- Vercel multi-project deployment
- Choosing a final brand name (kept generic for now)
- Adding more blocks to the seed library (one example is enough)

## Validation

After implementation:
- `bun install --frozen-lockfile` clean
- `bun --filter @repo/www build` succeeds
- `bun --filter @repo/app build` succeeds (no more `@/gql/graphql` blocker)
- `bun --filter @repo/story build` succeeds (or documented residual issue)
- `grep -ri "brand[ _-]monitor\|kitchensink\|symbiora" apps packages CLAUDE.md README.md` returns nothing
- Five-layer structure visible: `packages/{tokens,ui/src/components,ui/src/blocks}` and `apps/<app>/src/views/`
- Each app's homepage renders, both subdomains (`www.localhost`, `app.localhost`) load
