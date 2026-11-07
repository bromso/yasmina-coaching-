# Skills & MCPs Tailoring Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Tailor Claude Code's installed skills to this monorepo's tech stack, refactor or remove redundant custom skills, install no-auth MCPs, and verify quality via skill-creator's eval pipeline.

**Architecture:** Six work phases. (1) Install 3 no-auth MCPs. (2) Delete 5 redundant `.md` skills (covered by installed plugins). (3) Refactor 2 `.md` skills into proper folder skills. (4) Write `repo-conventions` skill (foundational context for others). (5) Write 4 project-specific skills with full eval pipeline. (6) Run triggering-only evals on the lighter skills. Each skill ends in its own commit for readable history.

**Tech Stack:** Turborepo + Bun, Next.js 16, React 19, Apollo 4, Better Auth + Supabase, Biome, motion, GraphQL codegen. Skill-creator scripts at `.claude/skills/skill-creator/scripts/`.

**Design doc:** `docs/plans/2026-05-06-skills-and-mcps-tailoring-design.md`

---

## Conventions for This Plan

- All commands run from repo root: `/Users/jonasbroms/Sites/boilerplate`
- Skills live in `.claude/skills/<skill-name>/SKILL.md`
- The mirror at `.agents/skills/` is auto-managed by the skills tool — do NOT touch it manually
- Run `python3` for skill-creator scripts (not `python`)
- Validate every new skill: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/<skill-name>`
- Each skill creation/refactor ends in its own commit using conventional commits format

---

## Phase 0: Pre-flight

### Task 0.1: Verify clean working tree

**Step 1:** Check git status

Run: `git status --short`
Expected: empty output (or only `skills-lock.json` if previously modified)

**Step 2:** If anything else is modified, stash or commit before proceeding.

### Task 0.2: Verify skill-creator scripts run

**Step 1:** Quick-validate an existing skill as a smoke test

Run: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/skill-creator`
Expected: prints validation result, exit 0

**Step 2:** Confirm `claude` CLI is on PATH (used by `run_eval.py`)

Run: `which claude && claude --version`
Expected: a path and a version

**Step 3:** Confirm Python deps for skill-creator scripts

Run: `python3 -c "import yaml" && echo OK`
Expected: `OK`

If `yaml` is missing: `pip3 install pyyaml`

---

## Phase 1: Install no-auth MCPs

Each MCP is added via `claude mcp add` with project scope (`-s project`) so it lives in `.claude/settings.json` (or `.mcp.json`) and travels with the repo.

### Task 1.1: Install shadcn MCP

**Step 1:** Add MCP

Run:
```bash
claude mcp add -s project shadcn -- npx -y @shadcn/mcp@latest
```
Expected: `Added MCP server: shadcn` (or equivalent)

**Step 2:** Verify connection

Run: `claude mcp list`
Expected: `shadcn` shows as `✓ Connected`

**Step 3:** If install command fails, check the package name — current canonical command may be `bunx --bun shadcn@latest mcp` or `npx -y shadcn@latest registry:mcp`. Try those before declaring failure.

### Task 1.2: Install chrome-devtools MCP

**Step 1:** Add MCP

Run:
```bash
claude mcp add -s project chrome-devtools -- npx -y chrome-devtools-mcp@latest
```

**Step 2:** Verify

Run: `claude mcp list`
Expected: `chrome-devtools ✓ Connected`

### Task 1.3: Install deepwiki MCP

**Step 1:** Add MCP

Run:
```bash
claude mcp add -s project deepwiki --transport http -- https://mcp.deepwiki.com/mcp
```

**Step 2:** Verify

Run: `claude mcp list`
Expected: `deepwiki ✓ Connected`

### Task 1.4: Commit MCP changes

**Step 1:** Inspect what was changed

Run: `git status --short && git diff -- .mcp.json .claude/settings.json 2>/dev/null`
Expected: changes to `.mcp.json` or `.claude/settings.json` (whichever the CLI wrote to)

**Step 2:** Commit

```bash
git add .mcp.json .claude/settings.json 2>/dev/null
git commit -m "chore(mcp): add shadcn, chrome-devtools, deepwiki MCPs

No-auth MCPs that complement existing plugins:
- shadcn: registry access for component code
- chrome-devtools: real DevTools protocol for perf traces
- deepwiki: GitHub repo Q&A for fast-moving libs"
```

---

## Phase 2: Delete redundant `.md` skills

These five are fully covered by installed plugins.

### Task 2.1: Delete the 5 redundant files

**Step 1:** Delete

```bash
rm .claude/skills/a11y-audit.md
rm .claude/skills/add-animation.md
rm .claude/skills/frontend-design.md
rm .claude/skills/generate-form.md
rm .claude/skills/pr-review.md
```

**Step 2:** Verify no references in CLAUDE.md or other skills

Run: `grep -r "a11y-audit\|add-animation\|generate-form" .claude/ docs/ CLAUDE.md 2>/dev/null`
Expected: empty (or only the design doc and this plan)

**Step 3:** Commit

```bash
git add -u .claude/skills/
git commit -m "chore(skills): remove skills now covered by plugins

- a11y-audit: covered by accessibility-auditor plugin
- add-animation: covered by fixing-motion-performance plugin
- frontend-design: conflicts with superpowers:frontend-design
- generate-form: covered by react-hook-form-zod plugin
- pr-review: covered by pr-review-toolkit plugin"
```

---

## Phase 3: Refactor 2 `.md` skills into folder skills

### Task 3.1: Create `nextjs-route-handlers/` skill

