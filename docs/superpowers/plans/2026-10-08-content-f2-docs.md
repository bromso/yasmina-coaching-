# Content F2 — the docs engine in `apps/docs` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the empty `apps/docs` shell into a static docs engine — MDX pages in nested folders
ordered by `meta.json`, a sidebar, breadcrumbs, a table of contents, previous/next, ⌘K search over
a static index — reusing F1's content checks and MDX components.

**Architecture:** `fumadocs-mdx` compiles `apps/docs/content/docs/**` (`defineDocs`, with
`meta.json` files) into `.source`; `fumadocs-core`'s `loader()` gives the page tree, pages,
neighbours and breadcrumbs, and `createFromSource()` the static search index served by a
`force-static` `/api/search`. The content checks F1 wrote for the blog move into
`@repo/content/checks` so both apps share them; the docs app adds its own `assembleDocs` (one
`ContentError`, like `assembleBlog`). Every visible piece is a `@repo/ui` block that takes plain
props (no fumadocs import in `@repo/ui`); the app maps fumadocs' tree onto them.

**Tech Stack:** Next 16.2 (`next build --webpack`, `output: "standalone"`), React 19.2, Bun 1.4.2,
`fumadocs-mdx` 15.4.6, `fumadocs-core` 16.16.2 (its static search uses the bundled `zbsearch`;
nothing else to install), Zod 4, Tailwind v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-content-design.md` — section 3 and the F2 half of 4.
F1 (the blog, PR #74) is merged; its code is the template.

## Global Constraints

- Biome clean with zero warnings (`bunx biome ci .`); double quotes, no semicolons, 2-space indent,
  100-char lines.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No new dependency beyond what F1 catalogued (`fumadocs-mdx`, `fumadocs-core` via `"catalog:"`);
  no `fumadocs-ui`; no `@orama/*`.
- `apps/docs` stays on `docs.brand.localhost:3004`, static only: every route `○`/`●`, except the
  existing `api/{analytics,health,telemetry}` handlers; `/api/search` is `force-static`.
- `@repo/ui` never imports fumadocs; blocks take plain, serialisable props.
- Docs frontmatter: `title` (required), `description` (required), `icon?`, `updated?` (a date,
  shown as "Last updated"), `tags?` (lowercase kebab-case), and `type` (optional string, default
  `"Documentation"` — Open Knowledge Format readiness, like the blog's `type`).
- The build fails on: bad frontmatter (fumadocs, at compile), a `meta.json` naming a missing page or
  folder, a body `#` h1, a broken or non-root-relative internal link, a link to a local development
  host, a missing image under `public/` — all content problems in one `ContentError`.
- Search runs in the browser over `/api/search` (same origin; the CSP stays `connect-src 'self'`).
  Without JavaScript the search control is a link to `/all`, a plain list of every page.
- Every page renders its content and navigation without JavaScript; the sidebar's groups are
  `<details>` elements; on narrow screens the sidebar sits above the content (no `Sheet` needed
  without JS; with JS a `Sheet` may replace it).
- "Edit on GitHub" appears only when the build-time `CONTENT_REPO_URL` is set
  (e.g. `https://github.com/<owner>/<repo>/blob/main/apps/docs/content/docs`); the page's file path
  is appended.

## Review Focus

1. **A folder without `index.mdx`** — the sidebar shows it as a non-link group; breadcrumbs show its
   name without a link; nothing 404s. (Task 3 + Task 4 tests)
2. **`meta.json` with a separator, `...` and an entry that does not exist** — separators and `...`
   work, the missing entry fails the build naming the `meta.json` file and the entry. (Task 2 test)
3. **A search with no results, and a query typed before the index loaded** — the dialog says "No
   results" (not an empty box), and results appear once the index arrives. (Task 5 test)
4. **A heading whose text is not a plain string** (inline code, emphasis) — TOC, breadcrumbs and
   prev/next still get readable text, never `[object Object]`. (Task 3 adapter test)
5. **The first and last page** — prev/next shows only the side that exists; the landing page `/`
   has no "previous". (Task 4 test)

---

### Task 1: Share the content checks; the docs frontmatter schema

**Files:**
- Create: `packages/content/src/checks.ts` (+ `checks.test.ts`) — moved from
  `apps/blog/src/lib/blog-core.ts`: `extractLinks`, `extractImages`, `imageProblems`,
  `headingProblems` and their private regexes/helpers (`FENCE`, `INLINE_CODE`, `prose`, …).
- Modify: `packages/content/package.json` (export `"./checks": "./src/checks.ts"`),
  `packages/content/src/schema.ts` (+ test) — add the docs schema;
  `apps/blog/src/lib/blog-core.ts` (import the moved helpers; keep `knownPaths`, `nestingProblems`,
  `assembleBlog`), `apps/blog/src/lib/blog.test.ts` (move the moved helpers' tests to
  `checks.test.ts`, keep blog-specific ones), `packages/content/README.md`.

**Interfaces — Produces:**

```ts
// @repo/content/checks
export function extractLinks(source: string): string[]
export function extractImages(source: string): string[]
export function imageProblems(file: string, images: string[], exists: (path: string) => boolean): string[]
export function headingProblems(file: string, source: string, titleOwner?: string): string[]
//   message: `${file}: use "##" for headings — the ${titleOwner ?? "page"} title is the page's h1`
//   (the blog passes "post", keeping its existing message and tests)

// @repo/content/schema (added)
export const docFrontmatterSchema: z.ZodObject<…> // strict: title, description, icon?, updated?, tags? (TAG_PATTERN), type default "Documentation"
export type DocFrontmatter = z.infer<typeof docFrontmatterSchema>
```

- [ ] **Step 1: Failing tests** — `checks.test.ts` holds the moved tests unchanged in substance
  (they must pass against the moved code) plus: `headingProblems` without `titleOwner` says "page",
  with `"post"` says "post". `schema.test.ts`: a docs page with only `title` and `description`
  parses with `type` `"Documentation"`; missing `description` is refused; an unknown key is
  refused; `updated: ""` and `updated: null` are refused; tag `Next.js` refused.
- [ ] **Step 2: Run** `cd packages/content && bun test` — FAIL.
- [ ] **Step 3: Implement** — move, do not copy (the blog imports from `@repo/content/checks`;
  `grep` shows no second definition). Reuse the blog's date schema for `updated`.
- [ ] **Step 4: Run** `cd packages/content && bun test`; `cd apps/blog && bun test`;
  `bun run typecheck`; `bunx biome ci .`; `bun --filter @repo/blog build` (still static, same
  routes).
- [ ] **Step 5: Commit** — `refactor(content): share the MDX content checks; add the docs schema`

---

### Task 2: The docs content pipeline

**Files:**
- Create: `apps/docs/source.config.ts`, `apps/docs/src/lib/source.ts`,
  `apps/docs/src/lib/docs-core.ts` (+ `docs-core.test.ts`), `apps/docs/src/lib/docs.ts`,
  starter content under `apps/docs/content/docs/`:
  `index.mdx` (the landing: what's in the starter, cards to the sections),
  `meta.json` (`{ "pages": ["index", "---Start here---", "getting-started", "architecture",
  "---Guides---", "authentication", "deploying", "adding-an-app", "..."] }`),
  `getting-started.mdx`, `architecture.mdx`, `authentication.mdx`, `deploying.mdx`,
  `adding-an-app.mdx` — each adapted (shortened) from the repo's README / CLAUDE.md / guides, with
  root-relative links only between docs pages and absolute `https://github.com/...` links nowhere
  (no repo URL is known at build); one nested folder `guides/` is NOT required.
- Modify: `apps/docs/package.json` (deps `fumadocs-mdx`, `fumadocs-core`, `@repo/content`, `zod`
  — `catalog:` / `workspace:*`; `"postinstall": "fumadocs-mdx"`; `"test": "bun test"`),
  `apps/docs/next.config.mjs` (`createMDX`, `withBundleAnalyzer(withSerwist(withMDX(nextConfig)))`,
  `@repo/content` in `transpilePackages`), `apps/docs/tsconfig.json` (`"collections/*":
  ["./.source/*"]`), `apps/docs/.gitignore` (`/.source/`), root `package.json` (`typecheck` and
  `test:services` gain `--filter @repo/docs`), `scripts/ci-plan.test.ts` (mirrored lists).

**Interfaces — Consumes:** Task 1's checks and `docFrontmatterSchema`; `checkLinks` from
`@repo/content/links`; `ContentError` from `@repo/content/posts`. **Produces:**

```ts
// apps/docs/src/lib/source.ts
export const source // loader({ baseUrl: "/", source: toFumadocsSource(docs.docs, docs.meta) })
// apps/docs/src/lib/docs-core.ts (pure, testable without fumadocs)
export function metaProblems(metas: { file: string; pages?: string[] }[], exists: (dir: string, name: string) => boolean): string[]
//   skips separators (/^---.*---$|^---$/), "...", "z...a", and "[Text](url)" link entries;
//   `${file}: "${name}" in pages matches no page or folder`
export function docsKnownPaths(urls: string[]): Set<string> // every page URL plus "/all" and "/api/search"
export function assembleDocs(inputs: DocInput[], metas: …, exists: …): void // throws one ContentError
export interface DocInput { file: string; url: string; source: string; images: string[] }
// apps/docs/src/lib/docs.ts
export const docs // validated at module load (throws ContentError); re-exports what pages need
```

`source.config.ts` (relative schema import, as the blog does, so the config bundles without
runtime TypeScript loading):

```ts
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineConfig, defineDocs } from "fumadocs-mdx/config"
// Relative on purpose: fumadocs bundles this file with packages external; a workspace import would
// load a .ts file at runtime (needs Node type stripping). See apps/blog/source.config.ts.
import { docFrontmatterSchema } from "../../packages/content/src/schema"

export const docs = defineDocs({
  dir: "content/docs",
  docs: { schema: docFrontmatterSchema },
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: { ...rehypeCodeDefaultOptions, themes: { light: "github-light", dark: "github-dark" } },
    remarkImageOptions: { useImport: false },
  },
})
```

- [ ] **Step 1: Failing tests** (`docs-core.test.ts`): `metaProblems` accepts separators, `...`,
  `z...a`, `[Text](https://x)` and names that exist, reports a missing one with its file;
  `assembleDocs` collects a body h1 in one page and a broken link in another into ONE
  `ContentError`; a link to `/all` and to another page's `#anchor` is accepted; a link to
  `http://localhost:3000/x` is reported.
- [ ] **Step 2: Run** `cd apps/docs && bun test` — FAIL.
- [ ] **Step 3: Implement**; `bun install` (generates `.source`).
- [ ] **Step 4: Run** `cd apps/docs && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `rm -rf apps/docs/.source && bun --filter @repo/docs build` (static). Prove the gate: add a
  bogus name to `meta.json`, confirm the build fails naming it, revert.
- [ ] **Step 5: Commit** — `feat(docs): compile MDX docs with meta.json ordering and validate them`

---

### Task 3: Docs blocks in `@repo/ui`

**Files:**
- Create: `packages/ui/src/blocks/{docs-sidebar,breadcrumbs,docs-search}.tsx`,
  `packages/ui/src/components/mdx/cards.tsx` (`Cards`, `Card`), tests
  `packages/ui/src/blocks/docs-blocks.test.tsx`, stories
  `apps/story/stories/{DocsSidebar,Breadcrumbs,DocsSearch,Cards}.stories.tsx`.
- Modify: `packages/ui/src/components/mdx/index.tsx` and `mdx-static.tsx` (add `Cards`/`Card` to
  both maps — `Cards` is server-safe), the guard test stays green.

**Interfaces — Produces:**

```ts
// @repo/ui/blocks/docs-sidebar  (server component; no JS needed)
export type DocsNavNode =
  | { type: "page"; title: string; href: string }
  | { type: "separator"; title?: string }
  | { type: "folder"; title: string; href?: string; defaultOpen?: boolean; children: DocsNavNode[] }
export function DocsSidebar(props: { items: DocsNavNode[]; currentHref: string; label?: string }): ReactElement
//   <nav aria-label="Docs">; folders are <details> (open when defaultOpen or when they contain currentHref);
//   the current page link has aria-current="page"
// @repo/ui/blocks/breadcrumbs
export function Breadcrumbs(props: { items: { title: string; href?: string }[] }): ReactElement | null // null for < 2 items
// @repo/ui/blocks/docs-search  ("use client")
export interface DocsSearchResult { id: string; title: string; href: string; kind: "page" | "heading" | "text"; excerpt?: string }
export function DocsSearch(props: {
  fallbackHref: string                       // the no-JS link target ("/all")
  query: string
  onQueryChange: (q: string) => void
  results: DocsSearchResult[] | "loading" | "empty"
}): ReactElement
//   server render: an <a href={fallbackHref}>Search docs</a>; after hydration: a button opening a
//   Command dialog on click and on ⌘K / Ctrl-K; results link to their href; "No results" for "empty"
// @repo/ui/components/mdx (both maps)
export function Cards(props: { children: ReactNode }): ReactElement
export function Card(props: { title: string; href: string; children?: ReactNode }): ReactElement
```

Build on the existing primitives (`breadcrumb`, `command`, `dialog`, `card`); the sidebar is plain
markup (not the shadcn `sidebar` provider, which needs JS).

- [ ] **Step 1: Failing tests** (`renderToStaticMarkup`): the sidebar renders separators, a folder
  as `<details>` open when it contains the current page, `aria-current="page"` on the current link,
  a folder without `href` as text (Review Focus 1); `Breadcrumbs` returns null for one item and
  renders the last as text; `DocsSearch`'s server render is the fallback link (no button); `Card`
  renders a link with its title; `Cards` is in `mdxStaticComponents` and the guard test still
  passes.
- [ ] **Step 2: Run** `cd packages/ui && bun test` — FAIL.
- [ ] **Step 3: Implement** + stories.
- [ ] **Step 4: Run** `cd packages/ui && bun test`; `bun run --filter @repo/ui typecheck`;
  `bunx biome ci .`; the new stories' vitest (`cd apps/story && bunx vitest run <stories>`).
- [ ] **Step 5: Commit** — `feat(ui): docs sidebar, breadcrumbs, search dialog and cards`

---

### Task 4: Docs pages

**Files:**
- Create: `apps/docs/src/app/[[...slug]]/page.tsx` (replaces `page.tsx`; `/` is `index.mdx`),
  `apps/docs/src/app/[[...slug]]/opengraph-image.tsx`, `apps/docs/src/app/all/page.tsx`,
  `apps/docs/src/lib/nav.ts` (+ `nav.test.ts`) — fumadocs tree → `DocsNavNode[]`, breadcrumbs and
  neighbours → plain props, `textOf(node: ReactNode): string`,
  `apps/docs/src/views/{doc-view,all-pages-view}.tsx` (+ `views.test.tsx`).
- Modify: `apps/docs/src/app/sitemap.ts` (every page URL plus `/all`, `lastModified` = `updated`
  when set), `apps/docs/src/lib/routes.ts`, `apps/docs/src/app/layout.tsx` (`metadataBase`),
  delete `apps/docs/src/views/home-view.tsx`.

**Interfaces — Consumes:** `source`, `docs` (Task 2); the Task 3 blocks; `Toc`, `PrevNext`,
`mdxComponents` (F1). Fumadocs: `findNeighbour` (`fumadocs-core/page-tree`, returns
`{ previous?, next? }`), `getBreadcrumbItems` (`fumadocs-core/breadcrumb`).

Behaviour: a three-column layout on `lg` — sidebar, article, TOC (no TOC column when the page has no
headings); on narrow screens the sidebar above the article. The article: breadcrumbs, `h1` title,
description, body (`mdxComponents`), "Last updated <time>" when `updated` is set, "Edit on GitHub"
when `CONTENT_REPO_URL` is set, `PrevNext` (Previous/Next labels). A search control in the
header area (Task 5 wires it; Task 4 renders the fallback link to `/all`). `generateStaticParams`
from `source.generateParams()`, `dynamicParams = false`; metadata: title, description, absolute
canonical, OG image per page (`ogImage({ title, subtitle: "Docs" })`). `/all`: every page grouped
by its sidebar section, title + description, plain links.

- [ ] **Step 1: Failing tests:** `nav.test.ts` — a tree with a separator, a folder with and without
  an index page, and a page whose name is a React element (`<code>x</code> setup`) maps to the
  expected `DocsNavNode[]` with plain-text titles (Review Focus 4); neighbours of the first page
  have no `previous`, of the last no `next` (Review Focus 5). `views.test.tsx` — no headings → no
  TOC nav and no empty aside; "Edit on GitHub" absent without the env and present (with the file
  path appended) with it; `/all` lists every page.
- [ ] **Step 2: Run** `cd apps/docs && bun test` — FAIL.
- [ ] **Step 3: Implement** (pages thin, views compose blocks).
- [ ] **Step 4: Run** `cd apps/docs && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `bun --filter @repo/docs build` (static); start it and curl `/`, `/getting-started`, `/all` (200)
  and `/nope` (404); stop it.
- [ ] **Step 5: Commit** — `feat(docs): sidebar, breadcrumbs, table of contents and the page index`

---

### Task 5: Search

**Files:**
- Create: `apps/docs/src/app/api/search/route.ts`, `apps/docs/src/components/search.tsx`
  (`"use client"`: wires fumadocs' `useDocsSearch` with `client: staticClient({ from:
  "/api/search" })` to `@repo/ui`'s `DocsSearch`), `apps/docs/src/lib/search-results.ts`
  (+ test) — fumadocs results → `DocsSearchResult[]`.
- Modify: the docs layout or view to render `<Search />` in place of the Task 4 fallback link.

`route.ts`:

```ts
import { createFromSource } from "fumadocs-core/search/server"
import { source } from "@/lib/docs"

export const dynamic = "force-static"
export const { staticGET: GET } = createFromSource(source)
```

(`@/lib/docs` so a bad page fails the build here too; it re-exports the validated `source`.)

- [ ] **Step 1: Failing tests:** `search-results.test.ts` — page, heading (with `#anchor` href) and
  text hits map to `DocsSearchResult`; an empty result list maps to `"empty"`, a pending one to
  `"loading"` (Review Focus 3); titles that arrive as React nodes become plain text.
- [ ] **Step 2: Run** — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd apps/docs && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `bun --filter @repo/docs build` (`/api/search` `○`); start and `curl /api/search` (JSON with the
  starter pages); stop.
- [ ] **Step 5: Commit** — `feat(docs): static search with a ⌘K dialog`

---

### Task 6: e2e, docs, full gate

**Files:**
- Create: `apps/e2e/tests/docs.spec.ts`.
- Modify: `apps/e2e/e2e.env.ts` (`docs` URL), `apps/e2e/playwright.config.ts`
  (`next("docs", 3004)`), `apps/e2e/package.json` (`e2e` builds `@repo/docs`), `scripts/ci-plan.ts`
  (`E2E_TARGETS` gains `@repo/docs`) + `ci-plan.test.ts`, `.github/workflows/ci.yml` (the e2e
  build step adds `--filter @repo/docs`; the hosts loop already has docs), CLAUDE.md,
  `docs/guides/content.md`, `apps/docs/README.md`, `packages/content/README.md`,
  `apps/e2e/README.md`, `docs/guides/deploying.md` (`CONTENT_REPO_URL`), `docs/ROADMAP.md` (tick F).

- [ ] **Step 1: e2e** (`docs.spec.ts`): `/` shows the landing and the sidebar; clicking a sidebar
  link opens the page with breadcrumbs and a TOC; a TOC link moves to its heading (URL hash);
  "Next" goes to the following page; pressing Control+K (Meta+K on macOS — use
  `ControlOrMeta+k`) opens the search dialog, typing a word from a starter page shows a result,
  Enter or click lands on the page (hash for a heading hit); a nonsense query shows "No results";
  with `javaScriptEnabled: false`, `/getting-started` shows the body and sidebar and the search
  control is a link to `/all`, which lists every page.
- [ ] **Step 2: Docs** — CLAUDE.md: the **Content.** paragraph gains the docs engine (defineDocs +
  `meta.json` tokens: `---Name---` separators, `...` rest; the frontmatter; `/all`; search via the
  static `/api/search` index and `staticClient`; `CONTENT_REPO_URL`; the shared checks in
  `@repo/content/checks`); Apps line for `apps/docs`; the e2e command line and counts
  (`bunx playwright test --list`). `docs/guides/content.md`: a "Writing docs" part — page
  frontmatter, folders and `index.mdx`, `meta.json`, cards, search, what fails the build, replacing
  the starter pages (and that `docs.spec.ts` references them). READMEs and the deploying guide.
  Verify every claim against the code.
- [ ] **Step 3: Full gate** — `bun run ci` exit 0; build www, app, auth, account, blog, docs;
  `cd apps/e2e && CI=1 bunx playwright test --retries=0` — every test passes.
- [ ] **Step 4: Commit** — `test(e2e): docs journey` and `docs: the docs engine` (two commits).
