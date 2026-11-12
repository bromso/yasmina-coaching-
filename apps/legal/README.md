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
| `/`, `/en` | The index: the four pages in that language |
| `/integritet`, `/en/privacy` | Privacy and cookies |
| `/villkor`, `/en/terms` | Terms and booking rules |
| `/tillganglighet`, `/en/accessibility` | Accessibility statement |
| `/foretaget`, `/en/company` | Company and contact details |

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
- **`src/content/ui.ts`** — the app's own words in both languages; `src/content/legal-meta.ts`
  holds its name and description with no imports, for the manifest.
- **Styles** — `src/styles/globals.css` is the one import of `@repo/ui/globals.css`. See
  `docs/architecture/design-system.md`.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps, and [`packages/content/README.md`](../../packages/content/README.md) for `createLegal`.
