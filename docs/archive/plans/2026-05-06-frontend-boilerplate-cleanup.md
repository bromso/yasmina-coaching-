# Frontend Boilerplate Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Strip the repo to a clean frontend-only boilerplate organized around five layers (tokens → components → blocks → views → pages), removing all backend/data plumbing and brand-specific copy.

**Architecture:** Hybrid layout — shared blocks in `packages/ui/src/blocks/`, app-specific views in `apps/<app>/src/views/`, thin pages that compose views. One-way import direction enforced by convention. Backend/auth re-introduced fresh later when needed.

**Tech Stack:** Bun 1.3.13 + Turborepo + Next.js 16 + React 19 + Biome + Serwist (PWA, already wired). Removing: Apollo Client 4, GraphQL codegen, `@supabase/ssr`, `@supabase/supabase-js`, `next-safe-action`, MDX, `@faker-js/faker`.

**Design doc:** `docs/plans/2026-05-06-frontend-boilerplate-cleanup-design.md`

---

## Conventions

- Working dir: `/Users/jonasbroms/Sites/boilerplate`
- Branch: `feat/frontend-boilerplate` (already created off main)
- Pre-existing untouched items (leave alone, never stage): `skills-lock.json` modification, `.agents/skills/skill-creator/`, `.claude/skills/skill-creator`
- Commit per logical chunk in conventional-commit format
- After each Phase, do a quick sanity grep to make sure nothing was missed

---

## Phase 0: Pre-flight

### Task 0.1: Verify branch and tree state

Run:
```bash
git branch --show-current
git status --short
```

Expected:
- Branch: `feat/frontend-boilerplate`
- Status: only the 3 pre-existing items

If anything else is dirty, STOP and investigate.

---

## Phase 1: Backend Purge

This phase deletes all GraphQL/Apollo/Supabase code and the data layer. After this phase, `apps/app` builds will fail until Phase 4 wires up new homepages — that's expected.

### Task 1.1: Delete the data layer + GraphQL surface in `apps/app`

**Files to delete:**
- `apps/app/src/data/` (entire directory)
- `apps/app/src/gql/` (entire directory)
- `apps/app/codegen.yml`
- `apps/app/src/lib/apollo-client.ts`
- `apps/app/src/lib/apollo-provider.tsx`
- `apps/app/src/lib/graphql-server.ts`

**Step 1:** Delete

```bash
cd /Users/jonasbroms/Sites/boilerplate
rm -rf apps/app/src/data
rm -rf apps/app/src/gql
rm apps/app/codegen.yml
rm apps/app/src/lib/apollo-client.ts
rm apps/app/src/lib/apollo-provider.tsx
rm apps/app/src/lib/graphql-server.ts
```

**Step 2:** Remove `ApolloProvider` from `apps/app/src/app/providers.tsx`. Edit to remove the import and the wrapper. The result should still wrap children in `ThemeProvider` + `SearchProvider`.

Read the file first, then edit. The relevant changes:
- Remove `import { ApolloProvider } from "@/lib/apollo-provider"`
- Replace `<ApolloProvider>...</ApolloProvider>` wrapping with just `...`

**Step 3:** Commit

```bash
git add -A apps/app
git commit -m "chore(app): remove GraphQL/Apollo data layer

Deletes:
- src/data/ (queries, resolvers, schema, mock, hooks, services, config)
- src/gql/
- codegen.yml
- lib/apollo-client.ts, apollo-provider.tsx, graphql-server.ts
- ApolloProvider wrapper in providers.tsx

Backend will be re-added fresh later if needed."
```

### Task 1.2: Delete Supabase auth surface in `apps/app`

