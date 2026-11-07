# Content F1 — `@repo/content`, MDX components, `apps/blog` — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a static MDX blog on its own subdomain (`blog.brand.localhost:3009`) built on a
shared content package and shared MDX components, so F2 can turn `apps/docs` into a docs engine on
the same foundation.

**Architecture:** `apps/blog` is a new static Next 16 app scaffolded exactly like `apps/jobs`.
`fumadocs-mdx` compiles `apps/blog/content/posts/*.mdx` at build into a generated `.source`
collection, read through `fumadocs-core`'s `loader()`; the app maps each page to a plain `PostInput`
and hands it to `@repo/content`, a pure TypeScript package that validates, filters drafts and
scheduled posts, ranks related posts, builds feeds and checks links. Every visible element comes
from `@repo/ui` (new `mdx` component map and blog blocks).

**Tech Stack:** Next 16.2 (`next build --webpack`, `output: "standalone"`), React 19.2, Bun 1.4.2
workspaces, `fumadocs-mdx` 15.4.6, `fumadocs-core` 16.16.2, Shiki (via fumadocs), Zod 4, Tailwind
v4, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-content-design.md` (this plan covers F1: sections 1, 2
and the F1 half of 4; F2 — the docs engine — gets its own plan after this PR merges).

## Global Constraints

- Biome clean with zero warnings (`bunx biome ci .`); double quotes, no semicolons, 2-space indent,
  100-char lines.
- Conventional Commits, header ≤ 100 chars, one type per header; every commit message ends with
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- New dependencies only `fumadocs-mdx` `15.4.6` and `fumadocs-core` `16.16.2`, both pinned in the
  root `catalog` and referenced as `"catalog:"`; no `fumadocs-ui`.
- `apps/blog` dev URL `http://blog.brand.localhost:3009`, prod `https://blog.<SITE_DOMAIN>`; dev
  script `next dev --port 3009 --hostname ${DEV_HOSTNAME:-blog.brand.localhost}`.
- Static only: every blog route is `○` or `●` (SSG) in `next build` output; no runtime call to
  `apps/api` except the existing telemetry/analytics routes.
- Every visible component lives in `@repo/ui`; the app composes them (views/pages layering from
  CLAUDE.md).
- Frontmatter (blog post): `title`, `description`, `date`, `updated?`, `author` (a key of
  `content/authors.ts`), `tags` (lowercase kebab-case), `cover?` (`{ src: "/…", alt }`), `draft?`.
- OKF readiness: frontmatter may carry an optional `type` (non-empty string, default `"Blog Post"`),
  the one required key of the Open Knowledge Format, so a later OKF export needs no post rewrite.
- Drafts show under `next dev` only; a post dated in the future is excluded from production builds;
  neither appears in feeds or the sitemap.
- The build fails on bad frontmatter, an unknown author, a malformed tag, duplicate slugs, a
  non-kebab-case slug, and a broken internal link.
- List pages show 12 posts per page; related posts: up to 3, most shared tags then newest.
- Feeds: `/rss.xml` (RSS 2.0), `/atom.xml` (Atom), `/feed.json` (JSON Feed 1.1), full content.
- Pages render their content and navigation without JavaScript.

## Review Focus

1. **A post with no headings** — no empty table-of-contents column or heading; the article keeps
   full width. (Task 5 test)
2. **Characters that break markup in titles and bodies** (`&`, `<`, quotes, `</script>`) — feeds stay
   well-formed XML and JSON-LD cannot close its `<script>`. (Task 2 feed/JSON-LD tests)
3. **Zero published posts** (every post a draft or scheduled in a production build) — the list page
   shows an empty state, the feeds are valid and empty, the sitemap lists only static routes, the
   build succeeds. (Task 2 + Task 5 tests)
4. **A post dated today** — published in a production build the same day (compare dates as UTC
   calendar days, not timestamps). (Task 2 test)
5. **A tag or slug that is not URL-safe** (`Next.js`, `My Post`) — refused at build with a message
   naming the file, never silently encoded into a broken URL. (Task 2 test)

---

### Task 1: Scaffold `apps/blog` as a static app