**Step 1:** Create directory and SKILL.md

Create: `.claude/skills/nextjs-route-handlers/SKILL.md`

```markdown
---
name: nextjs-route-handlers
description: Create Next.js 16 App Router route handlers and next-safe-action server actions in this monorepo. Use when adding API endpoints (route.ts files), webhooks, server-side handlers, or type-safe server actions in apps/app or apps/www. Triggers on "API route", "endpoint", "webhook", "server action", "route handler", "GET handler", "POST handler", "next-safe-action".
---

# Next.js Route Handlers & Server Actions

Build route handlers and server actions for this monorepo's Next 16 apps.

## Project Context

- **apps/app** (port 3001): Has Apollo Client + GraphQL local resolvers. API routes here are rare — prefer GraphQL operations against local resolvers in `src/data/resolvers/`.
- **apps/www** (port 3000): Marketing site. Uses `next-safe-action` (already installed) for type-safe form submissions and server-side mutations.
- Both apps run Next.js 16 with App Router under `src/app/`.

## When to use Route Handlers vs. Server Actions vs. GraphQL Resolvers

| Need | Use |
|---|---|
| Webhook receiver | Route handler (`route.ts`) |
| Public REST API | Route handler |
| Form submission from www | `next-safe-action` server action |
| Internal data fetch in apps/app | GraphQL operation against local resolver |
| Internal mutation in apps/app | GraphQL mutation against local resolver |

## Route Handler Template (apps/www, apps/app)

Create at `apps/<app>/src/app/api/<endpoint>/route.ts`:

\`\`\`ts
import { NextResponse } from "next/server"
import { z } from "zod"

const schema = z.object({
  email: z.string().email(),
})

export async function POST(request: Request) {
  const body = await request.json()
  const parsed = schema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.format() }, { status: 400 })
  }

  // ... handler logic

  return NextResponse.json({ ok: true })
}
\`\`\`

Use Zod for input validation (already installed). Return `NextResponse.json` consistently.

## next-safe-action Server Action Template (apps/www)

Create action at `apps/www/src/lib/actions/<action-name>.ts`:

\`\`\`ts
"use server"

import { z } from "zod"
import { actionClient } from "@/lib/safe-action"

export const submitContactAction = actionClient
  .schema(z.object({
    email: z.string().email(),
    message: z.string().min(1),
  }))
  .action(async ({ parsedInput }) => {
    // ... server logic
    return { success: true }
  })
\`\`\`

If `apps/www/src/lib/safe-action.ts` doesn't exist, create it:

\`\`\`ts
import { createSafeActionClient } from "next-safe-action"

export const actionClient = createSafeActionClient()
\`\`\`

Wire to a form using react-hook-form + the `react-hook-form-zod` skill's patterns.

## Conventions

- Validate ALL input at the boundary with Zod — never trust unvalidated request bodies
- Return typed responses (`NextResponse.json` for handlers, action result for server actions)
- Place handlers under `src/app/api/<feature>/route.ts`
- Place server actions under `src/lib/actions/<action>.ts`
- Use Biome for formatting (no semicolons, double quotes, 100-char width)
- Never call route handlers from inside the same Next app — use the underlying function or a server action

## Common Pitfalls

- Don't add `"use client"` to a route handler file (it's server-only)
- Don't return raw `Response` when `NextResponse.json` works — keeps types consistent
- For webhooks: verify signatures BEFORE parsing the body (raw body, not JSON-parsed)
```

**Step 2:** Validate

Run: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/nextjs-route-handlers`
Expected: validation passes

**Step 3:** Delete old `.md`

Run: `rm .claude/skills/generate-api-route.md`

**Step 4:** Commit

```bash
git add .claude/skills/nextjs-route-handlers/ .claude/skills/generate-api-route.md
git commit -m "refactor(skills): replace generate-api-route with nextjs-route-handlers

Folder-based skill tailored to this monorepo:
- Distinguishes route handlers, server actions, and GraphQL resolvers
- Includes next-safe-action template for apps/www
- Notes that apps/app prefers Apollo + local resolvers over REST"
```

### Task 3.2: Create `monorepo-deps/` skill

**Step 1:** Create `.claude/skills/monorepo-deps/SKILL.md`

```markdown
---
name: monorepo-deps
description: Safely add, update, or audit dependencies in this Bun + Turborepo monorepo. Use when bumping package versions, adding new packages to a workspace, fixing peer dependency warnings, resolving lockfile conflicts, or running security audits. Triggers on "update deps", "bump packages", "add dependency", "outdated packages", "bun install", "lockfile", "security audit".
---

# Monorepo Dependency Management

Manage dependencies in this Bun-based Turborepo monorepo.

## Project Context

- **Package manager:** Bun 1.3.x (declared in root `package.json` as `"packageManager": "bun@1.3.4"`)
- **Workspaces:** `apps/*`, `packages/*`
- **Lockfile:** `bun.lock` at repo root (single lockfile for the whole monorepo)
- **Build orchestration:** Turborepo
- **Releases:** changesets (`bun changeset` to create one)
- **Pinned via root `overrides`:** `react`, `react-dom`, `react-hook-form`, `@hookform/resolvers`

## Adding a Dependency

