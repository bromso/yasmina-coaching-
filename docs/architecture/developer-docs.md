# Developer docs

Full reference; `CLAUDE.md` keeps the summary and the index. A bold name such as **Jobs** refers to its entry there, whose link leads to the sibling file here.

**Developer docs.** Phase 11 C: a public **Developers** section in `apps/docs` at `/developers`
for the product's customers — workspace developers integrating `/v1` and webhooks, not this
repo's own developers (`docs/guides` already covers those) — overview, authentication, rate
limits, a generated `/v1` reference (one page per route) and webhook event pages, and verifying
signatures, with a drift test so the docs can never disagree with the API. The single source is
`@repo/public-api-contract`'s `./openapi` subpath: `buildV1OpenAPIDocument({ serverUrl?, title?,
docsUrl? })` is the exact document `apps/api`'s `/v1` reference plugin serves at
`/v1/openapi.json` — a test deep-equals the live response against the builder's own output, so the
two can never drift — and `buildWebhookEventSchemas()` / `buildWebhookEnvelopeSchemas()` are the
webhook payload and envelope JSON Schemas the event pages render. Every route's `summary` /
`description` and every field's `.describe()` text in the public contract are customer-facing
prose, not internal comments: the same words flow to the live spec at `/v1/docs` and to the
generated docs pages, so improving one improves both. `apps/docs/scripts/generate-api-reference.ts`
(`bun run --filter @repo/docs generate:api`) writes `content/docs/developers/reference/*` and
`developers/webhooks/events/*` as committed MDX, rendered through two new `@repo/ui` MDX
components (`@repo/ui/components/mdx`, in both the interactive and static maps): `<Endpoint
method path scope />` and `<SchemaTable schema caption? />`. A drift test
(`apps/docs/src/lib/api-reference.test.ts`) regenerates the same pages in memory and fails the
moment a committed page differs, naming `bun run --filter @repo/docs generate:api` in its
message. Examples use fixed sample values (ids 1, 2, …; one fixed ISO 8601 UTC date) and the
placeholder base URL `https://api.your-domain.example`, each validated against the contract's own
Zod schemas in a test; the fake `bb_live_…` key (on the authentication page and, emitted by the
generator, on every generated reference page) and the fake `whsec_…` secret (on the
verifying-signatures page) each carry `{/* gitleaks:allow */}` on the same line — the MDX-comment
form of this repo's usual `gitleaks:allow` marker, proven to work on the same physical line as the
match — rather than a real key. `apps/account`'s API keys and Webhooks cards each end with a link to the
docs (`/developers/authentication`, `/developers/webhooks`; `siteUrl("docs")` computed
server-side and passed down as a prop, never `@repo/sites` imported client-side). Basis: the
API-documentation research behind this design (see the spec's **Basis**) says readers want the
purpose first, then a complete example with its headers, with the security note placed beside the
example rather than after it — the shape every generated and hand-written developer-docs page
here follows. See `packages/public-api-contract/README.md`, `apps/docs/README.md` and
`docs/superpowers/specs/2026-10-19-developer-docs-design.md`.