**Files:**
- Create: `apps/blog/**` by copying `apps/jobs` (every file listed below), then renaming.
  Copy: `.gitignore`, `components.json`, `next-env.d.ts`, `next.config.mjs`, `package.json`,
  `postcss.config.mjs`, `public/icons/*`, `public/logo.svg`, `public/offline.html`,
  `src/app/api/{analytics,health,telemetry}/route.ts`, `src/app/{error,global-error,not-found}.tsx`
  (these three from `apps/app`, unchanged), `src/app/layout.tsx`, `src/app/manifest.ts`,
  `src/app/opengraph-image.tsx`, `src/app/page.tsx`, `src/app/providers.tsx`, `src/app/robots.ts`,
  `src/app/sitemap.ts`, `src/app/sw.ts`, `src/app/twitter-image.tsx`, `src/lib/routes.ts`,
  `src/proxy.ts` (from `apps/app`, unchanged), `src/styles/globals.css`, `src/views/home-view.tsx`,
  `tsconfig.json`, `tsconfig.sw.json`, `README.md` (rewritten). Do NOT copy `public/sw.js` (build
  output), `CHANGELOG.md`, `LICENSE` or `scripts/`.
- Modify: `packages/sites/src/index.ts` (+ `index.test.ts`), `docker-compose.yml`,
  `docker-compose.dev.yml`, `.github/workflows/docker-build.yml.disabled`,
  `.devcontainer/devcontainer.json`, `workspace.code-workspace`, `.vscode/launch.json`,
  `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/bug_report.yml`,
  `.github/ISSUE_TEMPLATE/feature_request.yml`, root `package.json` (`typecheck` filter list).

**Interfaces — Produces:** workspace `@repo/blog`; `SITES.blog = { label: "Blog", port: 3009 }`;
`siteUrl("blog")`.

- [ ] **Step 1: Failing tests** — in `packages/sites/src/index.test.ts`, update the hard-coded
  expectations to the new list:
  - `Object.keys(SITES)` gains `"blog"` (after `"jobs"`), and `SITES.blog` equals
    `{ label: "Blog", port: 3009 }`;
  - `siteUrl("blog", {})` is `"http://blog.brand.localhost:3009"` and with
    `{ SITE_DOMAIN: "example.com" }` is `"https://blog.example.com"`;
  - `siteNav(...)` order becomes `["app", "docs", "blog", "help", "jobs"]`;
  - `footerGroups()`'s "Company" group becomes `[blog, jobs, help]`.
- [ ] **Step 2: Run** `cd packages/sites && bun test` — expect the new assertions to FAIL.
- [ ] **Step 3: Implement** — add `blog: { label: "Blog", port: 3009 }` to `SITES`, `"blog"` to
  `NAV` after `"docs"`, `link("blog")` first in the "Company" footer group. Copy the app files;
  in each, replace `jobs`/`Jobs`/`3006` with `blog`/`Blog`/`3009`:
  - `package.json`: `"name": "@repo/blog"`, description `"Blog — MDX posts on their own subdomain"`,
    dev script per Global Constraints, `start` on 3009;
  - `layout.tsx`: `SITE = "blog"`, title default `${BRAND_NAME} Blog`, description
    `"Notes, releases and guides"`, `appleWebApp.title: "Blog"`;
  - `manifest.ts`, `opengraph-image.tsx` (`title: "Blog"`, `subtitle: "Notes, releases and guides"`),
    health route `app: "blog"`, telemetry `createTelemetryRoute({ app: "blog" })`, analytics
    `createAnalyticsRoute({ app: "blog" })`;
  - `home-view.tsx`: a heading "Blog" and the sentence "Posts are on their way." (Task 5 replaces
    it). `TelemetryApp` / `TelemetryAppSchema` in `@repo/api-contract` must accept `"blog"` — check
    where the app ids are listed (grep `TelemetryAppSchema`) and add it there, with the api test
    that lists the apps updated.
  - Repo enumerations, each copying the `jobs` entry with blog/3009: `docker-compose.yml` service
    `blog` (the `jobs` block, including `COOKIE_DOMAIN: "${COOKIE_DOMAIN:-.brand.localhost}"`);
    `docker-compose.dev.yml` `/app/apps/blog/node_modules` and `/app/apps/blog/.next`; the GHCR
    matrix row `{ dockerfile: next, app: blog, port: 3009 }` and the static-apps comment;
    devcontainer `forwardPorts` `3009` + `portsAttributes` `"3009": { "label": "blog",
    "onAutoForward": "silent" }`; `workspace.code-workspace` `{ "name": "📝 Blog", "path":
    "./apps/blog" }`; `.vscode/launch.json` `Next: Blog` (pattern `Local:\\s+https?://\\S+:3009`)
    and `Chrome: Blog` (`http://blog.brand.localhost:3009`), and add them to `Stack: everything`;
    `CODEOWNERS` `/apps/blog/ @bromso`; both issue templates' area options `apps/blog (blog)`;
    root `typecheck` gains `--filter @repo/blog`.
