# API keys and the public /v1 API — design (Phase 11 A)

Phase 11 "developer-facing API" (owner, 2026-10-18): **A API keys and /v1** → B outgoing webhooks
→ C developer docs. Each its own spec, plan and PR. This is A. Approved in chat on 2026-10-18.

## Intent

Let a workspace admin connect the workspace to outside tools and scripts through a stable,
documented REST API, without sharing anyone's sign-in. Today only the Next apps reach `apps/api`
(service token, browsers never); this opens a deliberately small, versioned public surface.

Decided with the owner:
- **Workspace keys**, not personal tokens: created by an admin/owner, belong to the workspace, act
  with explicit scopes (not as a person), survive the creator leaving.
- **API access is a paid feature** (`api` in `FEATURES`: Pro and Team; Free gets an upsell).
- **Every key has a chosen expiry**: 30, 90 (default) or 365 days, or none with a warning.
- **A versioned `/v1` REST subset** from its own contract, not the internal procedures.

## Basis (checked 2026-10-18)

- OWASP (Context7, Cheat Sheet Series): REST Security — keys never in URLs, `429` when too fast,
  revocable; Multi-Tenant Security — 256-bit random keys, stored as SHA-256, returned exactly once;
  Secrets Management — exist only as long as necessary, revocable with attempts to use a revoked
  secret logged, never logged in plaintext; least privilege (narrow scopes).
- GDPR Art. 25(2) (Legal Data Hunter, EUR-Lex): by default only the personal data necessary for
  each purpose; not made accessible to an indefinite number of people without intervention — no
  emails in `/v1`, no scope preselected.
- Consensus: secret leakage on public GitHub is pervasive (Meli et al., NDSS 2019); distinctive
  key formats make leaks detectable (Meli et al.; Zhou et al., IEEE S&P 2025); Gitleaks led
  recall among compared scanners (Basak et al., ESEM 2023) — hence the `bb_live_` prefix and a
  Gitleaks rule.
- oRPC (Context7): a second `OpenAPIHandler` with its own router under a prefix, and
  `OpenAPIGenerator` for its own spec. No new dependency.

## 1. Keys and authentication (`apps/api`)

- Migration `0027_api_keys`:
  - `api_keys`: `id`, `workspace_id` (`ON DELETE CASCADE`), `name` (1–60), `prefix` (8 chars,
    unique), `secret_hash` (SHA-256 hex), `scopes` (JSON array text), `created_by` (user id,
    nullable, no FK cascade — like `audit_log.actor_user_id`), `created_at`, `expires_at`
    (nullable = no expiry), `last_used_at`, `revoked_at`. Index on `workspace_id`.
  - `notes.api_key_id` INTEGER nullable (no FK cascade; a revoked/deleted key leaves the note).
- Key: `bb_live_<prefix>_<secret>` — `prefix` 8 base62 chars, `secret` 32 random bytes base64url;
  shown once. Gitleaks rule for the pattern in `.gitleaks.toml` (+ a fixture test proving it
  matches).
- Scopes: `workspace:read`, `members:read`, `notes:read`, `notes:write`; at least one; `API_SCOPES`
  in the contract.
- `api` joins `FEATURES` in `packages/api-contract/src/billing.ts` (Pro, Team), with a
  `FEATURE_MESSAGES` entry.
- Procedures (⚑, `member("admin")`), `workspaces.apiKeys.list({ workspaceId })`,
  `create({ workspaceId, name, scopes, expiresInDays: 30 | 90 | 365 | null })` →
  `{ key, apiKey }` (the full key only here), `revoke({ workspaceId, id })`: `create` needs the
  `api` feature (`FORBIDDEN` its feature message) and at most **20 live keys** per workspace
  (`CONFLICT`); all three refused while impersonating except `list`; audit
  `workspace.api_key_created` (name, prefix, scopes, expiry) and `workspace.api_key_revoked`.
  `ApiKeySummary`: `{ id, name, prefix, scopes, createdBy: { id, name } | null, creatorLeft,
  createdAt, expiresAt, lastUsedAt, revokedAt, status: "active" | "expired" | "revoked" }` —
  `creatorLeft` when the creator is no longer a member (or purged).