To a specific workspace:
\`\`\`bash
bun add <pkg> --cwd apps/app          # runtime dep
bun add -d <pkg> --cwd apps/app       # dev dep
bun add <pkg> --cwd packages/ui
\`\`\`

To the root (rare — only for tooling that runs at repo level):
\`\`\`bash
bun add -d -D <pkg>
\`\`\`

After adding, run from root:
\`\`\`bash
bun install   # ensures lockfile and node_modules are coherent
\`\`\`

## Updating Dependencies

Check what's outdated:
\`\`\`bash
bun outdated                          # whole monorepo
bun outdated --filter @repo/app       # one workspace
\`\`\`

Update:
\`\`\`bash
bun update <pkg>                      # all workspaces using it
bun update --cwd apps/app <pkg>       # just one workspace
bun update --latest                   # major bumps too (caution)
\`\`\`

After any update:
1. `bun install`
2. `bun typecheck` (delegates to `turbo check-types`)
3. `bun lint`
4. `bun run build`
5. If runtime libs changed: `bun --filter @repo/app dev` and smoke-test
6. If breaking changes were necessary: add a changeset (`bun changeset`)

## React / RHF Pinning

Root `package.json` has:
\`\`\`json
"overrides": {
  "react": "^19.1.1",
  "react-dom": "^19.1.1",
  "react-hook-form": "^7.66.1",
  "@hookform/resolvers": "^5.2.2"
}
\`\`\`

Don't bump these in individual workspace `package.json` files — bump the override at root. Bun will hoist the version everywhere.

## Security Audits

\`\`\`bash
bun audit
\`\`\`

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
```

**Step 2:** Validate

Run: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/monorepo-deps`
Expected: validation passes

**Step 3:** Delete old `.md`

Run: `rm .claude/skills/update-deps.md`

**Step 4:** Commit

```bash
git add .claude/skills/monorepo-deps/ .claude/skills/update-deps.md
git commit -m "refactor(skills): replace update-deps with monorepo-deps

Bun + Turborepo + workspaces specific guidance:
- Workspace-scoped add/update commands
- React/RHF override pattern
- Lockfile conflict resolution
- Changeset integration"
```

---

## Phase 4: Write `repo-conventions` skill

This is foundational context other skills can reference. Triggering-only eval.

### Task 4.1: Draft SKILL.md

Create: `.claude/skills/repo-conventions/SKILL.md`

```markdown
---
name: repo-conventions
description: Core conventions for this Symbiora monorepo — Bun + Turborepo workspace layout, where to put new code, Biome (not ESLint), commit and changeset workflow, dev server commands. Use whenever working in this codebase, especially for first-time orientation, choosing where new files go, deciding between apps vs packages, running scripts, or debugging tooling. Triggers on "where should this go", "monorepo", "Turborepo", "Bun workspace", "Biome", "conventional commit", "changeset", "dev server", and most general repo navigation questions.
---

# Symbiora Monorepo Conventions

Quick reference for working in this repo.

## Layout

\`\`\`
apps/
├── app/      # Main dashboard (Next 16, port 3001) — Apollo + GraphQL local resolvers, Supabase, Better Auth
├── www/      # Marketing site (Next 16, port 3000) — MDX, next-safe-action
└── story/    # Storybook for packages/ui
packages/
├── ui/                  # Shared shadcn/ui + Radix + Base UI components
├── tokens/              # Design tokens
└── typescript-config/   # Shared tsconfig
\`\`\`

## Where Things Go

| New thing | Goes in |
|---|---|
| UI primitive used by 2+ apps | `packages/ui/src/components/` |
| App-specific component (forms, layouts) | `apps/<app>/src/components/` |
| GraphQL types/resolvers/mocks | `apps/app/src/data/{schema,resolvers,mock}/` |
| Dashboard route | `apps/app/src/app/(dashboard)/<route>/page.tsx` |
| Auth flow | `apps/app/src/app/(auth)/<route>/page.tsx` |
| Marketing page | `apps/www/src/app/<route>/page.tsx` (or `.mdx`) |
| Server action (apps/www) | `apps/www/src/lib/actions/<name>.ts` |
| Storybook story | `apps/story/src/stories/<component>.stories.tsx` |
| Auth config | `apps/app/src/lib/auth.ts` |

**Never** add shadcn components directly to an app — always to `packages/ui`:
\`\`\`bash
bunx --bun shadcn@latest add <component> -c packages/ui
\`\`\`

## Commands

Always Bun, never npm/pnpm/yarn.

\`\`\`bash
# Dev (one app)
bun --filter @repo/app dev    # :3001
bun --filter @repo/www dev    # :3000
bun --filter @repo/story dev  # Storybook

# Dev (everything)
bun dev

# Validate before committing / before claiming done
bun validate    # = format + lint + check + build

# Single steps
bun typecheck
bun lint
bun lint:fix
bun format:fix
bun run build
\`\`\`

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

\`\`\`bash
bun changeset            # create a changeset entry
bun changeset:version    # bump versions (CI usually runs this)
\`\`\`

Skip changesets for internal-only refactors and tooling changes.

## Authentication Stack

- `better-auth` with Drizzle ORM adapter (config: `apps/app/src/lib/auth.ts`)
- Local SQLite (`dev.db`) for dev
- Supabase SSR client (`@supabase/ssr`) also wired up
- Middleware: `apps/app/src/middleware.ts`

## Data Layer (apps/app)

- **No backend required for dev** — Apollo Client uses local-only resolvers
- Schema types: `apps/app/src/data/schema/typeDefs.ts`
- Resolvers: `apps/app/src/data/resolvers/`
- Mock data: `apps/app/src/data/mock/`
- When adding a new domain, update all THREE: schema, resolver, mock

## Code Style

- Components: PascalCase (`UserProfile.tsx`)
- Utilities: camelCase (`formatDate.ts`)
- Pages: lowercase-with-hyphens (`user-settings/page.tsx`)
- Type-only files: `*.types.ts` when separated
```