- [ ] **Step 4: Run** `bun install`; `cd packages/sites && bun test`; `bun test scripts`
  (docker/pwa/vscode/github checks must pass with blog included); `bun run typecheck`;
  `bunx biome ci .`; `bun --filter @repo/blog build` — every route `○`.
- [ ] **Step 5: Commit** — `feat(blog): scaffold the blog subdomain app`

---

### Task 2: `@repo/content` — posts, validation, feeds, links, SEO helpers

**Files:**
- Create: `packages/content/{package.json,tsconfig.json,README.md}`,
  `packages/content/src/{schema,posts,feeds,links,seo}.ts` and a `*.test.ts` beside each.
- Modify: root `package.json` (`typecheck` and `test:services` gain `--filter @repo/content`).

**Interfaces — Produces** (exports are subpaths, like `@repo/telemetry`):

```ts
// @repo/content/schema
export const TAG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
export const SLUG_PATTERN = TAG_PATTERN
export const postFrontmatterSchema: z.ZodObject<…> // fields in Global Constraints; date/updated z.coerce.date(); type z.string().min(1).default("Blog Post")
export type PostFrontmatter = z.infer<typeof postFrontmatterSchema>
export interface Author { name: string; bio: string; avatar: string; links?: { label: string; href: string }[] }

// @repo/content/posts
export interface PostInput {
  file: string            // repo-relative path, for error messages
  slug: string
  frontmatter: PostFrontmatter
  text: string            // plain text of the body (reading time)
  links: string[]         // every href in the body
}
export interface Post extends PostFrontmatter { slug: string; url: string; readingMinutes: number }
export interface BlogOptions { mode: "production" | "development"; now: Date }
export class ContentError extends Error { problems: string[] } // message lists every problem, one per line
export function createBlog(inputs: PostInput[], authors: Record<string, Author>, options: BlogOptions): Blog
export interface Blog {
  posts(): Post[]                          // published, newest first (date desc, then slug)
  post(slug: string): Post | undefined
  page(n: number, size?: number): { posts: Post[]; page: number; pages: number } // size default 12; pages ≥ 1
  tags(): { tag: string; count: number }[] // by count desc, then tag
  byTag(tag: string): Post[]
  authors(): string[]                      // keys with ≥ 1 published post
  byAuthor(key: string): Post[]
  author(key: string): Author | undefined
  related(slug: string, limit?: number): Post[] // limit default 3
  neighbours(slug: string): { newer?: Post; older?: Post }
}
export function readingMinutes(text: string): number // ceil(words / 200), minimum 1

// @repo/content/feeds
export interface FeedSite { title: string; description: string; url: string } // url = siteUrl("blog")
export interface FeedEntry { post: Post; html: string; authorName: string }
export function rssFeed(site: FeedSite, entries: FeedEntry[]): string
export function atomFeed(site: FeedSite, entries: FeedEntry[]): string
export function jsonFeed(site: FeedSite, entries: FeedEntry[]): string

// @repo/content/links
export function checkLinks(input: { file: string; links: string[] }[], known: {
  paths: Set<string>      // blog paths that exist ("/", "/a-post", "/tags/x", "/authors/y", "/rss.xml", …)
  hosts: Set<string>      // hosts of every SITES app, e.g. "docs.brand.localhost:3004"
  ownHost: string         // the blog's host
}): string[]              // problems; [] when clean

// @repo/content/seo
export function blogPostingJsonLd(post: Post, author: Author, url: string): string // JSON, every "<" written as the six characters \u003c
```

Rules `createBlog` enforces — collect ALL problems, then throw one `ContentError` (message: `"Content
errors:\n- <file>: <problem>"` per line) if any:
- frontmatter re-validated with `postFrontmatterSchema` (problems name the field);
- `slug` must match `SLUG_PATTERN` (`<file>: slug "My Post" must be lowercase kebab-case`);
- each tag must match `TAG_PATTERN` (`<file>: tag "Next.js" must be lowercase kebab-case`);
- `author` must be a key of `authors` (`<file>: unknown author "x"`);
- duplicate slugs (`<file>: duplicate slug "x" (also <other file>)`).
Published filter: in `production`, drop `draft: true` and posts whose UTC calendar day is after
`now`'s UTC calendar day (a post dated today is published); in `development` keep everything.
Related: candidates share ≥ 1 tag with the post, sorted by shared-tag count desc, then date desc;
never the post itself.

