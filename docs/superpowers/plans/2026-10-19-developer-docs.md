# Developer Docs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public **Developers** section in `apps/docs` (`/developers`) for the product's integrators — overview, authentication, rate limits, a `/v1` reference and webhook event pages generated from `@repo/public-api-contract`, and signature verification — with a drift test so the docs can never disagree with the API.

**Architecture:** `@repo/public-api-contract/openapi` builds the `/v1` OpenAPI document and the webhook event JSON Schemas (oRPC `OpenAPIGenerator` over the contract); `apps/api` serves that same document; `apps/docs/scripts/generate-api-reference.ts` writes committed MDX pages rendered by two new MDX components; a test regenerates and diffs.

**Tech Stack:** oRPC `@orpc/openapi` + `@orpc/zod` (catalog), fumadocs-mdx/core (headless, existing), Next 16 static, Playwright. No new dependency outside the catalog.

**Spec:** `docs/superpowers/specs/2026-10-19-developer-docs-design.md`

## Global Constraints

- Section at `/developers` (never `/api`, reserved). Sidebar `---Developers---` after the guides. Pages: `developers/index`, `authentication`, `rate-limits`, `reference/<operation>` (generated, 6), `webhooks/index`, `webhooks/verifying-signatures`, `webhooks/events/<type>` (generated, 9 incl. `ping`).
- Every reference page: one-line purpose + short explanation; method, path, required scope; parameters/body/response tables with each field's format (ISO 8601 UTC dates, integer ids, string limits); a complete example request (method, URL, `Authorization` + `content-type`, body) and response; the route's errors; a security note beside the example (keys never in URLs, query strings or browser code). Event pages: payload table, example envelope, "verify the signature first" note beside it.
- Generated output deterministic and committed; drift test fails with the regenerate command. Examples use fixed sample values and an obviously fake `bb_live_…` / `whsec_…` with `gitleaks:allow` on the line (and `{/* gitleaks:allow */}` form valid in MDX — verify what the scanner accepts in MDX), validated against the schemas.
- Route `summary`/`description` live in the `/v1` contract's `openapi` metadata; `apps/api` `/v1/openapi.json` == `buildV1OpenAPIDocument()` (deep-equal test).
- Customer-facing English, no internals. Content checks (links, images, headings, meta, reserved names) pass.
- Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars; Biome clean, zero warnings; commit with `git commit --only <paths>`; run `bun scripts/security/secrets.ts --range $(git merge-base main HEAD)..HEAD` before handing back. Implementers never run Playwright, `bun run ci`/`validate`, or docker directly. Client components never import `@repo/sites` root or contract roots.

## Review Focus

1. A contract change without regeneration → the drift test fails in `bun test` (Task 1–2).
2. An example that shows a shape the API would not return (wrong field, wrong type, an email) → caught by the schema validation test (Task 2).
3. A generated page breaking the docs build (bad MDX escaping of `{`, `<`, backticks in descriptions) → generator escapes; a test feeds hostile strings (Task 2).
4. The docs' base URL or examples pointing at a dev host in a production build → derived from `siteUrl("api")` at generation-free build time or written as `https://api.<your-domain>` placeholders (Task 2–3).
5. The api's live `/v1/openapi.json` diverging from the docs → deep-equal test (Task 1).

---

### Task 1: The contract's OpenAPI builder

`packages/public-api-contract`: `./openapi` subpath exporting `buildV1OpenAPIDocument()` and `buildWebhookEventSchemas()`; `@orpc/openapi`, `@orpc/zod` via `catalog:` (check they are catalogued); `summary`/`description` on every `/v1` route; tests (document shape, every route present with scope/security, event schemas). `apps/api` `/v1` reference plugin uses the builder + deep-equal test against `/v1/openapi.json`.
- [ ] Commit `feat(api-contract): build the /v1 OpenAPI document from the public contract`.

### Task 2: Generator, components and generated pages

`apps/docs/scripts/generate-api-reference.ts` (`generate:api` script), pure rendering functions in `apps/docs/src/lib/api-reference.ts` (escaping, tables, examples), `<Endpoint>` and `<SchemaTable>` in `@repo/ui` MDX components (+ static map + stories/tests per the repo's component rules), the generated `content/docs/developers/reference/*` and `webhooks/events/*` + `meta.json`; tests: unit (tables, nesting, nullable, arrays, enums, hostile strings), examples validate against schemas, drift. Docs bundle budget for the new routes (controller adds).
- [ ] Commit `feat(docs): generate the API reference and webhook event pages`.

### Task 3: Hand-written pages and cross-links

`developers/index`, `authentication`, `rate-limits`, `webhooks/index`, `webhooks/verifying-signatures` (the tested verifier from `docs/guides/webhooks.md`), root `meta.json` group; a11y manifest entries (overview, one reference page, one event page) or reasoned exclusions; `apps/account` API keys + Webhooks cards link to the docs (server-computed `siteUrl("docs")` prop); api `/v1/docs` description link.
- [ ] Commit `feat(docs): developer guides for the API and webhooks`.

### Task 4: e2e

Extend the docs e2e spec: `/developers/reference/<create-note slug>` shows method, path, scope and the example; search finds "webhook signature"; the account cards' docs links resolve. Controller runs Playwright.
- [ ] Commit `test(e2e): developer docs`.

### Task 5: Docs

CLAUDE.md (docs app line, `./openapi` subpath, `generate:api` + drift rule, e2e counts), READMEs (docs, public-api-contract), links from `docs/guides/api-keys.md` / `webhooks.md`; ROADMAP C unticked (ticked on merge).
- [ ] Commit `docs: developer docs`.