### Task 4.2: Validate

Run: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/repo-conventions`
Expected: validation passes

### Task 4.3: Write triggering eval set

Create: `.claude/skills/repo-conventions/evals.json`

```json
[
  {"query": "where should I put a new shared button component?", "should_trigger": true, "rationale": "monorepo layout question"},
  {"query": "how do I run just the dashboard app dev server?", "should_trigger": true, "rationale": "Bun workspace command"},
  {"query": "what's the lint command in this repo?", "should_trigger": true, "rationale": "tooling lookup"},
  {"query": "should I add a changeset for this refactor?", "should_trigger": true, "rationale": "changeset workflow"},
  {"query": "where are the GraphQL resolvers?", "should_trigger": true, "rationale": "data layer location"},
  {"query": "how do I make a conventional commit message?", "should_trigger": true, "rationale": "commit convention"},
  {"query": "what's a JavaScript closure?", "should_trigger": false, "rationale": "generic JS question, not repo-specific"},
  {"query": "explain async/await in TypeScript", "should_trigger": false, "rationale": "generic TS question"},
  {"query": "what does useEffect do?", "should_trigger": false, "rationale": "generic React"},
  {"query": "review my pull request", "should_trigger": false, "rationale": "should hit pr-review-toolkit, not this"}
]
```

### Task 4.4: Run trigger eval

**Step 1:** Run

Run:
```bash
python3 .claude/skills/skill-creator/scripts/run_eval.py \
  --skill .claude/skills/repo-conventions \
  --eval-set .claude/skills/repo-conventions/evals.json \
  --output .claude/skills/repo-conventions/eval-results.json
```
Expected: prints pass/fail counts; writes `eval-results.json`

**Step 2:** Read results

Run: `cat .claude/skills/repo-conventions/eval-results.json | python3 -m json.tool | head -60`

**Step 3:** Iterate description if pass rate < 80%

If failures, edit the `description:` line in SKILL.md and rerun. Aim for >= 90% pass rate (9/10).

### Task 4.5: Commit

```bash
git add .claude/skills/repo-conventions/
git commit -m "feat(skills): add repo-conventions skill

Foundational always-on context for this monorepo:
- Layout (apps/packages)
- Where new code goes
- Bun + Turborepo commands
- Biome conventions
- Commit + changeset workflow
- Auth and data-layer locations

Triggering eval: <pass-rate>/10"
```

(Replace `<pass-rate>` with actual result.)

---

## Phase 5: Write 4 full-eval skills

Each follows the same workflow. Skills, in order: `add-dashboard-route`, `add-ui-component`, `add-mdx-page`. (`nextjs-route-handlers` was created in Phase 3 — its eval happens in this phase too.)

### Workflow per skill (apply to each below)

For each skill `<name>`:

1. Draft `.claude/skills/<name>/SKILL.md` (template content provided per skill below)
2. Validate: `python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/<name>`
3. Write `.claude/skills/<name>/evals.json` with 7-10 prompts (5+ positive, 2+ negative, 1+ trick case)
4. Write `.claude/skills/<name>/output-assertions.md` describing what files SHOULD exist after a successful run
5. Run trigger eval: `python3 .claude/skills/skill-creator/scripts/run_eval.py --skill .claude/skills/<name> --eval-set .claude/skills/<name>/evals.json --output .claude/skills/<name>/eval-results.json`
6. Iterate description until >= 90% triggering pass rate
7. Run ONE qualitative output run via subagent (Agent tool, type `general-purpose`) with prompt: "Using only the skill at `.claude/skills/<name>`, do <example task>. Do NOT modify the repo — instead, list every file you would create/modify and the key contents." Read the agent's response against `output-assertions.md`.
8. If output assertions fail, iterate SKILL.md body (not just description), then rerun output run
9. Commit

### Task 5.1: `add-dashboard-route`

**Files:**
- Create: `.claude/skills/add-dashboard-route/SKILL.md`
- Create: `.claude/skills/add-dashboard-route/evals.json`
- Create: `.claude/skills/add-dashboard-route/output-assertions.md`

**SKILL.md content:**

```markdown
---
name: add-dashboard-route
description: Create a new dashboard route in apps/app with the full data wiring this repo expects — GraphQL types, local Apollo resolver, mock data, sidebar nav entry, and the page component. Use whenever the user asks to add a feature, page, or section to the main app's dashboard. Triggers on "add a dashboard page", "new route in apps/app", "new dashboard feature", "add a section to the app", "create a /<something> page", "add a settings page", "GraphQL-backed page".
---

# Add Dashboard Route

Create a new route in `apps/app/(dashboard)` wired with this repo's full data stack.

## Files Touched

For a new route `<name>` (e.g., `reports`):

1. **Page:** `apps/app/src/app/(dashboard)/<name>/page.tsx`
2. **Schema:** append to `apps/app/src/data/schema/typeDefs.ts`
3. **Resolver:** `apps/app/src/data/resolvers/<name>.ts` + register in `apps/app/src/data/resolvers/index.ts`
4. **Mock data:** `apps/app/src/data/mock/<name>.ts`
5. **Apollo query:** `apps/app/src/gql/queries/<name>.graphql` (or co-located with the page)
6. **Sidebar nav:** add entry to the sidebar config (find via `grep -r "sidebar" apps/app/src/`)
7. **Codegen:** run `bun --filter @repo/app codegen` to regenerate `apps/app/src/gql/__generated__/`