- [ ] **Step 1: Failing tests** (one `*.test.ts` per module):
  - schema: a valid frontmatter parses (dates become `Date`; `type` defaults to `"Blog Post"`, an
    explicit `type: Article` is kept, `type: ""` is refused); a bad date and a missing title are
    refused; an unknown extra key is refused (the schema is strict); `cover` without `alt` refused.
  - posts: `createBlog` throws `ContentError` listing every problem at once (bad slug `My Post`,
    tag `Next.js`, unknown author, duplicate slug); production drops a draft and a post dated
    tomorrow but keeps one dated today (pass `now` at 23:30 UTC and a date of the same day);
    development keeps all; ordering newest first; `page(2)` with 13 posts returns 1 post and
    `pages: 2`; `page(1)` with 0 posts returns `{ posts: [], page: 1, pages: 1 }`; `related` ranks
    by shared tags then date and excludes itself; `neighbours` of newest has no `newer`;
    `readingMinutes("")` is 1 and 400 words is 2.
  - feeds: each of the three feeds parses back (RSS/Atom via a minimal check that the string is
    well-formed — use `new DOMParser()` is unavailable in Bun, so assert no unescaped `&`/`<` in text
    nodes by round-tripping titles containing `& < > " '` through a regex extractor, and wrap
    `html` in CDATA with `]]>` split); JSON Feed `JSON.parse`s with `version`
    `"https://jsonfeed.org/version/1.1"`; zero entries yields valid empty feeds.
  - links: a relative link to a missing path is reported with its file; an absolute link to an
    unknown subdomain of the site domain is reported; an external `https://example.org` is fine;
    `#anchor` and `mailto:` are ignored; `/tags/x?y=1#z` matches `/tags/x`.
  - seo: JSON-LD contains `"@type":"BlogPosting"`, `datePublished`, `dateModified` (falls back to
    date), author name, and a title containing `</script>` comes out as `\u003c/script>` (no raw `</script>`), and `JSON.parse` gives the title back.
- [ ] **Step 2: Run** `cd packages/content && bun test` — FAIL (modules missing).
- [ ] **Step 3: Implement.** `package.json`:

```json
{
  "name": "@repo/content",
  "version": "0.1.0",
  "description": "Content helpers shared by the blog and docs: posts, feeds, links, SEO",
  "type": "module",
  "private": true,
  "exports": {
    "./schema": "./src/schema.ts",
    "./posts": "./src/posts.ts",
    "./feeds": "./src/feeds.ts",
    "./links": "./src/links.ts",
    "./seo": "./src/seo.ts"
  },
  "scripts": { "typecheck": "tsc --noEmit", "test": "bun test" },
  "dependencies": { "zod": "catalog:" },
  "devDependencies": { "@repo/typescript-config": "workspace:*", "@types/bun": "catalog:" }
}
```

  `tsconfig.json` as `packages/sites/tsconfig.json`. The package stays free of React, Next and
  fumadocs (Ruling: F2 adds the fumadocs-core page-tree/search wrappers here). Escape XML text with
  `&amp; &lt; &gt; &quot; &apos;`; put HTML bodies in `<![CDATA[…]]>` replacing `]]>` with
  `]]]]><![CDATA[>`. RSS items: `title`, `link`, `guid isPermaLink="true"`, `pubDate`
  (`toUTCString()`), `description`, `content:encoded`. Atom entries: `id`, `title`, `link`,
  `published`, `updated`, `author/name`, `summary`, `content type="html"`.
- [ ] **Step 4: Run** `cd packages/content && bun test`, `bun run typecheck`, `bunx biome ci .`.
- [ ] **Step 5: Commit** — `feat(content): posts, feeds, link checks and JSON-LD for the blog`

---

### Task 3: MDX components and blog blocks in `@repo/ui`

**Files:**
- Create: `packages/ui/src/components/mdx/{index.tsx,heading.tsx,code-block.tsx,callout.tsx,tabs.tsx,steps.tsx,mdx-image.tsx}`
  (+ `mdx.test.tsx`), `packages/ui/src/styles/shiki.css` (imported from `globals.css`),
  `packages/ui/src/blocks/{post-card,post-header,toc,prev-next}.tsx` (+ one test file
  `blog-blocks.test.tsx`), stories `apps/story/stories/{Mdx,PostCard,PostHeader,Toc,PrevNext}.stories.tsx`.
