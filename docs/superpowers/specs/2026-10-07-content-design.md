# Content: blog and docs engine — design

Sub-project F of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content → G i18n). Approved in chat section by section on
2026-10-07.

## Intent

The starter ships two content surfaces a founder needs from day one: a **blog** on its own
subdomain (the SEO channel every founder kit sells) and a **docs engine** that turns the empty
`apps/docs` shell into real product documentation. Both are written as MDX in the repo, build fully
static, need no keys, read without JavaScript, and look like the rest of the product because every
pixel comes from `@repo/ui`.

Decided with the owner:

- **One spec, two PRs** — F1: the shared content layer, the MDX components and `apps/blog`;
  F2 (after F1 merges, never stacked): the docs engine in `apps/docs`.
- **Source: MDX files in the repo** — no CMS, no database, no admin editor.
- **Engine: Fumadocs headless + our UI** — `fumadocs-mdx` and `fumadocs-core` for compiling,
  loading, the page tree, the table of contents and search; no `fumadocs-ui`.

## 1. Architecture

**`packages/content` (`@repo/content`, server-only)** — wraps `fumadocs-core`:

- the source loader, page tree, table of contents, previous/next and the static search index
- the shared frontmatter schemas (Zod 4):
  - blog post: `title`, `description`, `date`, `updated?`, `author` (a key of the app's
    `authors.ts`), `tags` (lowercase kebab-case), `cover?` (a `public/` path plus `alt`), `draft?`
  - docs page: `title`, `description`, `icon?`
- the helpers both apps use: the draft/scheduling filter, reading time, related posts, the feeds
  (RSS 2.0, Atom, JSON Feed 1.1) and the build-time link checker

Each app keeps a `source.config.ts` declaring its collections for `fumadocs-mdx`, which compiles
`content/` at build. Code blocks are highlighted by Shiki at build time with light and dark themes
mapped to our tokens — no highlighter ships to the browser.

**MDX components** — one shared map in `@repo/ui` (`@repo/ui/components/mdx`): headings with
anchor links, code blocks with a copy button and an optional file title, callouts, tabs, steps,
images with explicit `width` / `height`, and (docs) link cards. New blocks: post card, post
header, docs sidebar, table of contents, breadcrumbs, previous/next, search dialog.

**`apps/blog`** — a new static subdomain app on `blog.brand.localhost:3009` (prod
`blog.<domain>`), added through every step of "Adding a new subdomain app" in CLAUDE.md (`SITES`,
nav and footer, PWA of the public kind, security proxy, status pages, OG images, sitemap/robots,
telemetry, `<Analytics />`, consent banner, Docker, devcontainer, CI planner).

**`apps/docs`** — the existing shell becomes the docs engine (F2).

Both apps stay static (`○` in the build output) with no runtime dependency on `apps/api`.

## 2. The blog (F1)

**Routes**

| Route | Content |
|---|---|
| `/` | Newest first: one featured post, then post cards (title, description, date, reading time, author, tags); 12 per page |
| `/page/<n>` | Later pages of the list |
| `/<slug>` | The post: title, date (and updated), author with avatar, reading time, tags, optional cover, a table of contents on wide screens, the MDX body, previous/next, up to three related posts (most shared tags, then newest) |
| `/tags/<tag>` | Posts with that tag |
| `/authors/<key>` | One author's posts |
| `/rss.xml`, `/atom.xml`, `/feed.json` | Full-content feeds |

**Authors** — `apps/blog/content/authors.ts`: a typed record of key → `{ name, bio, avatar (a
public/ path), links }`.

**SEO** — per-post metadata (title, description, canonical, Open Graph `article` with published
and modified times), a per-post OG image from `ogImage({ title })`, `BlogPosting` JSON-LD, a
sitemap of posts, tags and authors, and `robots` allowing everything.

**Drafts and scheduling** — `draft: true` posts show under `next dev` only; a post dated in the
future is left out of production builds until a rebuild after its date (static scheduling,
documented). Neither appears in feeds or the sitemap.

**Validation (the build fails on)** — bad frontmatter, an unknown author, a malformed tag,
duplicate slugs, and a broken internal link (to another post, a docs page, or an app path checked
against `SITES`).

**Starter content** — one post adapted from a repo guide, one author.

**Out of scope** — comments, a newsletter form on posts (`www` has the waitlist), search in the
blog, i18n (G).

## 3. The docs engine (F2)

**Layout** — breadcrumbs; a left sidebar built from the content folders and `meta.json` files
(order, separators, collapsible groups), a `Sheet` below `md`; the page (title, description, MDX
body, "Edit on GitHub" when `CONTENT_REPO_URL` is set, last updated from frontmatter,
previous/next); a table of contents on the right with the current section highlighted, a plain
list of links without JavaScript.

**Search** — `fumadocs-core` builds a static index at build time, served by the docs app's own
statically generated `/api/search`; a ⌘K / Ctrl-K dialog searches it in the browser (headings and
text, results linking to the section anchor). No third-party service; the CSP stays
`connect-src 'self'`. Without JavaScript the search button links to a plain index of every page.

**Routes** — `/` is the docs landing (the shell's home becomes it), `/<...slug>` every page; a
sitemap from the page tree; an OG image per page.

**Starter content** — getting started, architecture, authentication, deploying, adding an app,
adapted from the repo's guides; owners replace them.

**Validation** — the same checker: bad frontmatter, a `meta.json` naming a missing page, broken
internal links.

**Out of scope** — versioned docs, an API reference generated from OpenAPI (`apps/api` serves
`/openapi`; a link is enough), i18n (G), AI "ask the docs".

## 4. Testing, operations, docs

**Testing**

- `@repo/content` unit tests: schemas (a bad date, an unknown author refused); the draft/future
  filter in production and dev; reading time; duplicate slugs and broken links caught; related
  posts ranking; RSS / Atom / JSON Feed well-formed (parsed back) and free of drafts; `meta.json`
  errors.
- Blog sitemap, robots and JSON-LD tests (as `www`'s sitemap tests).
- MDX components and new blocks: `renderToStaticMarkup` tests and Storybook stories.
- e2e on production builds: the blog list shows the starter post, the post opens, tag and author
  pages work, `/rss.xml` serves XML; docs (F2): navigate through the sidebar, ⌘K search finds a page
  and lands on its anchor, table-of-contents links work; both apps render their content and
  navigation with JavaScript disabled.
- Both apps build static; `scripts/` checks (PWA, Docker, VS Code, GitHub templates, CI planner)
  know about `blog`.

**Operations** — no new runtime env; `SITE_DOMAIN` and `COOKIE_DOMAIN` at build as for every
static app; optional build-time `CONTENT_REPO_URL` for "Edit on GitHub" (hidden when unset).
Docker: a `blog` service and a GHCR matrix row. Publishing = merge the MDX and redeploy
(documented).

**Docs** — CLAUDE.md (`apps/blog` in Apps and dev commands, `@repo/content` in Packages, a
**Content.** paragraph); READMEs for `apps/blog`, `apps/docs`, `packages/content`; a new
`docs/guides/content.md` (writing a post, authors, drafts and scheduling, a docs page, `meta.json`,
components, search, replacing the starter content); the deploying guide (the blog subdomain);
ROADMAP (tick F after F2).

## Out of scope

A CMS or database-backed content, an admin editor, comments, blog search, versioned docs,
OpenAPI-generated reference, AI search, i18n (sub-project G).
