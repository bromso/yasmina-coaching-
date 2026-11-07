# @repo/blog

Blog — Next.js 16 on blog.brand.localhost:3009 in development, `blog.brand.com` in production.

A fully static shell for MDX posts on their own subdomain: every route is prerendered at build
time (`○`/`●` in `next build`'s output), with no runtime call to `apps/api` except the shared
telemetry/analytics routes every app has.

```bash
bun --filter @repo/blog dev       # http://blog.brand.localhost:3009
bun --filter @repo/blog build     # standalone output for docker/next.Dockerfile
bun --filter @repo/blog analyze   # bundle report in .next/analyze/
```

## Routes

| Route | What |
|---|---|
| `/`, `/page/<n>` | The post index, 12 posts per page, newest first |
| `/<slug>` | One post: header, body, table of contents, newer/older links, related posts, BlogPosting JSON-LD, OG/Twitter images |
| `/tags/<tag>` | Every published post with that tag, unpaginated |
| `/authors/<author>` | Every published post by that author, unpaginated |
| `/rss.xml`, `/atom.xml`, `/feed.json` | Full-content feeds (RSS 2.0, Atom, JSON Feed 1.1) |

Every app also serves `/offline.html` (the PWA fallback page, a static file in `public/`) and
`/api/health` (used by the Docker health check).

## Writing a post

See [`docs/guides/content.md`](../../docs/guides/content.md) for the full guide: frontmatter,
authors, tags, drafts and scheduling, the components available in a post's body, images and what
fails the build. The short version: add an `.mdx` file directly under `content/posts/`, its file
name becomes the slug, and `postinstall` (`fumadocs-mdx`) compiles it — `next dev` picks up a new
or edited post on save, `next build` regenerates `.source/` (gitignored) from scratch, and a build
fails rather than ships broken content: a frontmatter, author, tag, slug or nesting problem fails
it for any post (drafts included), and a broken link or missing image fails it for any post that
would actually publish — a draft's own links and images are not checked (see
`docs/guides/content.md`).

## Where things go

- **`content/posts/*.mdx`** — the posts, compiled by fumadocs-mdx (`source.config.ts`) against
  `@repo/content/schema`'s frontmatter schema.
- **`content/authors.ts`** — every author a post's `author` field may name.
- **`src/lib/blog.ts`** / **`blog-core.ts`** — loads and validates every post once per process.
  `blog.ts` reads each post's raw MDX through `@repo/content/checks` (`extractLinks`,
  `extractImages`, `headingProblems`, passing `titleOwner: "post"`) before handing the result to
  `assembleBlog` (`blog-core.ts`, blog-specific: `knownPaths` and `nestingProblems` too), which
  collects every problem it can find — `createBlog`'s own checks (frontmatter, author, tag, slug,
  duplicates), nesting, body h1s, and, for the posts that would publish, broken links and missing
  images (`cover` included, via `@repo/content/checks`'s `imageProblems`) — into one thrown
  `ContentError`, even when `createBlog` itself fails over an unrelated post; `src/lib/source.ts`
  is the fumadocs loader underneath it.
- **`src/lib/feed-render.ts`** / **`feed-entries.ts`** / **`feed-types.ts`** — render each
  published post's MDX body to full HTML (`react-dom/server.edge`, through
  `@repo/ui/components/mdx/static`) and build the three feeds from `@repo/content/feeds`.
- **`src/lib/sitemap.ts`** — `apps/blog/src/app/sitemap.ts`'s one call, deriving each entry's
  `lastModified` from the posts, tags and authors it actually covers.
- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui`'s blog blocks
  (`post-card`, `post-header`, `toc` inside `toc-active`, `prev-next`) and MDX components
  (`@repo/ui/components/mdx`). Pages in `src/app/` stay thin and just render a view.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts,
  theme, skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps, and [`packages/content/README.md`](../../packages/content/README.md) for the pure
schema/posts/feeds/links/seo helpers this app validates and renders with.