**Files to delete:**
- `apps/app/src/lib/supabase.ts`
- `apps/app/src/lib/supabase-server.ts`
- `apps/app/src/lib/cookie-domain.ts` (added in PR #4 — auth-related, gone too)
- `apps/app/src/middleware.ts` (Supabase-coupled)
- `apps/app/src/hooks/use-current-user.ts`
- `apps/app/src/components/auth-tabs.tsx`
- `apps/app/src/app/auth/` (entire directory — Supabase callback)
- `apps/app/src/app/(auth)/` (entire directory — login/signup/reset)

**Step 1:** Delete

```bash
rm apps/app/src/lib/supabase.ts apps/app/src/lib/supabase-server.ts apps/app/src/lib/cookie-domain.ts
rm apps/app/src/middleware.ts
rm apps/app/src/hooks/use-current-user.ts
rm apps/app/src/components/auth-tabs.tsx
rm -rf apps/app/src/app/auth
rm -rf "apps/app/src/app/(auth)"
```

**Step 2:** Sanity grep — any remaining imports referring to deleted paths?

```bash
grep -rn "from.*\(supabase\|cookie-domain\|use-current-user\|auth-tabs\|/auth/callback\)" apps/app/src 2>/dev/null
```

Expected: empty. If anything pops, fix the importer (it's a stale reference now).

**Step 3:** Commit

```bash
git add -A apps/app
git commit -m "chore(app): remove Supabase auth and related routes

Deletes:
- lib/supabase.ts, supabase-server.ts, cookie-domain.ts
- src/middleware.ts (Supabase-coupled)
- src/hooks/use-current-user.ts
- components/auth-tabs.tsx
- app/auth/ (Supabase callback)
- app/(auth)/ (login/signup/reset routes)

Auth will be re-added fresh later (potentially separate auth.brand.com app)."
```

### Task 1.3: Delete the (dashboard) and (errors) route groups in `apps/app`

**Files to delete:**
- `apps/app/src/app/(dashboard)/` (entire directory — campaigns, compliance, rules, tasks, users, settings, test-graphql)
- `apps/app/src/app/(errors)/` (entire directory — 401, 403, 404, 503, error)

(Errors group goes too — Next.js handles 404/error via `not-found.tsx` and `error.tsx` at the root if needed. Keep the boilerplate minimal.)

**Step 1:** Delete

```bash
rm -rf "apps/app/src/app/(dashboard)"
rm -rf "apps/app/src/app/(errors)"
```

**Step 2:** Inspect what's left in `apps/app/src/app/`

```bash
find apps/app/src/app -mindepth 1 -maxdepth 2 -type d
ls apps/app/src/app/*.{tsx,ts,css} 2>/dev/null
```

Expected: just `api/health/`, `offline/`, `manifest.ts`, `sw.ts`, `layout.tsx`, `globals.css`, `providers.tsx`, `robots.ts`, `favicon.ico`. NO `page.tsx` yet — Phase 4 adds it.

**Step 3:** Commit

```bash
git add -A apps/app
git commit -m "chore(app): remove dashboard and errors route groups

(dashboard)/* is gone — wholesale replacement, not a migration.
(errors)/* is gone — Next.js' built-in not-found.tsx / error.tsx
will be added at the root if needed."
```

### Task 1.4: Remove backend deps from `apps/app/package.json`

**Files:**
- Modify: `apps/app/package.json`

**Step 1:** Open `apps/app/package.json`. Remove these entries from `dependencies` (keep all others):
- `@apollo/client`
- `@supabase/ssr`
- `@supabase/supabase-js`
- `graphql`

Remove from `devDependencies`:
- `@graphql-codegen/cli`
- `@graphql-codegen/client-preset`
- `@graphql-typed-document-node/core`
- `dotenv`
- `@faker-js/faker`

Remove from `scripts`:
- `codegen`
- `codegen:watch`

**Step 2:** Run `bun install` from repo root

```bash
cd /Users/jonasbroms/Sites/boilerplate
bun install
```

Expected: succeeds. Lockfile updates.

**Step 3:** Commit

```bash
git add apps/app/package.json bun.lock
git commit -m "chore(app): drop backend deps and codegen scripts

Removed: @apollo/client, @supabase/{ssr,supabase-js}, graphql,
@graphql-codegen/*, dotenv, @faker-js/faker.
Removed scripts: codegen, codegen:watch."
```

---

## Phase 2: Brand-flavored Content Delete (apps/www)

### Task 2.1: Delete brand-specific blocks and pages in `apps/www`

**Files/dirs to delete:**
- `apps/www/src/components/blocks/` (entire directory — hero, features, faq, footer, navbar, benefits, differentiators, why-it-matters, use-cases, ideal-customer)
- `apps/www/src/app/about/`
- `apps/www/src/app/contact/`
- `apps/www/src/app/faq/`
- `apps/www/src/app/pricing/`
- `apps/www/src/app/login/`
- `apps/www/src/app/llms.txt/`
- `apps/www/src/content/brand-monitor.ts`
- `apps/www/src/components/json-ld.tsx` (used by deleted pages with brand-specific schema-dts content; verify imports first — if used by layout only, keep but rewrite to be generic)
- `apps/www/src/components/styleglide-provider.tsx` (only referenced by layout; brand-specific)

Verify the json-ld and styleglide-provider files first:

```bash
grep -rln "from.*json-ld\|from.*styleglide-provider" apps/www/src/
```

If only `layout.tsx` imports them (and we'll rewrite the layout in Phase 4), delete them.

**Step 1:** Delete

```bash
cd /Users/jonasbroms/Sites/boilerplate
rm -rf apps/www/src/components/blocks
rm -rf apps/www/src/app/about apps/www/src/app/contact apps/www/src/app/faq apps/www/src/app/pricing apps/www/src/app/login apps/www/src/app/llms.txt
rm -f apps/www/src/content/brand-monitor.ts
rmdir apps/www/src/content 2>/dev/null || true
rm -f apps/www/src/components/json-ld.tsx apps/www/src/components/styleglide-provider.tsx
```

**Step 2:** Sanity grep

```bash
grep -rln "components/blocks\|content/brand-monitor\|content/kitchensink-react\|json-ld\|styleglide-provider" apps/www/src/ 2>/dev/null
```

Imports will be in `apps/www/src/app/page.tsx`, `layout.tsx`, possibly `sitemap.ts`/`robots.ts`. Those files will be rewritten in Phase 4 — leave them temporarily broken; we'll fix in Phase 4.

**Step 3:** Commit

```bash
git add -A apps/www
git commit -m "chore(www): delete brand-flavored blocks, pages, and content

Deletes:
- components/blocks/ (10 brand-specific section components)
- app/{about,contact,faq,pricing,login}/ (brand subroutes)
- app/llms.txt/ (brand-specific LLMs route)
- content/brand-monitor.ts
- json-ld.tsx, styleglide-provider.tsx (only used by deleted pages)

apps/www/src/app/page.tsx and layout.tsx will be rewritten in Phase 4."
```

### Task 2.2: Remove www's now-unused deps

**Files:**
- Modify: `apps/www/package.json`

**Step 1:** Remove from `dependencies`:
- `@mdx-js/loader`, `@mdx-js/react`, `@next/mdx`, `@types/mdx` (no MDX pages remain)
- `next-safe-action` (was used in deleted login flow)
- `schema-dts` (only used by deleted json-ld.tsx)
- `@hookform/resolvers`, `react-hook-form`, `zod` (only used by deleted login form — Phase 5 zod alignment)

Verify before removing each — search for usage:

```bash
for pkg in @mdx-js/loader @mdx-js/react @next/mdx schema-dts next-safe-action; do
  echo "=== $pkg ==="
  grep -rln "$pkg" apps/www/src/ 2>/dev/null
done
```

If a package shows results, leave it for now and flag in the commit message. Otherwise remove.

For `react-hook-form` / `@hookform/resolvers` / `zod` in www: these will be handled in Phase 5 (zod alignment). For now, remove them from www if no surviving file uses them.

**Step 2:** Also remove from `next.config.ts` any `withMDX` wrapping. Read the file, delete the `import createMDX from "@next/mdx"` line and the `withMDX` wrapping. The chain `withBundleAnalyzer(withSerwist(withMDX(nextConfig)))` becomes `withBundleAnalyzer(withSerwist(nextConfig))`.

Also remove `pageExtensions: ["js", "jsx", "mdx", "ts", "tsx"]` (the `mdx` extension), or leave the array but drop `mdx`. Cleanest: remove the line entirely (Next 16 default extensions are fine).

**Step 3:** Run `bun install`

```bash
bun install
```

**Step 4:** Commit

```bash
git add apps/www/package.json apps/www/next.config.ts bun.lock
git commit -m "chore(www): drop MDX, schema-dts, next-safe-action, form deps

These were tied to deleted blocks and pages.
zod will be unified across the monorepo in a later step."
```

---

## Phase 3: Brand-monitor Sweep

Replace remaining brand strings across docs and content. After this phase, `grep -ri "brand[ _-]monitor\|kitchensink\|symbiora"` should return nothing in `apps/`, `packages/`, root docs.

### Task 3.1: Sweep package.json files

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/app/package.json`
- Modify: `apps/www/package.json`
- Modify: `apps/story/package.json` (if affected)
- Modify: `packages/ui/package.json` (if affected)

**Step 1:** For each, replace:
- `"name": "@repo/mono"` (root) — keep
- `"description": "Symbiora monorepo"` → `"description": "Frontend monorepo boilerplate"`
- `"description": "Symbiora web application"` (apps/app) → `"description": "Application shell — frontend boilerplate"`
- (apps/www has no description currently — add one: `"description": "Marketing site shell — frontend boilerplate"`)
- `"keywords": ["kitchensink-react", ...]` → `"keywords": ["boilerplate", "monorepo", "turborepo", "next.js"]` (drop `kitchensink-react`, swap brand keywords)
- `"author": ...` — keep as-is

Repository URL `https://github.com/bromso/kitchensink-react` in root `package.json` — leave (the actual GitHub repo is named `boilerplate`, but the URL appears stale; user can fix with `gh repo edit` later).

**Step 2:** Commit

```bash
git add package.json apps/*/package.json packages/*/package.json
git commit -m "chore: scrub brand strings from package metadata

Removes 'Symbiora', 'Brand Monitor', 'kitchensink-react' from
descriptions and keywords. Generic boilerplate language."
```

### Task 3.2: Sweep CHANGELOG.md files

**Files:**
- Modify: `apps/app/CHANGELOG.md`
- Modify: `apps/www/CHANGELOG.md`

**Step 1:** Read each. Use sed-style replace via Edit tool:
- "Brand Monitor" → "Boilerplate"
- "Symbiora" → "Boilerplate"
- "kitchensink-react" → "boilerplate"

**Step 2:** Commit

```bash
git add apps/*/CHANGELOG.md
git commit -m "chore: scrub brand strings from CHANGELOGs"
```

### Task 3.3: Sweep README.md and CLAUDE.md (CLAUDE.md gets fully rewritten in Phase 8 — for now, just remove brand strings as a holdover)

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md` (light pass; full rewrite in Phase 8)

**Step 1:** Read each, replace brand strings the same way.

**Step 2:** Commit

```bash
git add README.md CLAUDE.md
git commit -m "chore: scrub brand strings from README and CLAUDE.md"
```

### Task 3.4: Final brand-string sweep verification

```bash
grep -ri "brand[ _-]monitor\|kitchensink\|symbiora" apps packages CLAUDE.md README.md 2>/dev/null | grep -v "^Binary file" | head -30
```

Expected: empty (or only matches inside docs/plans/ design files which we keep as historical record).

If anything remains in source/config (not in docs/plans/), fix it as a follow-up commit:

```bash
git add <files>
git commit -m "chore: scrub residual brand strings"
```

---

## Phase 4: Architecture Scaffolding

Create the new layered structure: `packages/ui/src/blocks/` with a Hero seed, `apps/<app>/src/views/` with HomeView seeds, and minimal homepages that compose them.

### Task 4.1: Create `packages/ui/src/blocks/` with a Hero seed

**Files:**
- Create: `packages/ui/src/blocks/README.md`
- Create: `packages/ui/src/blocks/hero.tsx`

**Step 1:** Create `packages/ui/src/blocks/README.md`:

```markdown
# Blocks

Reusable section patterns composed of components from `../components/`.

A block is content-agnostic (takes props), composable, and meant to be assembled into views by an app.

Examples: hero, feature grid, footer, pricing table.

**Import direction:** blocks may import from `../components/`. They may NOT import from any app's `views/` or pages.

## Conventions

- One block per file: `<block-name>.tsx`
- Named export matching the file (PascalCase)
- All content as props, with sensible defaults for storybook
- `className` prop accepted, merged with `cn()` from `@repo/ui/lib/utils`
- A matching Storybook story under `apps/story/src/stories/blocks/<block-name>.stories.tsx`
```

**Step 2:** Create `packages/ui/src/blocks/hero.tsx`:

```tsx
import * as React from "react"
import { cn } from "@repo/ui/lib/utils"

interface HeroProps extends React.HTMLAttributes<HTMLElement> {
  eyebrow?: string
  title: string
  description?: string
  actions?: React.ReactNode
}

export function Hero({
  className,
  eyebrow,
  title,
  description,
  actions,
  ...props
}: HeroProps) {
  return (
    <section
      className={cn(
        "flex min-h-[60vh] flex-col items-center justify-center gap-6 px-6 py-24 text-center",
        className,
      )}
      {...props}
    >
      {eyebrow && (
        <span className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          {eyebrow}
        </span>
      )}
      <h1 className="text-balance text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
        {title}
      </h1>
      {description && (
        <p className="max-w-2xl text-balance text-base text-muted-foreground md:text-lg">
          {description}
        </p>
      )}
      {actions && <div className="flex flex-wrap items-center justify-center gap-3">{actions}</div>}
    </section>
  )
}
```

**Step 3:** Verify packages/ui exports allow `@repo/ui/blocks/hero` import path. Check `packages/ui/package.json` `exports` field. If components are exported via `./components/*`, blocks will need a similar entry. Add:

```json
"./blocks/*": "./src/blocks/*.tsx"
```

(Mirror whatever pattern the existing `./components/*` export uses.)

**Step 4:** Commit

```bash
git add packages/ui/src/blocks packages/ui/package.json
git commit -m "feat(ui): add blocks layer with Hero seed

Reusable section patterns live in packages/ui/src/blocks/.
Imported by app views; not by components.
Hero is the seed block; more added on demand."
```

### Task 4.2: Create `apps/www/src/views/` with HomeView and rewrite homepage + layout

**Files:**
- Create: `apps/www/src/views/README.md`
- Create: `apps/www/src/views/home-view.tsx`
- Replace: `apps/www/src/app/page.tsx`
- Replace: `apps/www/src/app/layout.tsx`

**Step 1:** Create `apps/www/src/views/README.md`:

```markdown
# Views

Page-level compositions specific to this app. A view assembles blocks (from `@repo/ui/blocks`) and components (from `@repo/ui/components`) into a layout for one route.

**Import direction:** views may import from `@repo/ui/blocks/*`, `@repo/ui/components/*`, or local components. Views may NOT be imported by blocks or components.

## Convention

- One view per file: `<route>-view.tsx`
- Named export matching the file: `<Route>View` (PascalCase)
- Pages are thin: `page.tsx` imports a view and renders it
```

**Step 2:** Create `apps/www/src/views/home-view.tsx`:

```tsx
import { Hero } from "@repo/ui/blocks/hero"

export function HomeView() {
  return (
    <main>
      <Hero
        eyebrow="Frontend boilerplate"
        title="Build faster with this monorepo template"
        description="Tokens, components, blocks, views, pages — wired up with Next.js, Bun, Turborepo, and Biome."
      />
    </main>
  )
}
```

**Step 3:** Replace `apps/www/src/app/page.tsx` entirely:

```tsx
import { HomeView } from "@/views/home-view"

export default function Page() {
  return <HomeView />
}
```

**Step 4:** Rewrite `apps/www/src/app/layout.tsx`. Strip everything related to deleted blocks/content/json-ld/styleglide. The layout should be minimal — just font + theme provider + children. Read the current file, delete brand schema, delete navbar/footer block imports.

Result should look roughly like:

```tsx
import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import "@/styles/globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
})

export const metadata: Metadata = {
  title: "Frontend boilerplate",
  description: "Marketing site shell — frontend boilerplate",
}

export const viewport: Viewport = {
  themeColor: "#000",
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} font-sans`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
        </ThemeProvider>
      </body>
    </html>
  )
}
```

(Adjust based on what's actually present — read first. If `theme-provider.tsx` has brand-specific config, that's also a candidate to simplify or delete. Use judgment.)

**Step 5:** Update `apps/www/src/app/sitemap.ts` and `robots.ts` — remove brand URLs and references. They become minimal stubs:

```ts
// sitemap.ts
import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: "https://www.brand.com/",
      lastModified: new Date(),
    },
  ]
}
```

```ts
// robots.ts
import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/" }],
    sitemap: "https://www.brand.com/sitemap.xml",
  }
}
```

(Use a placeholder hostname — user will fill in their real domain.)

**Step 6:** Verify the build is no longer blocked

```bash
bun --filter @repo/www build 2>&1 | tail -15
```

Expected: succeeds, OR fails with clearly identifiable issue (likely missing import in layout). Fix and re-run until clean.

**Step 7:** Commit

```bash
git add apps/www
git commit -m "feat(www): replace homepage and layout with HomeView composition

- New apps/www/src/views/home-view.tsx assembles blocks
- page.tsx is now a thin wrapper around HomeView
- layout.tsx stripped of deleted block imports and brand schema
- sitemap.ts and robots.ts simplified to placeholders"
```

### Task 4.3: Create `apps/app/src/views/` with HomeView and add homepage

**Files:**
- Create: `apps/app/src/views/README.md`
- Create: `apps/app/src/views/home-view.tsx`
- Create: `apps/app/src/app/page.tsx`
- Modify: `apps/app/src/app/layout.tsx` (strip brand refs, drop deleted-component imports)

**Step 1:** Create `apps/app/src/views/README.md` (same content as Task 4.2 step 1).

**Step 2:** Create `apps/app/src/views/home-view.tsx`:

```tsx
import { Hero } from "@repo/ui/blocks/hero"

export function HomeView() {
  return (
    <main>
      <Hero
        eyebrow="App shell"
        title="Welcome to the application"
        description="This is a clean shell. Add real routes under apps/app/src/app/ as the product takes shape."
      />
    </main>
  )
}
```

**Step 3:** Create `apps/app/src/app/page.tsx`:

```tsx
import { HomeView } from "@/views/home-view"

export default function Page() {
  return <HomeView />
}
```

**Step 4:** Modify `apps/app/src/app/layout.tsx` — strip brand refs and any imports of files deleted in Phase 1 (Apollo provider was already removed in Task 1.1). Keep `Providers` component, just rewrite metadata/title to be generic.

**Step 5:** Verify the build is no longer blocked

```bash
bun --filter @repo/app build 2>&1 | tail -15
```

Expected: succeeds.

**Step 6:** Commit

```bash
git add apps/app
git commit -m "feat(app): add HomeView and root homepage

- New apps/app/src/views/home-view.tsx assembles blocks
- New page.tsx at app root (replaces deleted dashboard root)
- layout.tsx stripped of brand refs"
```

---

## Phase 5: Catalog Updates (folded fixes)

### Task 5.1: Add `@iconify/react` to root catalog and migrate workspaces

**Files:**
- Modify: `package.json` (root)
- Modify: `apps/app/package.json`, `apps/www/package.json`, `apps/story/package.json`, `packages/ui/package.json`

**Step 1:** Verify all 4 workspaces are at compatible versions (Dependabot PR #1 should have aligned at `^6.0.x`):

```bash
grep '"@iconify/react"' apps/*/package.json packages/*/package.json
```

If they differ, set the catalog to the lowest caret that satisfies all (likely `^6.0.0`).

**Step 2:** Add to root `catalog`:

```json
"@iconify/react": "^6.0.0"
```

**Step 3:** Switch each workspace's `@iconify/react` value to `"catalog:"`.

**Step 4:** Run `bun install`

```bash
bun install
```

**Step 5:** Commit

```bash
git add package.json apps/*/package.json packages/ui/package.json bun.lock
git commit -m "chore(deps): add @iconify/react to workspace catalog"
```

### Task 5.2: Unify zod on v4 and add to catalog

**Files:**
- Modify: `package.json` (root) — add `zod` to catalog
- Modify: `packages/ui/package.json` — bump zod to `^4.x`, switch to `catalog:`
- Modify: `apps/story/package.json` — switch zod to `catalog:`
- Modify: any source files in `packages/ui` that break under zod 4

**Step 1:** Find all zod imports in `packages/ui/src/`

```bash
grep -rln "from \"zod\"\|from 'zod'" packages/ui/src/ 2>/dev/null
```

For each, determine if zod 4 has any breaking change that affects the usage. Common gotchas:
- `z.string().email()` API stays the same
- `z.infer<T>` works the same
- `safeParse` works the same
- Stricter type checks may surface

**Step 2:** Bump zod in `packages/ui/package.json` from `^3.25.76` to `^4.0.0` (or whatever current latest is — check `bun outdated` or npmjs for the actual latest stable version):

```bash
bun outdated zod 2>/dev/null
```

**Step 3:** Add to root `catalog`:

```json
"zod": "^4.0.0"
```

(Adjust to actual latest stable.)

**Step 4:** Switch `packages/ui/package.json` and `apps/story/package.json` `zod` entries to `"catalog:"`.

**Step 5:** Run `bun install`

```bash
bun install
```

**Step 6:** Type-check `packages/ui` to surface any zod 4 breakage:

```bash
cd packages/ui && bunx --bun tsc --noEmit 2>&1 | grep -i "zod" | head -20 ; cd /Users/jonasbroms/Sites/boilerplate
```

If errors, fix the call sites. Most common zod 3→4 fixes:
- `.parse()` and `.safeParse()` work the same
- Custom error formatting via `.format()` changed slightly — see zod 4 migration notes
- `.refine()` callbacks — context shape may have changed

**Step 7:** Storybook re-test — story uses zod 4 already so should be fine.

**Step 8:** Commit

```bash
git add package.json packages/ui/package.json apps/story/package.json bun.lock
git commit -m "chore(deps): unify zod on v4 and add to workspace catalog

- packages/ui upgraded from zod 3.x to 4.x
- apps/app and apps/www no longer depend on zod (deleted forms)
- All zod consumers now use 'catalog:'"
```

---

## Phase 6: Storybook Build Fix

The pre-existing `bun --filter @repo/story build` failure with a Babel parse error.

### Task 6.1: Investigate the Babel parse error

**Step 1:** Run the failing build with verbose output:

```bash
bun --filter @repo/story build 2>&1 | tail -50
```

Identify the file path mentioned in the parse error. Common suspects: heavy R3F demos, `Waves.tsx`, `Threads.tsx`, syntax-heavy decorative components.

**Step 2:** Read the offending file. Look for:
- Unclosed JSX
- TypeScript-only syntax that the Babel parser doesn't recognize (e.g., `satisfies` in older Babel)
- Decorators without proper config
- Incorrect import attributes (e.g., `import "..." with { type: "css" }`)

**Step 3:** Decide:
- **A. Fix the file** if the issue is small (typo, parser-incompatible syntax with simple workaround)
- **B. Exclude from Storybook** if the file is decorative and not story-relevant. Add the file to a Storybook ignore list (or add a `.stories` skip pattern).
- **C. Time-box at 1 hour** — if neither A nor B work cleanly within the budget, defer with a clear note in the PR.

**Step 4:** Verify the fix or exclusion

```bash
bun --filter @repo/story build 2>&1 | tail -10
```

Expected: builds successfully (or clearly defers the issue).

**Step 5:** Commit

```bash
git add <fixed files OR storybook config>
git commit -m "fix(story): resolve Babel parse error in <file>

<one-line root cause and fix description>"
```

If the issue is deferred:

```bash
# No commit; add a note in the final PR body
```

---

## Phase 7: Skill Content Updates

Update Claude Code skills that reference the now-removed stack.

### Task 7.1: Update `repo-conventions` skill

**Files:**
- Modify: `.claude/skills/repo-conventions/SKILL.md`

**Step 1:** Read the current SKILL.md. Find sections referencing:
- "Authentication Stack" / Better Auth / Supabase / Drizzle
- "Data Layer" / Apollo / GraphQL local resolvers / mock data

**Step 2:** Replace these sections with a "Frontend-Only Architecture" section explaining:
- Five-layer model: tokens → components → blocks → views → pages
- Where each layer lives
- Backend has been intentionally deferred; will be added fresh later

Keep all other sections (Layout, Where Things Go, Commands, Linting, Commits, Changesets, Code Style).

**Step 3:** Update the "Where Things Go" table:
- Remove `GraphQL types/resolvers/mocks` row
- Remove `Auth flow` row
- Remove `Auth config` row
- Add: `Block (shared section pattern)` → `packages/ui/src/blocks/`
- Add: `View (page-level composition)` → `apps/<app>/src/views/`

**Step 4:** Validate

```bash
python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/repo-conventions
```

Expected: "Skill is valid!"

**Step 5:** Commit

```bash
git add .claude/skills/repo-conventions/
git commit -m "docs(skills): refresh repo-conventions for frontend-only stack"
```

### Task 7.2: Update `nextjs-route-handlers` skill

**Files:**
- Modify: `.claude/skills/nextjs-route-handlers/SKILL.md`

**Step 1:** Read current. Find references to:
- `apps/app prefers GraphQL operations against local resolvers`
- Apollo / GraphQL preference text

**Step 2:** Rewrite the "When to use Route Handlers vs. Server Actions vs. GraphQL Resolvers" section. Drop GraphQL row. Simplify to Route Handlers vs. Server Actions only.

**Step 3:** Validate and commit

```bash
python3 .claude/skills/skill-creator/scripts/quick_validate.py .claude/skills/nextjs-route-handlers
git add .claude/skills/nextjs-route-handlers/
git commit -m "docs(skills): drop GraphQL preference from nextjs-route-handlers"
```

### Task 7.3: Delete `add-dashboard-route` skill

The whole premise (GraphQL types, local resolvers, mocks, sidebar) is gone.

**Step 1:**

```bash
rm -rf .claude/skills/add-dashboard-route
```

**Step 2:** Commit

```bash
git add -A .claude/skills
git commit -m "chore(skills): remove add-dashboard-route

Skill premise (GraphQL, Apollo resolvers, mocks, sidebar nav) has
been removed from the codebase. A new skill can be written when
real dashboard routes return."
```

### Task 7.4: Light-touch update to `monorepo-deps` skill

**Files:**
- Modify: `.claude/skills/monorepo-deps/SKILL.md`

**Step 1:** Quick read. Most should still apply (Bun + Turborepo + workspaces is unchanged). The only outdated bit is the `react/react-dom/react-hook-form` overrides example — react-hook-form is no longer pinned at root since we deleted form code from apps. Leave the example or trim if obvious.

**Step 2:** No commit unless something genuinely needs updating.

---

## Phase 8: Doc & Config Cleanup

### Task 8.1: Rewrite CLAUDE.md for frontend-only architecture

**Files:**
- Modify: `CLAUDE.md`

**Step 1:** Read current.

**Step 2:** Rewrite top-down. Remove:
- "Authentication" section (no auth)
- "State Management" section (no Apollo)
- "App Routing" section (no auth/dashboard/errors/quiz route groups exist)
- "Adding a New Dashboard Feature" common task
- "Updating Authentication" common task

Add:
- A "Frontend Architecture" section documenting the five layers and import direction (cribbed from the design doc)
- "Adding a New Block", "Adding a New View", "Adding a New Page" sections under "Common Tasks"
- A "Data layer / backend / auth" note explaining these are intentionally deferred

Keep:
- "Commands" section (Bun/Turborepo commands)
- "Code Style" (Biome conventions)
- "File Naming Conventions"
- "Slash Commands" (but trim `/codegen` and `/db-migrate` from the list)
- "Microfrontend Architecture" section (still applies)
- "Dependency Versioning (Bun catalog)" section (still applies; update notable holdouts list)

**Step 3:** Commit

```bash
git add CLAUDE.md
git commit -m "docs(claude): rewrite CLAUDE.md for frontend-only boilerplate

- Remove sections about backend/auth/data layer
- Add five-layer architecture documentation
- Add Common Tasks for blocks, views, pages
- Update slash commands list"
```

### Task 8.2: Shrink .env.example

**Files:**
- Modify: `.env.example`

**Step 1:** Read current. Remove:
- The commented `DATABASE_URL` block
- `NEXT_PUBLIC_COOKIE_DOMAIN` (auth-related)
- Any Supabase-related env vars (`NEXT_PUBLIC_SUPABASE_*`)
- Anything codegen-related

If `NEXT_PUBLIC_API_URL` exists and feels like reasonable boilerplate, keep it. Otherwise replace the file with a minimal stub:

```
# Add environment variables here as your apps need them.
# See apps/<app>/.env.local.example for app-specific overrides if those files exist.
```

**Step 2:** Commit

```bash
git add .env.example
git commit -m "chore(env): shrink .env.example to frontend-only boilerplate"
```

### Task 8.3: Remove obsolete slash commands

**Files:**
- Delete: `.claude/commands/codegen.md`
- Delete: `.claude/commands/db-migrate.md`

**Step 1:**

```bash
rm .claude/commands/codegen.md .claude/commands/db-migrate.md
```

**Step 2:** Commit

```bash
git add -A .claude/commands
git commit -m "chore(claude): remove obsolete slash commands

/codegen referenced graphql-codegen (removed).
/db-migrate referenced Drizzle (no DB)."
```

---

## Phase 9: Verification

### Task 9.1: Final brand-string sweep

```bash
grep -ri "brand[ _-]monitor\|kitchensink\|symbiora" apps packages CLAUDE.md README.md .env.example 2>/dev/null | grep -v "^Binary file" | head -20
```

Expected: no matches (or only matches inside `docs/plans/` which we keep as historical record).

If anything pops, fix it inline:

```bash
git add <files>
git commit -m "chore: scrub residual brand strings"
```

### Task 9.2: Build all three apps

```bash
bun install --frozen-lockfile && \
bun --filter @repo/www build && \
bun --filter @repo/app build && \
bun --filter @repo/story build
```

Expected: all three succeed.

If `apps/story` build still fails (Phase 6 may have deferred it), document in PR body.

### Task 9.3: Type-check per workspace

```bash
for d in apps/www apps/app packages/ui apps/story; do
  echo "=== $d ==="
  cd /Users/jonasbroms/Sites/boilerplate/$d && bunx --bun tsc --noEmit 2>&1 | tail -10
  cd /Users/jonasbroms/Sites/boilerplate
done
```

Expected: clean pass per workspace (no `Cannot find module` errors related to deleted paths).

If any error, fix the offending file (likely a leftover import) and commit.

### Task 9.4: Smoke test homepages on subdomain dev URLs

This is a manual verification step. Document the result in the PR body.

```bash
# Terminal 1
bun --filter @repo/www dev
# Visit http://www.localhost:3000

# Terminal 2
bun --filter @repo/app dev
# Visit http://app.localhost:3001
```

Confirm:
- Both pages load without console errors
- Hero block renders on both
- Theme switcher (if present) works

---

## Phase 10: Push and PR

### Task 10.1: Push branch

```bash
git push -u origin feat/frontend-boilerplate
```

### Task 10.2: Open PR

```bash
gh pr create --title "feat: clean frontend boilerplate (remove backend/auth/brand)" --body "$(cat <<'EOF'
## Summary

Strips the repo to a clean frontend-only boilerplate organized around five layers: **tokens → components → blocks → views → pages**. Removes all backend plumbing (Apollo, GraphQL, Supabase, codegen) and brand-specific copy. Folds in the four open items from PR #4 (catalog gaps, zod alignment, Storybook fix).

### What's gone

- Apollo Client, GraphQL codegen, full `apps/app/src/data/` and `src/gql/` trees
- Supabase SSR clients, cookie domain helper, Supabase-coupled middleware, auth callback route
- `(auth)`, `(dashboard)`, `(errors)` route groups in apps/app
- All brand-specific blocks and pages in apps/www (about, contact, faq, pricing, login)
- "Brand Monitor" / "Symbiora" / "kitchensink-react" references across docs and metadata
- Deps: `@apollo/client`, `graphql`, `@graphql-codegen/*`, `@supabase/*`, `next-safe-action`, `@mdx-js/*`, `@next/mdx`, `schema-dts`, `@faker-js/faker`, `dotenv`, redundant `react-hook-form`/`zod` instances

### What's new

- `packages/ui/src/blocks/` — shared section patterns (seeded with `Hero`)
- `apps/<app>/src/views/` — app-specific page-level compositions (seeded with `HomeView`)
- Minimal homepages on both apps composing `HomeView`
- `@iconify/react` and `zod` (v4) added to workspace catalog
- Refreshed CLAUDE.md and skills for the frontend-only architecture

### Test plan

- [x] `bun install --frozen-lockfile` clean
- [x] `bun --filter @repo/www build` succeeds
- [x] `bun --filter @repo/app build` succeeds
- [ ] `bun --filter @repo/story build` — see notes below
- [ ] **Manual:** Visit `http://www.localhost:3000` and `http://app.localhost:3001`; verify Hero renders and SW registers
- [x] No residual brand strings: `grep -ri "brand[ _-]monitor|kitchensink|symbiora" apps packages CLAUDE.md README.md` returns nothing

### Storybook build status

<fill in based on Phase 6 outcome — "fixed in this PR" or "deferred with note">

### Out of scope

- Re-introducing GraphQL / Supabase / auth (will be done fresh later when needed)
- Creating apps/auth, apps/docs, apps/help
- Choosing a final brand name (kept generic boilerplate language)

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

---

## Done Criteria

- [ ] All Phase 1 deletions complete (data, gql, Apollo, Supabase, auth, dashboard, errors)
- [ ] All Phase 2 deletions complete (www blocks, brand pages, brand content)
- [ ] No brand strings remain in `apps/`, `packages/`, root docs
- [ ] `packages/ui/src/blocks/hero.tsx` exists; `packages/ui/src/blocks/README.md` exists
- [ ] `apps/<app>/src/views/home-view.tsx` exists in both apps; READMEs exist
- [ ] Both apps' `page.tsx` import their respective `HomeView`
- [ ] `@iconify/react` and `zod` (v4) are in the root catalog
- [ ] All workspaces use `"catalog:"` for these
- [ ] `repo-conventions`, `nextjs-route-handlers` skills updated; `add-dashboard-route` skill deleted
- [ ] `CLAUDE.md` rewritten for frontend-only stack
- [ ] `.env.example` shrunk
- [ ] `/codegen` and `/db-migrate` slash commands deleted
- [ ] `bun --filter @repo/www build` and `bun --filter @repo/app build` both succeed
- [ ] Storybook either builds or is documented as deferred
- [ ] Branch pushed, PR opened
