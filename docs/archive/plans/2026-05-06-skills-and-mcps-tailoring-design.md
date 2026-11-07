# Tailoring Claude Code Skills & MCPs to This Stack

**Date:** 2026-05-06
**Status:** Design approved, ready for implementation plan

## Goal

Tailor Claude Code's installed skills and MCPs to this monorepo's actual tech stack so that:
- Skills trigger reliably for this project's workflows
- Skill output matches this repo's conventions (Bun, Biome, Turborepo, this monorepo's structure)
- Redundant or conflicting guidance is removed
- Useful MCPs that aren't already covered by the Docker gateway are installed

## Current State

**Stack:** Turborepo + Bun + Next.js 16 + React 19 + Biome + TypeScript 5.7

**Apps:** `app` (Apollo 4, GraphQL local-only resolvers, Supabase, motion, dnd-kit, recharts, tanstack-table), `www` (MDX, Radix, motion, next-safe-action), `story` (Storybook).

> Note: `apps/legal` and `apps/docs` are referenced in `CLAUDE.md` but do not exist on disk. Flagged separately — out of scope for this work.

**Packages:** `ui` (shadcn + Radix + Base UI + GSAP + R3F + Embla + Lenis), `tokens`, `typescript-config`.

**Tooling:** Husky, lint-staged, commitlint (conventional + commitizen), changesets, GraphQL codegen, Better Auth.

**Currently installed plugin skills (11):** apollo-client, better-auth-best-practices, fixing-motion-performance, graphql-operations, graphql-schema, postgres-drizzle, react-hook-form-zod, shadcn, skill-creator, vercel-composition-patterns, vercel-react-best-practices.

**Existing custom `.md` skills (7):** a11y-audit, add-animation, frontend-design, generate-api-route, generate-form, pr-review, update-deps.

**Existing agents (8) + slash commands (17).**

**MCPs connected:** Google Drive, Figma, Gmail, Google Calendar (unauth), MCP_DOCKER (gateway with 200+ tools), figma-console.

## Design

### 1. Audit existing custom `.md` skills

Disposition for each:

| Skill | Action | Reason |
|---|---|---|
| `a11y-audit.md` | Delete | Covered by `accessibility-auditor` plugin |
| `add-animation.md` | Delete | Covered by `fixing-motion-performance` plugin |
| `frontend-design.md` | Delete | Conflicts with `superpowers:frontend-design` |
| `generate-api-route.md` | Refactor → `nextjs-route-handlers/` | Next 16 + `next-safe-action` not in any plugin |
| `generate-form.md` | Delete | Covered by `react-hook-form-zod` plugin |
| `pr-review.md` | Delete | Covered by `pr-review-toolkit` plugin |
| `update-deps.md` | Refactor → `monorepo-deps/` | Bun + Turborepo workspace specifics not in any plugin |

Net: 5 deletes, 2 refactors into proper folder skills.

### 2. New project-specific skills

Six new skills covering gaps not addressed by installed plugins:

| Skill | Purpose | Eval tier |
|---|---|---|
| `repo-conventions` | Always-on context: monorepo layout, Bun commands, Biome (not ESLint), Turborepo filters, where new code goes, conventional commits, Husky hooks | Triggering only |
| `add-dashboard-route` | New route in `apps/app/(dashboard)`: route+layout, GraphQL types in `data/schema/typeDefs.ts`, resolver, mock data, Apollo query, sidebar nav entry | **Full eval** |
| `add-ui-component` | Component in `packages/ui/src/components/` using shadcn + Radix/Base UI patterns + matching Storybook story in `apps/story` | **Full eval** |
| `nextjs-route-handlers` | Next 16 route handlers + `next-safe-action` server actions for `apps/www`. Refactor of `generate-api-route.md` | **Full eval** |
| `add-mdx-page` | MDX page in `apps/www` with frontmatter (covers Fumadocs patterns if `legal`/`docs` apps return) | **Full eval** |
| `monorepo-deps` | Safe Bun dependency updates with workspace patterns, changesets, lockfile handling. Refactor of `update-deps.md` | Triggering only |

**Skipped (already covered by existing infra):** commit-flow (`/commit` slash command + `git-commit-push` agent), changeset (`/changeset` slash command), storybook-creation (`storybook-creator` agent + `/new-story` command).

### 3. MCP installs

**Install (no auth):**
- **shadcn MCP** — registry access for component code, pairs with `shadcn` skill
- **chrome-devtools MCP** — real DevTools protocol for performance traces, pairs with `fixing-motion-performance`
- **deepwiki MCP** — GitHub repo Q&A for fast-moving libs (Apollo 4, Better Auth, Drizzle, Next 16)

**List only (need credentials, configs prepped but not installed):**
- Supabase MCP, Sentry MCP, Linear/Notion MCP, Vercel MCP, Context7 MCP

**Skip (already in MCP_DOCKER gateway):** GitHub, Stripe, Postman, browser tools, HuggingFace, geo tools.

### 4. Eval plan

**Full-eval skills** (`add-dashboard-route`, `add-ui-component`, `nextjs-route-handlers`, `add-mdx-page`):
1. 5-7 test prompts per skill: obvious case, edge cases, trigger-validation, false-positive
2. Run via `skill-creator/eval-viewer/generate_review.py` in background
3. Quantitative assertions per skill (e.g., "creates file in `(dashboard)/`", "updates `typeDefs.ts`")
4. Iterate skill body based on failures
5. One round of description optimization for triggering accuracy

**Triggering-only evals** (`repo-conventions`, `monorepo-deps`): 10 prompts each, verify description fires when intended and stays silent when not.

**Cost cap option:** Run evals serially rather than parallel if subagent token spend is a concern.

## Execution Order

1. Install 3 no-auth MCPs (shadcn, chrome-devtools, deepwiki)
2. Delete 5 redundant `.md` skills
3. Refactor `generate-api-route.md` → `nextjs-route-handlers/`
4. Refactor `update-deps.md` → `monorepo-deps/`
5. Write `repo-conventions` (referenced by other skills)
6. Write the 4 full-eval skills, each through its iteration loop
7. Run triggering evals on `repo-conventions` + `monorepo-deps`
8. One commit per skill (readable history)

## Out of Scope

- Fixing `CLAUDE.md` references to non-existent `apps/legal` and `apps/docs` (flag separately)
- Credentialed MCP installs (Supabase, Sentry, Linear, Vercel, Context7) — configs prepped only
- New agents or slash commands
- Changes to `.agents/skills/` (those mirror `.claude/skills/`)