## Step-by-Step

1. **Decide the data shape** with the user (or infer from the request). Sketch fields.

2. **Add GraphQL types** — append to `typeDefs.ts`:

\`\`\`ts
// In apps/app/src/data/schema/typeDefs.ts
export const typeDefs = gql\`
  # ... existing types
  type Report {
    id: ID!
    title: String!
    createdAt: String!
  }
  extend type Query {
    reports: [Report!]!
  }
\`
\`\`\`

3. **Create mock data** at `apps/app/src/data/mock/<name>.ts`:

\`\`\`ts
import { faker } from "@faker-js/faker"

export const mockReports = Array.from({ length: 5 }, (_, i) => ({
  id: faker.string.uuid(),
  title: faker.lorem.sentence(),
  createdAt: faker.date.recent().toISOString(),
}))
\`\`\`

4. **Create resolver** at `apps/app/src/data/resolvers/<name>.ts`:

\`\`\`ts
import { mockReports } from "../mock/reports"

export const reportsResolvers = {
  Query: {
    reports: () => mockReports,
  },
}
\`\`\`

5. **Register resolver** in `apps/app/src/data/resolvers/index.ts`:

\`\`\`ts
import { reportsResolvers } from "./reports"
// merge into the resolvers map
\`\`\`

6. **Write the Apollo query** (in `.graphql` file or inline `gql\`...\``):

\`\`\`graphql
query GetReports {
  reports {
    id
    title
    createdAt
  }
}
\`\`\`

7. **Run codegen:** `bun --filter @repo/app codegen` — produces typed hooks in `apps/app/src/gql/__generated__/`.

8. **Create the page** at `apps/app/src/app/(dashboard)/<name>/page.tsx`:

\`\`\`tsx
"use client"

import { useGetReportsQuery } from "@/gql/__generated__/graphql"
import { Card } from "@repo/ui/components/card"

export default function ReportsPage() {
  const { data, loading } = useGetReportsQuery()

  if (loading) return <div>Loading…</div>

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Reports</h1>
      <div className="grid gap-3">
        {data?.reports.map((r) => (
          <Card key={r.id} className="p-4">{r.title}</Card>
        ))}
      </div>
    </div>
  )
}
\`\`\`

9. **Add to sidebar nav** — find the nav config (`grep -rn "sidebar" apps/app/src/components/`), add the entry with the route path and an icon (lucide-react is available via `@repo/ui`).

10. **Validate:**

\`\`\`bash
bun --filter @repo/app codegen   # regenerate types
bun --filter @repo/app dev        # smoke test
bun typecheck
bun lint
\`\`\`

## When NOT to use this skill

- Auth pages — use `(auth)` group, not `(dashboard)`
- Marketing pages — those go in `apps/www`, not `apps/app`
- Pages that don't need data — you can skip the GraphQL setup, but most dashboard pages do need it

## Cross-references

- For UI components: see `add-ui-component` skill
- For form pages: combine this skill with `react-hook-form-zod` skill
- For Apollo patterns: see `apollo-client` skill
- For shadcn primitives: see `shadcn` skill
```

**evals.json:**

```json
[
  {"query": "add a /reports page to the dashboard with mock data", "should_trigger": true, "rationale": "obvious case"},
  {"query": "I want a new section in the app for managing teams", "should_trigger": true, "rationale": "feature add in app"},
  {"query": "create a settings page in the dashboard", "should_trigger": true, "rationale": "dashboard route"},
  {"query": "build a /analytics route with charts", "should_trigger": true, "rationale": "dashboard with data"},
  {"query": "add a notifications page that lists recent alerts", "should_trigger": true, "rationale": "GraphQL-backed page"},
  {"query": "add a marketing page about pricing", "should_trigger": false, "rationale": "belongs in apps/www, not dashboard"},
  {"query": "create a sign-in page", "should_trigger": false, "rationale": "auth group, not dashboard"},
  {"query": "add a button component", "should_trigger": false, "rationale": "should hit add-ui-component"},
  {"query": "what is React?", "should_trigger": false, "rationale": "generic"},
  {"query": "build a UI component for displaying metrics", "should_trigger": false, "rationale": "component, not route"}
]
```

**output-assertions.md:**

```markdown
# add-dashboard-route output assertions

After running this skill on the prompt "add a /reports page to the dashboard with mock data", the following must be true:

- [ ] A new file exists at `apps/app/src/app/(dashboard)/reports/page.tsx`
- [ ] The page is a default export, named `ReportsPage` (or close), uses `"use client"` if calling a hook
- [ ] `apps/app/src/data/schema/typeDefs.ts` has been modified to add a `Report` type and a `reports` query
- [ ] A new file exists at `apps/app/src/data/resolvers/reports.ts` with a Query resolver
- [ ] `apps/app/src/data/resolvers/index.ts` has been modified to register the new resolver
- [ ] A new file exists at `apps/app/src/data/mock/reports.ts` using `@faker-js/faker`
- [ ] An Apollo query is defined (either as a `.graphql` file or inline `gql\`\`` template)
- [ ] The sidebar nav config has been updated with a new entry pointing to `/reports`
- [ ] The plan mentions running `bun --filter @repo/app codegen`
```

Now run the workflow steps 2-9 from the top of Phase 5.

### Task 5.2: `add-ui-component`

**Files:**
- Create: `.claude/skills/add-ui-component/SKILL.md`
- Create: `.claude/skills/add-ui-component/evals.json`
- Create: `.claude/skills/add-ui-component/output-assertions.md`

**SKILL.md content:**

```markdown
---
name: add-ui-component
description: Create a new component in packages/ui shared across all apps, plus a Storybook story in apps/story. Use whenever the user asks for a new UI primitive, atom, or component that should be reusable. Distinguishes from app-specific components (forms, layouts) which stay in apps/<app>/src/components/. Triggers on "add a component", "new UI primitive", "create a Button/Card/Modal", "add a shared component", "build a reusable widget".
---