- Modify: `packages/ui/package.json` exports (`"./components/mdx": "./src/components/mdx/index.tsx"`
  if the wildcard export does not already cover a folder index — check how `charts` is exported and
  copy that), `packages/ui/src/styles/globals.css` (`@import "./shiki.css";`).

**Interfaces — Produces:**

```ts
// @repo/ui/components/mdx
export const mdxComponents: Record<string, ComponentType<any>> // h2–h4 → Heading, pre → CodeBlock, img → MdxImage, a → link (external: rel="noreferrer" target unset), Callout, Tabs, Tab, Steps, Step
export function Heading(props: { as: "h2" | "h3" | "h4"; id?: string; children: ReactNode }): ReactElement // anchor link "#id" with aria-label "Link to this section"
export function CodeBlock(props: ComponentProps<"pre"> & { title?: string }): ReactElement // client: copy button (aria-label "Copy code"), works as plain <pre> without JS
export function Callout(props: { type?: "note" | "tip" | "warning"; title?: string; children: ReactNode }): ReactElement // role="note"
export function Tabs(props: { items: string[]; children: ReactNode }): ReactElement // without JS every tab panel is visible with its label as a heading
export function Tab(props: { value: string; children: ReactNode }): ReactElement
export function Steps(props: { children: ReactNode }): ReactElement // an <ol> with step counters
export function MdxImage(props: ComponentProps<"img">): ReactElement // requires width/height; loading="lazy", decoding="async"
// @repo/ui/blocks/post-card
export function PostCard(props: { href: string; title: string; description: string; date: Date; readingMinutes: number; author: { name: string; avatar: string }; tags: { tag: string; href: string }[]; featured?: boolean }): ReactElement
// @repo/ui/blocks/post-header
export function PostHeader(props: { title: string; description: string; date: Date; updated?: Date; readingMinutes: number; author: { name: string; avatar: string; href: string }; tags: { tag: string; href: string }[]; cover?: { src: string; alt: string } }): ReactElement
// @repo/ui/blocks/toc
export function Toc(props: { items: { title: ReactNode; url: string; depth: number }[]; label?: string }): ReactElement | null // null for []; <nav aria-label="On this page">
// @repo/ui/blocks/prev-next
export function PrevNext(props: { prev?: { href: string; title: string; label?: string }; next?: { href: string; title: string; label?: string } }): ReactElement | null
```

Dates render as `<time dateTime="YYYY-MM-DD">` formatted `en-US` `{ year: "numeric", month: "short",
day: "numeric", timeZone: "UTC" }` (server and client agree in any zone). Shiki CSS (light by
default, dark under `.dark`):

```css
.shiki,
.shiki span {
  color: var(--shiki-light);
  background-color: var(--shiki-light-bg);
}
.dark .shiki,
.dark .shiki span {
  color: var(--shiki-dark);
  background-color: var(--shiki-dark-bg);
}
```

- [ ] **Step 1: Failing tests** via `renderToStaticMarkup`: `Heading` renders the anchor with the
  id; `Callout` has `role="note"`; `Tabs` server render shows every panel; `Toc` returns `null` for
  `[]` and nests depth-3 items; `PostCard` renders `<time dateTime="2026-10-07">` and the
  reading-time text "3 min read"; `PrevNext` renders nothing with neither link; `MdxImage` keeps
  `width`/`height`.
- [ ] **Step 2: Run** `cd packages/ui && bun test src/components/mdx src/blocks/blog-blocks.test.tsx`
  — FAIL.
- [ ] **Step 3: Implement** with existing primitives (`button`, `badge`, `avatar`, `card`, `tabs`
  from `@repo/ui/components`), `cn()`, Tailwind tokens only; stories with representative props.
- [ ] **Step 4: Run** `cd packages/ui && bun test`, `bun run --filter @repo/ui typecheck`,
  `bunx biome ci .`.
- [ ] **Step 5: Commit** — `feat(ui): MDX components and blog blocks`

---

### Task 4: The blog's content pipeline

**Files:**
- Create: `apps/blog/source.config.ts`, `apps/blog/src/lib/source.ts`, `apps/blog/src/lib/blog.ts`
  (+ `blog.test.ts`), `apps/blog/content/authors.ts`, `apps/blog/content/posts/welcome.mdx`,
  `apps/blog/public/authors/team.svg` (a simple avatar).
