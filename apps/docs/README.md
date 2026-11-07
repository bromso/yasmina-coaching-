# @repo/docs

Docs shell — Next.js 16 on docs.brand.localhost:3004 in development, `docs.brand.com` in production.

A starting point for product documentation: fumadocs-mdx over `content/docs/`, headless (no
`fumadocs-ui`), fully static — every route is `○`/`●` except the shared `/api/{analytics,health,telemetry}`
handlers. See CLAUDE.md's **Content.** paragraph for the pipeline and `docs/guides/content.md` for
writing a page.

```bash
bun --filter @repo/docs dev       # http://docs.brand.localhost:3004
bun --filter @repo/docs build     # standalone output for docker/next.Dockerfile
bun --filter @repo/docs analyze   # bundle report in .next/analyze/
```

## Routes

| Route | Dev URL |
|---|---|
| `/` and every page | http://docs.brand.localhost:3004 (`content/docs/index.mdx` at `/`, everything else at `[[...slug]]`) |
| `/all` | Every page, in sidebar order — also the search control's no-JavaScript fallback |
| `/og/<path>/image.png` | Per-page OG/Twitter image (a route handler; Next 16.2 refuses `opengraph-image` under a catch-all) |
| `/api/search` | The static search index (`force-static`) |

Every app also serves `/offline` (the PWA fallback page) and `/api/health` (used by the Docker
health check).

## Writing a page

See `docs/guides/content.md`'s "Writing docs" part: frontmatter, folders and `index.mdx`,
`meta.json`'s ordering tokens, the `Cards`/`Card` MDX components, and the full table of what fails
the build. Set `CONTENT_REPO_URL` at build time for an "Edit on GitHub" link on every page.

## Developers

`content/docs/developers/` is a public **Developers** section (`/developers`) for workspace
developers integrating `apps/api`'s `/v1` and its webhooks — overview, authentication, rate
limits, a `/v1` reference and webhook event pages, and verifying signatures. `index.mdx`,
`authentication.mdx`, `rate-limits.mdx`, `webhooks/index.mdx` and
`webhooks/verifying-signatures.mdx` are hand-written; `reference/*.mdx` (one page per `/v1`
route) and `webhooks/events/*.mdx` (one page per webhook event type) are **generated** and
committed — never edit them by hand.

### Generating

```bash
bun run --filter @repo/docs generate:api
```

`scripts/generate-api-reference.ts` calls `buildV1OpenAPIDocument()` from
`@repo/public-api-contract/openapi` — the exact document `apps/api` serves at
`/v1/openapi.json` — and `src/lib/api-reference.ts`'s pure rendering functions turn it into MDX,
one page per operation (ordered by `OPERATION_ORDER`) and one per webhook event type (described in
`EVENT_DOCS`). It writes `content/docs/developers/reference/*` and
`content/docs/developers/webhooks/events/*` plus each folder's `meta.json`, and deletes a page in
either folder the document no longer has — it never touches the hand-written pages next to them.
Pages render through two `@repo/ui` MDX components, `<Endpoint method path scope />` and
`<SchemaTable schema caption? />`. Every example uses fixed sample values (ids 1, 2, …, one fixed
ISO 8601 UTC date) and the placeholder base URL `https://api.your-domain.example`; the fake
`bb_live_…` / `whsec_…` secrets each carry a `{/* gitleaks:allow */}` marker on the same line as
the match.

### The drift test

`src/lib/api-reference.test.ts` regenerates the same pages in memory from a freshly built
document and fails — naming `bun run --filter @repo/docs generate:api` — the moment a committed
page differs. Run it with the rest of the docs suite:

```bash
bun test apps/docs
```

A change to the public contract (a route, a scope, a field, a `.describe()` or `summary` /
`description`) therefore fails this test until the pages are regenerated and the new ones
committed; so does an unrelated hand-edit to a generated page.

### Adding a `/v1` route or webhook event

1. Add the route (with `summary` / `description` and every field's `.describe()` — this prose is
   customer-facing and ships to both the live spec and these docs) to
   `packages/public-api-contract`, and add its `operationId` to `OPERATION_ORDER` in
   `apps/docs/src/lib/api-reference.ts` (an operation missing from that list fails generation). For
   a new webhook event, add it to `WEBHOOK_EVENTS` and describe it in `EVENT_DOCS` in the same
   file.
2. Run `bun run --filter @repo/docs generate:api`.
3. Commit the regenerated pages alongside the contract change.

## Search

`/api/search` is fumadocs' search index, exported once at build (`force-static`); the ⌘K dialog
downloads it on the first query and searches in the browser, and without JavaScript the search
control is a link to `/all`. The static index grows with the prose — about 12× the raw MDX, some
27 KB gzipped for the starter pages — so if it gets large, switch to a server search client
(fumadocs' `fetchClient` over a dynamic `/api/search`).

## Where things go

- **Views** — `src/views/<route>-view.tsx`: page-level compositions of `@repo/ui` blocks and
  components. Pages in `src/app/` stay thin and just render a view.
- **App-only components** — `src/components/`. Anything shared by two apps belongs in
  `packages/ui` instead.
- **Styles** — `src/styles/globals.css` starts with `@import "@repo/ui/globals.css";`; fonts, theme,
  skip link and web vitals come from `@repo/ui` too.

See the root [README](../../README.md) and [CLAUDE.md](../../CLAUDE.md) for the conventions shared by
all apps.