# Add UI Component (packages/ui)

Create a shared component in `packages/ui` with a matching Storybook story.

## When to put a component in packages/ui vs. an app

Put it in **packages/ui** if:
- It's a primitive, atom, or generic widget (Button, Card, Tabs, Tooltip)
- More than one app could use it
- It's a thin wrapper around Radix / Base UI / Headless UI

Keep it in **apps/<app>/src/components/** if:
- It's bound to one app's data (a specific form, a dashboard-only layout)
- It imports from `@/data/...` or app-specific routes

## Workflow

### 1. Decide: shadcn-style or custom?

If a shadcn component fits, use the shadcn CLI:

\`\`\`bash
bunx --bun shadcn@latest add <component> -c packages/ui
\`\`\`

This drops the component into `packages/ui/src/components/<component>.tsx` already wired to this repo's setup. Then write a Storybook story (step 4 below).

For a custom component, continue with steps 2-4.

### 2. Create the component

File: `packages/ui/src/components/<component-name>.tsx`

\`\`\`tsx
import * as React from "react"
import { cn } from "@repo/ui/lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "outline"
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        variant === "default" && "bg-primary text-primary-foreground",
        variant === "outline" && "border border-input",
        className,
      )}
      {...props}
    />
  )
}
\`\`\`

Conventions:
- Always accept `className` and merge with `cn()`
- Always spread remaining props to the root element
- Use `React.forwardRef` for components that need ref forwarding
- For complex primitives, compose Radix or Base UI (already installed in `packages/ui`)
- Use `class-variance-authority` (`cva`) for components with multiple variants — pattern matches existing components

### 3. Export the component

Check `packages/ui/package.json` `exports` field. If components are exported individually (`@repo/ui/components/<name>`), the file you created at the canonical path is automatically importable. No re-export step needed.

### 4. Create Storybook story

File: `apps/story/src/stories/<component-name>.stories.tsx`

\`\`\`tsx
import type { Meta, StoryObj } from "@storybook/react"
import { Badge } from "@repo/ui/components/badge"

const meta: Meta<typeof Badge> = {
  title: "Components/Badge",
  component: Badge,
  tags: ["autodocs"],
  argTypes: {
    variant: {
      control: "select",
      options: ["default", "outline"],
    },
  },
}
export default meta
type Story = StoryObj<typeof Badge>

export const Default: Story = {
  args: { children: "Badge" },
}

export const Outline: Story = {
  args: { variant: "outline", children: "Outline" },
}
\`\`\`

### 5. Verify

\`\`\`bash
bun --filter @repo/story dev   # browse the story
bun typecheck
bun lint
\`\`\`

### 6. Use it

Import in any app:
\`\`\`tsx
import { Badge } from "@repo/ui/components/badge"
\`\`\`

## Common Pitfalls

- **Never** install shadcn components into an app — only into `packages/ui` (`-c packages/ui`)
- Don't add a Storybook story under `packages/ui` itself — stories live in `apps/story`
- Don't import from `@repo/ui/src/...` — only from the public `@repo/ui/components/<name>` path

## Cross-references

- shadcn primitives: see `shadcn` skill
- For composition patterns (compound components, render props): see `vercel-composition-patterns` skill
- For animations: see `fixing-motion-performance` skill
```

**evals.json:**

```json
[
  {"query": "add a Badge component to the shared UI package", "should_trigger": true, "rationale": "obvious case"},
  {"query": "create a reusable Modal component", "should_trigger": true, "rationale": "shared primitive"},
  {"query": "I need a Tooltip in the design system", "should_trigger": true, "rationale": "design system component"},
  {"query": "build a generic Card variant", "should_trigger": true, "rationale": "UI primitive"},
  {"query": "add a shadcn Switch component", "should_trigger": true, "rationale": "shadcn add into packages/ui"},
  {"query": "create a new dashboard page for /teams", "should_trigger": false, "rationale": "should hit add-dashboard-route"},
  {"query": "make a settings form for the user profile", "should_trigger": false, "rationale": "app-specific form, not shared component"},
  {"query": "what's the Tailwind utility for grid?", "should_trigger": false, "rationale": "generic CSS question"},
  {"query": "add an MDX marketing page", "should_trigger": false, "rationale": "should hit add-mdx-page"},
  {"query": "create a sidebar layout for apps/app", "should_trigger": false, "rationale": "app-specific layout"}
]
```

**output-assertions.md:**

```markdown
# add-ui-component output assertions

After running this skill on the prompt "add a Badge component to the shared UI package", the following must be true:

- [ ] New file at `packages/ui/src/components/badge.tsx` (lowercase filename)
- [ ] Component named `Badge` (PascalCase)
- [ ] Accepts `className` prop and merges with `cn()` from `@repo/ui/lib/utils`
- [ ] Spreads remaining props
- [ ] If multiple variants, uses `cva` from `class-variance-authority`
- [ ] New Storybook story at `apps/story/src/stories/badge.stories.tsx` with at least 2 stories
- [ ] Story imports from `@repo/ui/components/badge`
- [ ] Story has `tags: ["autodocs"]`
- [ ] No new file created under `apps/app/src/components/` (this is the wrong place)
- [ ] Plan does NOT suggest running shadcn CLI without `-c packages/ui`
```

Then run workflow steps 2-9.

### Task 5.3: `add-mdx-page`

**Files:**
- Create: `.claude/skills/add-mdx-page/SKILL.md`
- Create: `.claude/skills/add-mdx-page/evals.json`
- Create: `.claude/skills/add-mdx-page/output-assertions.md`

**SKILL.md content:**

```markdown
---
name: add-mdx-page
description: Create an MDX-powered marketing or content page in apps/www. Use when adding pricing, about, features, blog, or other content-driven pages that benefit from MDX (mix of markdown and React components). Triggers on "add an MDX page", "marketing page", "pricing page", "about page", "create a content page", "blog post", "landing page".
---

# Add MDX Page (apps/www)

Create an MDX page in the marketing site. apps/www is wired with `@next/mdx` and `@mdx-js/react`.

## File Layout

For a route `/<slug>`:

- Either: `apps/www/src/app/<slug>/page.mdx` (file-based MDX, simplest)
- Or: `apps/www/src/app/<slug>/page.tsx` that imports content from `apps/www/src/content/<slug>.mdx`

Prefer the first form unless the page needs significant TSX scaffolding.

## Workflow

### 1. Create the page

For `/about`:

File: `apps/www/src/app/about/page.mdx`

\`\`\`mdx
export const metadata = {
  title: "About — Symbiora",
  description: "Our mission and team.",
}

# About Symbiora

We build software that…

<Feature title="Mission">
  Solving X for Y.
</Feature>

## Team

- Jonas Bröms — Founder
- …
\`\`\`

### 2. Custom MDX components

If you need custom components inside MDX (`<Feature>`, `<CallToAction>`, etc.):

File: `apps/www/mdx-components.tsx` (root of `apps/www/src/`)

\`\`\`tsx
import type { MDXComponents } from "mdx/types"
import { Card } from "@repo/ui/components/card"

export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    ...components,
    Feature: ({ title, children }) => (
      <Card className="p-4">
        <h3 className="font-semibold">{title}</h3>
        <div>{children}</div>
      </Card>
    ),
    h1: ({ children }) => <h1 className="text-4xl font-bold">{children}</h1>,
  }
}
\`\`\`

If `mdx-components.tsx` already exists, extend it rather than overwriting.

### 3. Verify

\`\`\`bash
bun --filter @repo/www dev    # visit http://localhost:3000/<slug>
bun typecheck
bun lint
\`\`\`

### 4. SEO

Always export `metadata` from the MDX file with `title` and `description`. Next 16's metadata API picks it up automatically.

## When NOT to use this skill

- Dashboard pages — use `add-dashboard-route` (apps/app, not apps/www)
- Highly interactive pages with lots of state — use a `.tsx` page instead of `.mdx`
- API routes — use `nextjs-route-handlers`

## Cross-references

- For shared content components: see `add-ui-component` skill
- For animations on the page: see `fixing-motion-performance` skill
```

**evals.json:**

```json
[
  {"query": "add a pricing page to the marketing site", "should_trigger": true, "rationale": "marketing MDX page"},
  {"query": "create an about page in apps/www", "should_trigger": true, "rationale": "explicit www MDX"},
  {"query": "build a features landing page with content sections", "should_trigger": true, "rationale": "content-driven page"},
  {"query": "add a /blog/launch-announcement post", "should_trigger": true, "rationale": "MDX blog post"},
  {"query": "make a marketing page about our team", "should_trigger": true, "rationale": "marketing content"},
  {"query": "add a dashboard page for invoices", "should_trigger": false, "rationale": "should hit add-dashboard-route"},
  {"query": "create a Button component", "should_trigger": false, "rationale": "should hit add-ui-component"},
  {"query": "what's MDX?", "should_trigger": false, "rationale": "generic question, not a build request"},
  {"query": "add an API route for newsletter signup", "should_trigger": false, "rationale": "should hit nextjs-route-handlers"},
  {"query": "fix Biome errors in www", "should_trigger": false, "rationale": "tooling, not a new page"}
]
```

**output-assertions.md:**

```markdown
# add-mdx-page output assertions

After running this skill on the prompt "add a /pricing page to the marketing site", the following must be true:

- [ ] New file at `apps/www/src/app/pricing/page.mdx` (or `apps/www/src/app/pricing/page.tsx` + content file)
- [ ] File exports a `metadata` object with `title` and `description`
- [ ] If custom MDX components are introduced, `apps/www/mdx-components.tsx` (or wherever it lives) is extended, not replaced
- [ ] No new file created under `apps/app/` (wrong app)
- [ ] Plan mentions running `bun --filter @repo/www dev` to verify
```

Then run workflow steps 2-9.

### Task 5.4: Run trigger eval for `nextjs-route-handlers` (created in Phase 3)

**Step 1:** Create eval set

Create: `.claude/skills/nextjs-route-handlers/evals.json`

```json
[
  {"query": "add a /api/webhook endpoint for Stripe", "should_trigger": true, "rationale": "webhook route handler"},
  {"query": "create a server action for the contact form", "should_trigger": true, "rationale": "next-safe-action"},
  {"query": "add a POST handler at /api/contact", "should_trigger": true, "rationale": "explicit route handler"},
  {"query": "build a route.ts that returns user data", "should_trigger": true, "rationale": "route handler"},
  {"query": "create a type-safe form action with next-safe-action", "should_trigger": true, "rationale": "explicit lib mention"},
  {"query": "add a dashboard page for orders", "should_trigger": false, "rationale": "should hit add-dashboard-route"},
  {"query": "create a Button component", "should_trigger": false, "rationale": "should hit add-ui-component"},
  {"query": "make a marketing pricing page", "should_trigger": false, "rationale": "should hit add-mdx-page"},
  {"query": "what is REST?", "should_trigger": false, "rationale": "generic"},
  {"query": "add a GraphQL resolver for products", "should_trigger": false, "rationale": "GraphQL resolver, different skill space"}
]
```

**Step 2:** Create output-assertions.md

Create: `.claude/skills/nextjs-route-handlers/output-assertions.md`

```markdown
# nextjs-route-handlers output assertions

For prompt "add a POST handler at /api/contact in apps/www that validates email":

- [ ] New file at `apps/www/src/app/api/contact/route.ts`
- [ ] Exports `async function POST(request: Request)`
- [ ] Validates input with Zod (`z.object({...}).safeParse(...)`)
- [ ] Returns `NextResponse.json(...)`
- [ ] On validation failure, returns 400 status

For prompt "create a server action with next-safe-action for newsletter signup":

- [ ] New file at `apps/www/src/lib/actions/newsletter.ts` (or similar)
- [ ] File starts with `"use server"`
- [ ] Uses `actionClient.schema(...).action(...)` pattern
- [ ] If `apps/www/src/lib/safe-action.ts` doesn't exist, it's created
- [ ] Action's `parsedInput` is used (not raw input)
```

**Step 3:** Run workflow steps 5-9 (run trigger eval, iterate, run output run, commit).

---

## Phase 6: Triggering eval for `monorepo-deps`

### Task 6.1: Create eval set for `monorepo-deps`

Create: `.claude/skills/monorepo-deps/evals.json`

```json
[
  {"query": "update React to the latest version", "should_trigger": true, "rationale": "dep update"},
  {"query": "add date-fns to apps/app", "should_trigger": true, "rationale": "add dep to workspace"},
  {"query": "I have a lockfile conflict in bun.lock", "should_trigger": true, "rationale": "lockfile resolution"},
  {"query": "what's outdated in the monorepo?", "should_trigger": true, "rationale": "outdated check"},
  {"query": "do I need a changeset for this dep bump?", "should_trigger": true, "rationale": "changeset workflow"},
  {"query": "run a security audit on dependencies", "should_trigger": true, "rationale": "audit"},
  {"query": "add a Button component", "should_trigger": false, "rationale": "component skill"},
  {"query": "create a dashboard page", "should_trigger": false, "rationale": "route skill"},
  {"query": "what is package.json", "should_trigger": false, "rationale": "generic"},
  {"query": "fix a TypeScript error in my code", "should_trigger": false, "rationale": "code, not deps"}
]
```

### Task 6.2: Run eval

Run:
```bash
python3 .claude/skills/skill-creator/scripts/run_eval.py \
  --skill .claude/skills/monorepo-deps \
  --eval-set .claude/skills/monorepo-deps/evals.json \
  --output .claude/skills/monorepo-deps/eval-results.json
```

### Task 6.3: Iterate description if pass rate < 90%

### Task 6.4: Commit eval artifacts

```bash
git add .claude/skills/monorepo-deps/evals.json .claude/skills/monorepo-deps/eval-results.json
git commit -m "test(skills): add triggering eval for monorepo-deps"
```

(`nextjs-route-handlers` eval artifacts get their own commit at the end of Phase 5.)

---

## Phase 7: Final cleanup

### Task 7.1: Validate every custom skill

Run:
```bash
for d in .claude/skills/*/; do
  python3 .claude/skills/skill-creator/scripts/quick_validate.py "$d" || echo "FAIL: $d"