- Modify: root `package.json` (`catalog`: `"fumadocs-mdx": "15.4.6"`, `"fumadocs-core": "16.16.2"`;
  `test:services` gains `--filter @repo/blog`), `apps/blog/package.json` (deps `fumadocs-mdx`,
  `fumadocs-core`, `@repo/content` `workspace:*`, `zod` `catalog:`; script `"postinstall":
  "fumadocs-mdx"`; `"test": "bun test"`), `apps/blog/next.config.mjs`, `apps/blog/tsconfig.json`
  (`"collections/*": ["./.source/*"]` next to `"@/*"`), `apps/blog/.gitignore` (`/.source/`).

**Interfaces — Consumes:** `postFrontmatterSchema`, `createBlog`, `PostInput`, `Author`,
`checkLinks` (Task 2). **Produces:**

```ts
// apps/blog/src/lib/blog.ts
export const blog: Blog                     // createBlog(...) over every page, validated once per process
export function postPage(slug: string): Page | undefined // the fumadocs page (body component, toc)
export function knownPaths(b: Blog): Set<string> // "/", "/page/<n>", "/<slug>", "/tags/<t>", "/authors/<a>", "/rss.xml", "/atom.xml", "/feed.json"
```

`source.config.ts`:

```ts
import { postFrontmatterSchema } from "@repo/content/schema"
import { rehypeCodeDefaultOptions } from "fumadocs-core/mdx-plugins"
import { defineCollections, defineConfig } from "fumadocs-mdx/config"

export const posts = defineCollections({
  type: "doc",
  dir: "content/posts",
  schema: postFrontmatterSchema,
})

export default defineConfig({
  mdxOptions: {
    rehypeCodeOptions: {
      ...rehypeCodeDefaultOptions,
      themes: { light: "github-light", dark: "github-dark" },
    },
  },
})
```

`src/lib/source.ts`:

```ts
import { posts } from "collections/server"
import { loader } from "fumadocs-core/source"
import { toFumadocsSource } from "fumadocs-mdx/runtime/server"

export const source = loader({ baseUrl: "/", source: toFumadocsSource(posts, []) })
```

`src/lib/blog.ts` maps `source.getPages()` to `PostInput`: `slug` = `page.slugs[0]`, `file` =
`apps/blog/content/posts/<file>`, `frontmatter` from `page.data`, `text` from
`page.data.structuredData.contents.map((c) => c.content).join(" ")`, `links` = every
`](target)` and `href="target"` in the raw MDX source read with `node:fs` from
`content/posts/<file>` (fumadocs does not keep the raw source). `mode` =
`process.env.NODE_ENV === "production" ? "production" : "development"`, `now` = `new Date()` at
module load. After `createBlog`, run `checkLinks` with `knownPaths(blog)` and every `SITES` host
from `siteUrl(id)`; on problems throw `ContentError` — imported by every page, so a bad post fails
`next build`.

`next.config.mjs`: `import { createMDX } from "fumadocs-mdx/next"`, `const withMDX = createMDX()`,
export `withBundleAnalyzer(withSerwist(withMDX(nextConfig)))`; add `"@repo/content"` to
`transpilePackages`.

Starter content: `authors.ts` exports `authors: Record<string, Author>` with key `team` (name
`` `${BRAND_NAME} team` ``, importing `BRAND_NAME` from `@repo/sites/brand`), bio "The people building this product.", avatar `/authors/team.svg`.
`welcome.mdx` (author `team`, tags `[announcements, guides]`, date `2026-10-07`): "Welcome to the
blog" — two `##` sections, a `Callout`, a fenced `ts` code block, and links to `/tags/guides` and to
`siteUrl("docs")`-style absolute docs URL `http://docs.brand.localhost:3004/` (allowed: known host).

- [ ] **Step 1: Failing tests** (`blog.test.ts`): `knownPaths` for a blog with one post tagged `a`
  by `team` returns exactly the paths listed above (with `/page/<n>` only for n ≥ 2);
  `extractLinks(source)` (export it from `blog.ts`) finds markdown and `href=` links and ignores
  code fences.