- Authentication on `/v1/*` only: `Authorization: Bearer bb_live_…`, no service token, no
  session. Parse → look up by `prefix` → constant-time compare of the hash → `401 unauthorized`
  when malformed, unknown, revoked, expired, or the workspace lacks the `api` feature now. Each
  use of a revoked key is recorded through `recordFailure`-style telemetry (no key material).
  `last_used_at` written at most once a minute per key (in-memory throttle). Limiter
  `api-key:<id>` **600 per minute** → `429 rate_limited` with `Retry-After`. The key never
  reaches logs (the logger already redacts `authorization`; a test pins it for `/v1`).
- Workspace deletion deletes its keys (cascade); `users.purge` leaves `created_by` pointing at the
  gone id (shown as "former member").

## 2. The `/v1` surface

- `packages/public-api-contract` (`@repo/public-api-contract`): its own Zod schemas, routes and
  errors; README states the versioning rule — `/v1` only gains fields, anything breaking is `/v2`.
- `apps/api` mounts a second `OpenAPIHandler` on `/v1/*` behind the api-key guard (not the bearer
  guard, not the per-client rate limiter of `/rpc`); `/v1/openapi.json` and `/v1/docs` (Scalar)
  open, like `/openapi`. Not access-logged differently from other routes (bounded `route` label).
- Errors, one shape: `{ "error": { "code", "message" } }`, codes `unauthorized` (401),
  `forbidden_scope` (403, message names the scope), `not_found` (404), `validation_failed` (400),
  `rate_limited` (429), `internal` (500).
- Routes:
  - `GET /v1/workspace` (`workspace:read`) → `{ id, name, slug, plan }`.
  - `GET /v1/members?cursor&limit` (`members:read`) → `{ items: [{ userId, name, role, joinedAt }],
    nextCursor }` — no emails.
  - `GET /v1/notes?cursor&limit`, `GET /v1/notes/{id}` (`notes:read`) → `{ id, title, body,
    createdAt, author: { type: "user", id, name } | { type: "api_key", id, name } | null }`.
  - `POST /v1/notes { title, body }`, `DELETE /v1/notes/{id}` (`notes:write`) — reusing the note
    queries, limits, `publishAfterCommit` and `note_created` (the event's user id null).
  - `limit` 1–100, default 25; cursors as the internal lists use.
- Isolation: only the key's workspace; another workspace's ids → `404 not_found`.
- Internal `Note` gains `apiKey: { id, name } | null`; `apps/app` `/notes` shows "via API key
  <name>" for such notes (not "Deleted user").

## 3. UI, privacy, testing, docs

- `apps/account` `/workspace`: an **API keys** card (admin/owner; read-only explanation below
  admin): list (name, prefix, scopes, creator / "former member", created, last used, expires,
  status), **Create** (name, scopes as unticked checkboxes, expiry select default 90 days, "no
  expiry" with a warning) → the key shown once with a copy button and "You won't see this
  again", **Revoke** with a two-step confirm; Free plan → upsell. Works without JavaScript except
  copy; read-only while impersonating. en + sv; client components import contract values only
  through a Zod-free subpath (a new `./api-keys-limits` or similar).
- `/privacy` template: an **API access** section (what connected tools can read and do, no emails,
  operator/workspace responsible for what they connect).
- Testing: api (SQLite + Postgres) — format, hashing, scopes, expiry, revocation, feature loss →
  `401`, cross-workspace `404`, every route, the limiter, `last_used_at` throttle, impersonation,
  the cap, audit, a departed creator, no key in logs, `/v1/openapi.json` generated from the
  contract; account action cores and the card; e2e — a paid workspace's owner creates a key, a
  `fetch` with it `POST`s then `GET`s `/v1/notes`, the note shows on `/notes` "via API key",
  revoke → `401`; the Gitleaks rule fixture.
- Docs: CLAUDE.md **API keys and /v1** paragraph (+ apps list, packages list, env table if any),
  `docs/guides/api-keys.md`, READMEs (api, account, app, the new package); ROADMAP gains a
  **Phase 11 — developer-facing API** section (A/B/C) once the Phase 10 close-out (#107) has
  merged, A ticked on merge.

## Out of scope

Webhooks (B), the developer docs site (C), IP allowlists, OAuth apps for third parties, personal
access tokens, per-key rate limits other than the one default.
