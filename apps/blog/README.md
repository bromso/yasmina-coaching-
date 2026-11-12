# @repo/blog

Blog — Next.js 16 on blog.brand.localhost:3009 in development, `blog.brand.com` in production.

Yasmina Petersson's notes on leadership, coaching and mentoring, in Swedish and English, in the
same look as `apps/www`. A fully static shell for MDX posts on their own subdomain: every route is
prerendered at build time (`○`/`●` in `next build`'s output), with no runtime call to `apps/api`
except the shared telemetry/analytics routes every app has.

```bash
bun --filter @repo/blog dev       # http://blog.brand.localhost:3009
bun --filter @repo/blog build     # standalone output for docker/next.Dockerfile
bun --filter @repo/blog analyze   # bundle report in .next/analyze/
```

## Routes

Swedish is served at the root, English under `/en`; every list, tag, author and feed route exists
once per language and lists only that language's posts.

| Route | What |
|---|---|
| `/`, `/en` | The index: a hero, then the newest posts (12 per page, the newest featured) |
| `/page/<n>`, `/en/page/<n>` | The index's further pages |
| `/<slug>`, `/en/<slug>` | One post: cover, header, body, table of contents, a call to action (www's contact page, `/kontakt`), newer/older links, related posts, BlogPosting JSON-LD (with `inLanguage`), OG/Twitter images, and hreflang links to its translation |
| `/tags/<tag>`, `/en/tags/<tag>` | Every published post of that language with that tag, unpaginated |
| `/authors/<author>`, `/en/authors/<author>` | Every published post of that language by that author, unpaginated |
| `/rss.xml`, `/atom.xml`, `/feed.json` and the same under `/en/` | Full-content feeds per language (RSS 2.0, Atom, JSON Feed 1.1), each naming its language |

`/sitemap.xml` lists both languages, with hreflang alternates for the two indexes and every
translated post. Every app also serves `/offline.html` (the PWA fallback page, a static file in
`public/`) and `/api/health` (used by the Docker health check).

## Two languages, statically

`<html lang>` belongs to the root layout, and a static page cannot learn its language from the
request, so each language has its own root layout: `src/app/(sv)/layout.tsx` and
`src/app/(en)/layout.tsx`, two route groups that both render `BlogDocument`
(`src/components/blog-document.tsx`). Crossing between them is a full page load, which the
language link is anyway. Two consequences:

- **The header is rendered by each page** (`PageHeader`), not the layout: its language link points
  at the page's own translation, or the other language's index, which a layout cannot know. That
  link (`LanguageLink`, a small client component) stays a real link without JavaScript and, on
  click, writes the shared `locale` cookie (`@repo/i18n/cookie`, `COOKIE_DOMAIN` passed down from
  the server), so the header's links into www open in the reader's language.
- **There is no layout above an unmatched URL**, so `next.config.mjs` turns on
  `experimental.globalNotFound` and `src/app/global-not-found.tsx` renders the 404 as a whole
  document, in Swedish with an English line linking to `/en`. `src/app/not-found.tsx` stays the file every static app shares.

The pages themselves are a few lines each over the factories in `src/lib/pages.tsx`, once per
language. Every word the chrome says is in `src/content/ui.ts` (`UI.sv`, `UI.en`); the shared
pieces (skip link, theme toggle, nav landmarks, cookie banner, footer) come from `@repo/i18n`'s
`ui` catalog.

## Writing a post

See [`docs/guides/content.md`](../../docs/guides/content.md) for the full guide: frontmatter,
languages and translations, the author, covers, tags, drafts and scheduling, the components
available in a post's body, links to www, images and what fails the build. The short version:
add an `.mdx` file directly under `content/posts/` — `<slug>.mdx` with `locale: sv` for a Swedish
post, `en-<slug>.mdx` with `locale: en` and `translationOf: <swedish-slug>` for its English
version, served at `/en/<slug>` — and `postinstall` (`fumadocs-mdx`) compiles it. `next dev`
picks up a new or edited post on save, `next build` regenerates `.source/` (gitignored) from
scratch, and a build fails rather than ships broken content: a frontmatter, author, tag, slug,
language, translation or nesting problem fails it for any post (drafts included), and a broken
link or missing image fails it for any post that would actually publish.

The blog ships ten posts by Yasmina in Swedish, each with its English translation (see
`docs/guides/content.md` for which ones tests reference by name).

## Where things go

- **`content/posts/*.mdx`** — the posts, compiled by fumadocs-mdx (`source.config.ts`) against
  `@repo/content/schema`'s frontmatter schema.
- **`content/authors.ts`** — every author a post's `author` field may name (today `yasmina`), each
  bio in both languages (`authorsFor(locale)`).
- **`content/media.ts`** — the cover photos under `public/media/` (`<name>-800.jpg` and `.webp`,
  copied from www), their sizes and www's alt text in both languages.
- **`src/content/ui.ts`** — the blog's own words in both languages, `TAG_LABELS` (how each
  language's ASCII tag slugs read), plus `BLOG_LOCALES`, `ROOT_LOCALE` and `prefixFor(locale)`
  (`""` or `/en`).
- **`src/lib/blog.ts`** / **`blog-core.ts`** — loads and validates every post once per process.
  `blog.ts` reads each post's raw MDX through `@repo/content/checks` (`extractLinks`,
  `extractImages`, `headingProblems`, passing `titleOwner: "post"`) before handing the result to
  `assembleBlog` (`blog-core.ts`, blog-specific: `knownPaths` for both languages,
  `nestingProblems`, `siteLinkProblems` for `www:/…` links and `coverProblems` for the WebP beside a
  `/media/` cover), which collects every problem it can find — `createBlog`'s own checks
  (frontmatter, author, tag, slug, language, translation, duplicates) included — into one thrown
  `ContentError`. `blog.inLocale(locale)` is one language's posts; `src/lib/source.ts` is the
  fumadocs loader underneath it.
- **`src/lib/site-links.ts`** / **`src/components/blog-link.tsx`** — a post's `www:/book` link,
  resolved to `siteUrl("www")` + `/book` at build time, in the page and in the feeds.
- **`src/lib/feed-render.ts`** / **`feed-entries.ts`** / **`feed-types.ts`** — render each
  published post's MDX body to full HTML (`react-dom/server.edge`, through
  `@repo/ui/components/mdx/static`) and build each language's three feeds from
  `@repo/content/feeds`.
- **`src/lib/sitemap.ts`** — `apps/blog/src/app/sitemap.ts`'s one call, deriving each entry's
  `lastModified` from the posts, tags and authors it actually covers.
- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui`'s blog blocks
  (`post-card`, `post-header`, `toc` inside `toc-active`, `prev-next`, each given the page's words,
  date locale and the coaching classes; each card shows the post's cover through `PostCard`'s
  `media` slot, the featured one larger on sun-soft) and MDX components
  (`@repo/ui/components/mdx`), plus the blog's own `Cover` / `CoverImage` and `CallToAction`.
- **Styles** — `src/styles/globals.css` imports `@repo/ui/globals.css`, then
  `@repo/ui/themes/coaching.css`, the palette, sun tokens and display serif www uses too; the
  layout adds `fontDisplay`. Fonts, theme, skip link and web vitals come from `@repo/ui`.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps, and [`packages/content/README.md`](../../packages/content/README.md) for the pure
schema/posts/feeds/links/seo helpers this app validates and renders with.