done
```
Expected: every skill validates

### Task 7.2: Final summary commit

If `skills-lock.json` was modified during the process and shouldn't be (because we wrote new local skills, not installed plugin ones), revert it:

Run: `git checkout skills-lock.json`

(If we did legitimately install new plugin skills, leave it.)

### Task 7.3: Run full repo validation

Run: `bun lint && bun typecheck`
Expected: both pass

(No build needed since no source code changed — only `.claude/` configs.)

### Task 7.4: Push & summarize

Run: `git log --oneline main..HEAD`
Expected: a clean series of commits, one per skill or per logical change.

Optional: open a PR via `gh pr create` if working on a branch.

---

## Skill Cross-Reference Sanity Check

After all skills are written, verify there are no orphaned references:

Run:
```bash
grep -rn "see.*skill" .claude/skills/*/SKILL.md
```

Expected: every "see X skill" reference points to a skill that exists.

---

## Done Criteria

- [ ] 3 no-auth MCPs installed and connected
- [ ] 5 redundant `.md` skills deleted
- [ ] `nextjs-route-handlers/` and `monorepo-deps/` exist as folder skills (old `.md` versions removed)
- [ ] `repo-conventions/`, `add-dashboard-route/`, `add-ui-component/`, `add-mdx-page/` exist
- [ ] Every new skill validates (`quick_validate.py` passes)
- [ ] Triggering eval pass rate >= 90% for: `repo-conventions`, `monorepo-deps`, all 4 full-eval skills
- [ ] Output assertions verified for the 4 full-eval skills (one qualitative run each)
- [ ] One commit per skill (clean history)
- [ ] `bun lint && bun typecheck` pass
