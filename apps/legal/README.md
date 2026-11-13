# @repo/legal

Legal — Next.js 16 on legal.brand.localhost:3010 in development, `legal.brand.com` in production.

The one home for the site's legal text, in Swedish and English, in the same look as `apps/www`:
privacy and cookies, terms and booking rules, the accessibility statement, and company and contact
details. A fully static shell for MDX pages on their own subdomain, shaped like `apps/blog`: every
route is prerendered at build time, with no runtime call to `apps/api` except the shared
telemetry/analytics routes every app has.

```bash
bun --filter @repo/legal dev       # http://legal.brand.localhost:3010
bun --filter @repo/legal build     # standalone output for docker/next.Dockerfile
bun --filter @repo/legal analyze   # bundle report in .next/analyze/
```

## Routes

Swedish is served at the root, English under `/en`. The page slugs are `LEGAL_PAGES` in
`@repo/sites/legal`; other apps link here through `legalUrl(page, locale)`, never a hard-coded path.

| Route | What |
|---|---|
| `/`, `/en` | The index: the four pages in that language, as cards in the blog's look (`PageCard`) |
| `/integritet`, `/en/privacy` | Privacy and cookies |
| `/villkor`, `/en/terms` | Terms and booking rules |
| `/tillganglighet`, `/en/accessibility` | Accessibility statement |
| `/foretaget`, `/en/company` | Company and contact details |

Each page's contents list (its h2/h3 headings, then the change log) marks the section being read
(`TocActive`): inline above the body below `lg`, a sticky right-hand column below the header from
`lg`.

Every app also serves `/offline.html` (the PWA fallback page, a static file in `public/`) and
`/api/health` (used by the Docker health check).

## Two languages, statically

As in the blog, `<html lang>` belongs to the root layout and a static page cannot learn its
language from the request, so each language has its own root layout: `src/app/(sv)/layout.tsx`
and `src/app/(en)/layout.tsx`, two route groups that both render `LegalDocument`
(`src/components/legal-document.tsx`). Its footer's legal line and the cookie banner link to this
app's own pages in the page's language. There is no layout above an unmatched URL, so
`next.config.mjs` turns on `experimental.globalNotFound` and `src/app/global-not-found.tsx`
renders the 404 as a whole document, in Swedish with an English line linking to `/en`.
`src/app/not-found.tsx` stays the file every static app shares.

## Where things go

- **`content/pages/*.mdx`** — the pages: `<slug>.mdx` with `locale: sv`, `en-<slug>.mdx` with
  `locale: en`, each naming its `page` (a `LEGAL_PAGES` key) and a `changes` log (newest first, at
  least one entry). Compiled by fumadocs-mdx (`source.config.ts`) against `@repo/content`'s
  `legalFrontmatterSchema`, imported by relative path.
- **`src/lib/legal.ts`** — `legal`, every page validated by `createLegal` when the module loads,
  so a bad page (frontmatter, a missing language, a change log out of step with its translation, a
  malformed placeholder, a body `# h1`) fails `next build`. `src/lib/pages.tsx` holds the route
  factories each `page.tsx` is a few lines over.
- **Placeholders** — write `[ATT FYLLA: …]` in Swedish and `[TO FILL: …]` in English.
  `src/lib/remark-placeholders.ts` turns each into a `<mark data-placeholder>`, rendered as
  `@repo/ui`'s `Placeholder`. A production build does not fail on them.
- **Draft mode** — `LEGAL_DRAFT` (build time; on unless set to `false`, `src/lib/draft.ts`). While
  on, every page shows `DraftNotice`, every page sends `noindex, nofollow` and `robots.txt`
  disallows `/`. Images take it as a build arg (`docker/next.Dockerfile`'s `LEGAL_DRAFT`, passed by
  both Compose files and the GHCR workflow), so leaving draft mode is a rebuild. Turn it off only
  once a lawyer has approved the text and `bun run placeholders` lists none.
- **`src/content/ui.ts`** — the app's own words in both languages; `src/content/legal-meta.ts`
  holds its name and description with no imports, for the manifest.
- **Styles** — `src/styles/globals.css` is the one import of `@repo/ui/globals.css`. See
  `docs/architecture/design-system.md`.

See [`docs/architecture/legal.md`](../../docs/architecture/legal.md) for how the app fits the rest
of the site (links, redirects, the terms version, checks, staging), the root
[README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by all apps,
and [`packages/content/README.md`](../../packages/content/README.md) for `createLegal`.