- [ ] **Step 2: Run** `cd apps/blog && bun test` — FAIL.
- [ ] **Step 3: Implement.** Run `bun install` (generates `.source`).
- [ ] **Step 4: Run** `cd apps/blog && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `bun --filter @repo/blog build`. Then prove the build gate: temporarily set `author: nobody` in
  `welcome.mdx`, confirm `next build` fails naming the file and the author, revert.
- [ ] **Step 5: Commit** — `feat(blog): compile MDX posts with fumadocs and validate them at build`

---

### Task 5: Blog pages — list, post, tags, authors

**Files:**
- Create: `apps/blog/src/app/page.tsx` (replace), `apps/blog/src/app/page/[n]/page.tsx`,
  `apps/blog/src/app/[slug]/page.tsx`, `apps/blog/src/app/[slug]/opengraph-image.tsx`,
  `apps/blog/src/app/tags/[tag]/page.tsx`, `apps/blog/src/app/authors/[author]/page.tsx`, views
  `apps/blog/src/views/{post-list-view,post-view,tag-view,author-view}.tsx` (+ `views.test.tsx`).
- Delete: `apps/blog/src/views/home-view.tsx`.

**Interfaces — Consumes:** `blog`, `postPage` (Task 4); `PostCard`, `PostHeader`, `Toc`,
`PrevNext`, `mdxComponents` (Task 3); `blogPostingJsonLd` (Task 2); `ogImage` (`@repo/ui/lib/og`).

Behaviour:
- `/` and `/page/[n]`: `PostListView({ posts, page, pages, heading? })` — the first post on page 1
  is `featured`; pagination links "Newer posts" / "Older posts" as plain `<a>`/`Link`; zero posts →
  an empty state "No posts yet." `page/[n]`: `generateStaticParams` for 2..pages,
  `dynamicParams = false`.
- `/[slug]`: `generateStaticParams` from `blog.posts()`, `dynamicParams = false`,
  `generateMetadata` (title, description, `alternates.canonical`, `openGraph: { type: "article",
  publishedTime, modifiedTime, tags }`); `PostView` renders `PostHeader`, a two-column layout with
  `Toc` on `lg` only when the post has headings (no headings → single column, no empty aside), the
  MDX body (`<Mdx components={mdxComponents} />`), `PrevNext` (newer/older), a "Related posts" row
  of up to 3 `PostCard`s (hidden when none), and `<script type="application/ld+json">` from
  `blogPostingJsonLd`.
- `[slug]/opengraph-image.tsx`: `generateStaticParams` like the page, `ogImage({ title:
  post.title, subtitle: "Blog" })`.
- `/tags/[tag]` and `/authors/[author]`: static params from `blog.tags()` / `blog.authors()`,
  `dynamicParams = false`, `PostListView` with a heading ("Posts tagged guides" / the author's name
  and bio).

- [ ] **Step 1: Failing tests** (`views.test.tsx`, `renderToStaticMarkup` with fixture posts — no
  fumadocs): `PostListView` with 0 posts shows "No posts yet."; page 1 marks the first card
  featured; `PostView` for a post without headings renders no `nav[aria-label="On this page"]` and
  no aside; with headings it does; the JSON-LD script is present and contains no raw `</script>`
  inside it; related row hidden when empty.
- [ ] **Step 2: Run** `cd apps/blog && bun test` — FAIL.
- [ ] **Step 3: Implement.** Pages stay thin (CLAUDE.md layering).
- [ ] **Step 4: Run** `cd apps/blog && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `bun --filter @repo/blog build` — routes `○`/`●` only; `bun --filter @repo/blog start` and
  check `/`, `/welcome`, `/tags/guides`, `/authors/team` answer 200 and `/nope` 404 (curl with the
  hostname).
- [ ] **Step 5: Commit** — `feat(blog): post list, posts, tags and authors`

---

### Task 6: Feeds, sitemap and robots

**Files:**
- Create: `apps/blog/src/app/{rss.xml,atom.xml,feed.json}/route.ts`,
  `apps/blog/src/lib/feed-entries.ts` (+ `feed-entries.test.tsx`), `apps/blog/src/lib/sitemap.ts`
  (+ `sitemap.test.ts`).
- Modify: `apps/blog/src/app/sitemap.ts`, `apps/blog/src/app/robots.ts`,
  `apps/blog/src/lib/routes.ts`, `apps/blog/src/app/layout.tsx` (`alternates.types` for the three
  feeds).

**Interfaces — Consumes:** `rssFeed`, `atomFeed`, `jsonFeed` (Task 2), `blog`, `postPage` (Task 4),
`mdxComponents` (Task 3), `sitemapFor`, `robotsFor`, `siteUrl` (`@repo/sites`).

