# Developer docs — design (Phase 11 C)

Phase 11 "developer-facing API": A API keys and /v1 (#108) → B outgoing webhooks (#109) →
**C developer docs**. Approved in chat on 2026-10-19. One PR; it completes Phase 11.

## Intent

The product's customers — developers integrating their workspace — need a public, searchable,
branded reference for `/v1` and for webhooks. Decided with the owner:
- **Audience:** integrators of the product (not the boilerplate's own developers; `docs/guides`
  already covers extending the API).
- **Approach:** generate the reference at build time from `@repo/public-api-contract` into static
  pages rendered by our own components; committed output with a drift test; no new dependency.
- **Where:** a **Developers** section in `apps/docs` under `/developers` (`api` is a reserved
  top-level name there — `/api/search`).

## Basis (checked 2026-10-19)

- Context7 `/fuma-nama/fumadocs`: fumadocs-openapi v12 offers a headless mode, but adds a
  dependency and still needs our own components; its playground would call the api live, which
  the static app's CSP excludes — so we generate ourselves.
- Context7 `/dinwwwh/orpc`: `OpenAPIGenerator` with `ZodToJsonSchemaConverter` turns a router or
  contract into an OpenAPI document (the same machinery the api's `/v1/docs` plugin uses).
- Context7 `/dinwwwh/orpc` (re-checked): `OpenAPIGenerator.generate()` takes a **contract** directly
  (not only an implemented router), `base` for `info`/`servers`; each route's `openapi` metadata —
  `operationId`, `summary`, `description`, `tags` — flows into the document, so route prose lives in
  `@repo/public-api-contract` next to the schema it describes.
- Consensus (research on API documentation): REST docs without usage examples cause errors with
  data types, formats, required headers and request bodies (Sohan et al., IEEE VL/HCC 2017);
  developers first want the API's purpose, then a concepts- or code-oriented path (Meng et al.,
  JTWC 2018; Meng et al., CDQ 2019); explanations matter as much as the examples (Nasehi et al.,
  ICSM 2012); developers jump to code examples and security notes placed next to them are found
  and applied (Gorski et al., IEEE TSE 2022).
- Legal Data Hunter: the European Accessibility Act (Directive (EU) 2019/882) resolves, but its
  text could not be retrieved through the tool; its service scope is consumer-facing services such
  as e-commerce, so B2B API docs are likely outside it — regardless, the pages join the docs app's
  existing WCAG 2.2 A/AA sweep. No other legal surface: the docs describe A and B's behaviour.

## 1. Content (`apps/docs/content/docs/developers/`)

- Sidebar group `---Developers---` after the guides (root `meta.json`), with:
  - `index.mdx` **Overview**: purpose, base URL (`https://api.<domain>/v1`), versioning (additive
    only within `/v1`), the error envelope `{ error: { code, message } }` and every code.
  - `authentication.mdx`: creating a key (paid feature, shown once, scopes, expiry), the bearer
    header, `401`/`403 forbidden_scope`, revoking, a leaked key.
  - `rate-limits.mdx`: 600/min per key, `429` + `Retry-After`, the anonymous limit.
  - `reference/` — **generated**, one page per operation: Get workspace, List members, List notes,
    Get note, Create note, Delete note.
  - `webhooks/index.mdx` (endpoints, deliveries, retries over about an hour, auto-disable,
    deduplication and ordering, allowed URLs), `webhooks/verifying-signatures.mdx` (official
    `standardwebhooks` library + the tested manual verifier from `docs/guides/webhooks.md`), and
    `webhooks/events/` — **generated**, one page per event type.
- Written for customers ("your workspace"), English, no internal implementation detail. The
  existing content checks apply (links, images, headings, meta, reserved names).

## 2. Generation and drift

- `@repo/public-api-contract` gains a `./openapi` subpath: `buildV1OpenAPIDocument()` (oRPC
  `OpenAPIGenerator` + `ZodToJsonSchemaConverter` over the `/v1` contract; `@orpc/openapi`,
  `@orpc/zod` via `catalog:`) and `buildWebhookEventSchemas()` (JSON Schema per event from
  `WEBHOOK_DATA_SCHEMAS`). `apps/api`'s `/v1` reference plugin uses `buildV1OpenAPIDocument()`, so
  the live spec and the docs are identical by construction (a test pins deep equality).
- `apps/docs/scripts/generate-api-reference.ts` (`bun run --filter @repo/docs generate:api`):
  writes the reference and event MDX pages + their `meta.json`; deterministic (stable order, no
  timestamps); committed. Pages render through two MDX components added to the docs component map
  (and its static twin): `<Endpoint method path scope />` and `<SchemaTable schema />` (fields,
  type, required, description; nested objects, arrays, enums, nullable) — plain serialisable
  props.
- Every reference page follows the research: a one-line purpose and a short explanation first, then
  a **complete** example request (method, URL, `Authorization` and `content-type` headers, body) and
  example response, with each field's format stated (ISO 8601 UTC dates, integer ids, string
  lengths); a security note sits right next to the example (keys never in URLs, query strings or
  browser code). Event pages put the "verify the signature first" note next to the payload example.
  Route `summary`/`description` are added to the `/v1` contract's `openapi` metadata so the api's
  live spec carries the same prose.
- Examples (request bodies, responses, event envelopes) built from the schemas with fixed sample
  values (ids 1, 2, …; a fixed ISO date; an obviously fake `bb_live_…` key / `whsec_…` secret with
  `gitleaks:allow` on the line) and validated against the schemas in a test.
- Drift test `apps/docs/src/lib/api-reference.test.ts`: regenerates in memory, fails if the
  committed pages differ, naming the command.
- Pages are indexed by the static ⌘K search like every docs page.

## 3. Testing, cross-links, docs

- Tests: generator unit tests (field table, nesting, nullable, arrays, enums), drift, examples
  vs schemas, api spec deep-equal; the docs build gate; bundle budgets for new routes (controller);
  a11y manifest entries (one reference page, one event page, the overview) or reasoned
  exclusions per `scripts/a11y.test.ts`; e2e — the docs spec loads
  `/developers/reference/create-note` (method, path, scope visible) and finds "webhook signature"
  via search.
- Cross-links: `apps/account`'s API keys and Webhooks cards link to
  `/developers/authentication` and `/developers/webhooks` (URL from `siteUrl("docs")` computed on
  the server, passed as a prop — never `@repo/sites` in a client component); the api's `/v1/docs`
  description points at the docs.
- Docs: CLAUDE.md (docs app line, the `./openapi` subpath, regeneration + drift rule), links from
  `docs/guides/api-keys.md` and `webhooks.md`, READMEs (docs, public-api-contract). ROADMAP C
  ticked on merge (Phase 11 complete).

## Out of scope

A try-it playground; SDKs; translated API docs; docs versioning beyond `/v1`.
