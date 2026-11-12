# Legal

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Legal.** `apps/legal` is the one home for the site's legal text: privacy and cookies, terms and
booking rules, the accessibility statement, and company and contact details, each in Swedish and
English. Every other app links to it; nothing else renders legal text. The pages are drafts for a
lawyer's review until a build sets `LEGAL_DRAFT=false`.

## The app

A static content app shaped like `apps/blog` (see **Content**): MDX compiled at build time with
fumadocs-mdx over `@repo/content`, the shared look from `@repo/ui` and no app styling, one root
layout per language (route groups `(sv)` and `(en)`) for `<html lang>`, and
`global-not-found.tsx` for unmatched URLs. Dev: `legal.brand.localhost:3010`; production:
`legal.<domain>`. It is not in the cross-app `siteNav`; it is reached through every footer's legal
line and the cookie banner, and its own header links back to www. `apps/legal/README.md` has the
file layout.

| Swedish | English | Page |
|---|---|---|
| `/` | `/en` | The index: the four pages as cards, each with its newest change date |
| `/integritet` | `/en/privacy` | Privacy and cookies (the cookie list is its `#cookies` section) |
| `/villkor` | `/en/terms` | Terms and booking rules |
| `/tillganglighet` | `/en/accessibility` | Accessibility statement (voluntary; WCAG 2.2 AA) |
| `/foretaget` | `/en/company` | Company and contact details |

Each page has a right-hand table of contents that marks the section in view (`TocActive`,
inline above the body below `lg`) and ends with its change log.

## Content and the build gate

Pages are `apps/legal/content/pages/<slug>.mdx` (`locale: sv`) and `en-<slug>.mdx` (`locale: en`,
`translationOf`). The frontmatter (`legalFrontmatterSchema` in `@repo/content`, imported by
relative path from `source.config.ts`) holds `title`, `description`, `locale`, `page` (a key of
`LEGAL_PAGES`), `translationOf?` and `changes: { date, summary }[]`, newest first, at least one
entry. "Last updated" is always the newest entry; there is no separate field to drift.

`createLegal` (`packages/content/src/legal.ts`) validates every page when `src/lib/legal.ts`
loads, so `next build` fails on any of these, all reported at once in one `ContentError`: bad
frontmatter, an unknown `page`, changes out of order, a duplicate page in one language, a page
missing in either language, a translation whose newest change date differs from its source's, a
malformed placeholder, or a body `# h1`.

## Placeholders

A fact only Yasmina or a lawyer can supply is written `[ATT FYLLA: …]` in Swedish and
`[TO FILL: …]` in English, never invented. `src/lib/remark-placeholders.ts` turns each into a
`<mark data-placeholder>`, rendered by `@repo/ui`'s `Placeholder` so it cannot pass for final
text. `bun --filter @repo/legal placeholders` lists every open one (`<file>: <text>`, then the
count), through the same gate as the build. A production build does not fail on them: staging
must still deploy, and the list goes in the PR.

## Draft mode

`isDraft()` (`apps/legal/src/lib/draft.ts`) is true unless `LEGAL_DRAFT` is exactly `false`. It is
read at `next build` (every route is static), so changing it is a rebuild, never a restart. While
on:

- every page and both indexes show `DraftNotice` ("Utkast – granskas juridiskt" / "Draft – under
  legal review");
- every page sends `<meta name="robots" content="noindex, nofollow">`;
- `robots.txt` disallows `/`.

`docker/next.Dockerfile` takes `--build-arg LEGAL_DRAFT` in its builder stage (empty by default,
so drafts); `docker-compose.yml` and `deploy/dokploy/docker-compose.yml` pass
`${LEGAL_DRAFT:-}`, and the GHCR workflow `vars.LEGAL_DRAFT`. Dokploy's template starts it at
`true`. Turn it off only once a lawyer has approved the text and the placeholder list is empty.

## Links into the app

`@repo/sites/legal` holds `LEGAL_PAGES` (each page's slug per language), `legalPath(page,
locale)` and `legalUrl(page, locale)` (`siteUrl("legal")` plus the path). `legalUrl` reads
`SITE_DOMAIN`, so it runs on the server and the href is passed down as a prop. No app hard-codes a
legal path. Static apps link in the page's language, signed-in apps in the user's locale:

- every footer's `SiteFooterLegal` line (privacy, terms, accessibility);
- every app's cookie banner (`CookieConsent`'s `privacyHref`);
- `apps/auth`'s terms note on sign-in and sign-up;
- www's contact form and booking consent lines;
- the booking mails (`termsUrl`, see **Booking.**).

www's old `/privacy` and `/terms` are route handlers (`apps/www/src/app/{privacy,terms}/route.ts`
over `src/lib/legal-redirect.ts`), not pages: a permanent `308` to `legalUrl(page, locale)`, the
locale from the `locale` cookie as on every www page (`sv` → `/integritet`, `/villkor`; `en` →
`/en/privacy`, `/en/terms`). A redirect is not a page, so it needs no bundle budget and no a11y
manifest entry. Its target depends on the cookie, so it sends `Cache-Control: private, no-store`:
a 308 without freshness headers is cached by browsers indefinitely, and a reader who switched
language would keep landing on the old page. Neither the browser nor a shared cache keeps it
(pinned in `legal-redirect.test.ts` and `www.spec.ts`).

## Terms consent and the terms version

Every booking form asks for consent to the terms and privacy policy; a private client starting
within the withdrawal period also confirms that (see **Booking.** and
[booking.md](booking.md)). The api stamps each booking with `TERMS_VERSION`
(`@repo/api-contract/legal`), the terms page's newest change date. A new change-log entry on the
terms page must move `TERMS_VERSION` with it: `apps/legal/src/lib/terms-version.test.ts` fails
until it does.

## Checks

- `apps/legal`'s own tests (`bun test` there, in `bun run test:services`): the gate, draft mode,
  placeholders through MDX, the sitemap, the views, the two languages' parity and the terms
  version.
- `perf/budgets.json` `bundles.legal`: `/`, `/[slug]`, `/en` and `/en/[slug]`, measured with
  `bun scripts/bundle-budget.ts --write-results legal` and written by `bun run perf:update` (see
  **Performance**).
- The a11y manifest (`apps/e2e/a11y/routes.ts`) lists both indexes, all eight pages and the 404.
- `apps/e2e/tests/legal.spec.ts`: every page's h1, draft notice, `noindex` and language link; www's
  redirects followed in a browser; the cookie banner's privacy link; every footer legal link on
  www, the blog, auth and a signed-in account page. `booking.spec.ts` checks the consent boxes and
  the terms link in the confirmation mail; `chrome.spec.ts` covers the app's health route, CSP,
  site nav and skip link.

## Staging

`deploy/dokploy` runs `legal` like `blog`: port 3010, router `yasmina-legal` on
`${SITE_HOST_PREFIX}legal.${SITE_DOMAIN}` (staging: `yas-legal.undefined.guru`), behind the same
basic-auth lock and `X-Robots-Tag: noindex` middlewares. See `deploy/dokploy/README.md`.

## Scope

The drafts describe what runs at launch: www, the blog, auth, app, account, api and this app.
docs, help, jobs and ai are not deployed, so their data (support requests, job applications, the
AI chat) is not described; deploying one of them means updating the privacy page first. There is
no archive of earlier versions: the change log's summaries are the history, with full text in git.