- `feedEntries(blog, render)` builds `FeedEntry[]` from `blog.posts()`; `render(slug)` returns the
  post's HTML via `renderToStaticMarkup(<Mdx components={mdxComponents} />)` (the route handlers
  pass the real renderer; tests pass a stub). If `react-dom/server` cannot be imported in a route
  handler under Next 16, render with `renderToReadableStream` and read it to a string instead —
  record which in the report. Each route: `export const dynamic = "force-static"`, correct
  `content-type` (`application/rss+xml; charset=utf-8`, `application/atom+xml; charset=utf-8`,
  `application/feed+json; charset=utf-8`).
- `blogSitemap(blog, env?)`: `sitemapFor("blog", PUBLIC_ROUTES, env)` for the static routes
  (`["/"]`) plus one entry per post (`lastModified` = updated ?? date), tag page, author page and
  list page n ≥ 2. `robots.ts` stays `robotsFor("blog")` (allow everything) and names the sitemap.

- [ ] **Step 1: Failing tests:** `blogSitemap` with `{ SITE_DOMAIN: "example.com" }` lists
  `https://blog.example.com/`, the post, its tag and author pages, and with zero published posts
  only `/`; `feedEntries` excludes nothing that `blog.posts()` returns and uses the author's name.
- [ ] **Step 2: Run** `cd apps/blog && bun test` — FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** `cd apps/blog && bun test`; `bun run typecheck`; `bunx biome ci .`;
  `bun --filter @repo/blog build` (feeds `○`); start and `curl` the three feeds (well-formed, the
  welcome post present with full HTML).
- [ ] **Step 5: Commit** — `feat(blog): RSS, Atom and JSON feeds and the sitemap`

---

### Task 7: e2e, docs, full gate

**Files:**
- Create: `apps/e2e/tests/blog.spec.ts`, `docs/guides/content.md`, `packages/content/README.md`
  (if not complete from Task 2).
- Modify: `apps/e2e/playwright.config.ts` (`next("blog", 3009)`), `apps/e2e/package.json` (`e2e`
  script builds `@repo/blog` too), `scripts/ci-plan.ts` (`E2E_TARGETS` gains `@repo/blog`;
  `ci-plan.test.ts` case), `.github/workflows/ci.yml` e2e job's build step and `/etc/hosts` line if
  they list the apps explicitly (check), `apps/e2e/README.md`, CLAUDE.md, `apps/blog/README.md`,
  `docs/guides/deploying.md`.

- [ ] **Step 1: e2e** (`blog.spec.ts`): the list shows "Welcome to the blog"; opening it shows the
  heading, a code block and the table of contents; the tag link opens `/tags/guides` listing the
  post; `/authors/team` lists it; `GET /rss.xml` answers 200 with `application/rss+xml` and contains
  the post title; a second context with `javaScriptEnabled: false` loads `/welcome` and finds the
  heading, the body text and the header nav links.
- [ ] **Step 2: Docs.**
  - CLAUDE.md:
    - Commands: `bun --filter @repo/blog dev` on blog.brand.localhost:3009.
    - Apps: an `apps/blog` line.
    - Packages: a `packages/content` line.
    - A **Content.** paragraph in the house style: MDX in the repo, fumadocs-mdx + fumadocs-core
      headless, `@repo/content` (what each subpath does), `@repo/ui/components/mdx` and the blog
      blocks, frontmatter, drafts and scheduling (production builds only; publish = merge +
      redeploy), the build gate, feeds, SEO, no runtime api dependency, F2 coming for `apps/docs`.
    - "Adding a new subdomain app": mention `.source` / `postinstall` for content apps.
    - The Docker command list: 10 apps.
    - The e2e counts (`bunx playwright test --list`).
  - `docs/guides/content.md`: writing a post (file name = slug, frontmatter table), authors,
    tags, drafts and scheduling, components with examples, images (`public/`, width/height),
    feeds, what fails the build and how to read the error, replacing the starter post.
  - `apps/blog/README.md`, `packages/content/README.md`, `apps/e2e/README.md`, and the deploying
    guide (the blog subdomain and its build args).
- [ ] **Step 3: Full gate** — `bun run ci` exit 0; build www, app, auth, account, blog;
  `cd apps/e2e && CI=1 bunx playwright test --retries=0` — every test passes.
- [ ] **Step 4: Commit** — `test(e2e): blog journey` and `docs: blog and content guide` (two
  commits).
