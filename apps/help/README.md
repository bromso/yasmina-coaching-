# @repo/help

Help shell — Next.js 16 on help.brand.localhost:3005 in development, `help.brand.com` in production.

A help center: fumadocs-mdx over `content/articles/<category>/<article>.mdx`, headless (no
`fumadocs-ui`), fully static except its contact form — every other route is `○`/`●`, the shared
`/api/{analytics,health,telemetry}` handlers included. See CLAUDE.md's **Support.** paragraph for
the pipeline and the contact form's api side, and `docs/guides/content.md` for writing an article.

```bash
bun --filter @repo/help dev       # http://help.brand.localhost:3005
bun --filter @repo/help build     # standalone output for docker/next.Dockerfile
bun --filter @repo/help analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` | http://help.brand.localhost:3005 (search, "Popular articles", every category as a card) |
| `/<category>` | A category's own articles, each a card |
| `/<category>/<article>` | The article body, up to three related articles and a "Contact us" link |
| `/all` | Every article, by category — also the search control's no-JavaScript fallback |
| `/api/search` | The static search index (`force-static`) |
| `/contact` | Static; its server action — posting to `apps/api`'s `support.create` — is the only runtime call |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Writing an article

See `docs/guides/content.md`'s "Writing help content" part: frontmatter, the `<category>/<article>`
folder shape, the `meta.json` dialect (plain slugs only, and a category's own `meta.json` must
carry a `description`), related articles by shared tags, and the full table of what fails the
build.

## Search

`/api/search` is fumadocs' search index, exported once at build (`force-static`), the same engine
`apps/docs` uses; the ⌘K/Ctrl K dialog downloads it on the first query and searches in the browser
from then on, and without JavaScript the search control is a link to `/all`. `src/components/search.tsx`
passes `@repo/ui/blocks/docs-search` its own `labels` prop ("Search help", not "Search docs") —
the block itself is unchanged, just given different copy for this app.

## Contact

`/contact` is static; its server action is the only runtime call. `src/components/contact-form.tsx`
and `src/app/contact/actions.ts` post email, an optional name, a topic and a message to `apps/api`'s
`support.create` (rate-limited per browser, per recipient address and api-wide — see CLAUDE.md's
**Support.** paragraph). A filled honeypot field (`hp_field`, real visitors never see or fill it)
answers success with no api call at all. An article's "Contact us" link carries its own path as
`?from=`, read into the form's hidden `page` field once hydrated, so the support team sees where
the visitor came from — a missing, too-long or non-help `page` is dropped, never a reason to
refuse the request. On success the form shows a `HELP-<id>` reference and the address the
confirmation was sent to; superadmins see the request on `apps/auth`'s `/admin/support`.

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
