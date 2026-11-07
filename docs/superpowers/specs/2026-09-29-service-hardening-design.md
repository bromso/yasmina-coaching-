# Service hardening (Phase 3a)

**Status:** approved design, pending implementation plan
**Date:** 2026-09-29
**Roadmap:** `docs/ROADMAP.md`, Phase 3 — sub-project 3a (3b: migrations + Postgres; 3c: Next app
headers + error pages follow separately)

## Intent

`apps/api` is the only unprotected service in the boilerplate and the one holding user data:
anyone who can reach `api.brand.com` can read and write notes, send a 128 MB body, and see Bun's
default error pages. `apps/ai` already has a guard, a rate limiter, a body cap and a generic
error handler — but as private code, with its own error format. This makes both services share one
safety kit, gives them production lifecycle behavior (graceful shutdown, a real readiness check),
one error shape, and paginates `notes.list` before it becomes the template for a real resource.

**Success criteria**

- An unauthenticated or over-limit call to a deployed `apps/api` is refused; the service refuses to
  start in production without `API_SERVICE_TOKEN`.
- Every error body either service sends has the same shape as oRPC's contract errors.
- SIGTERM drains in-flight requests before the process exits; `/ready` reports 503 while draining
  and, for `apps/api`, whenever the database does not answer.
- `notes.list` is paginated; `apps/app`'s notes page pages through it without client JavaScript.
- `apps/app` keeps working in `bun dev` and Docker Compose with no manual token setup in dev.
- `bun run ci` green; new behavior covered by tests over real HTTP.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| How `apps/api` knows a caller is allowed | Service token, like `apps/ai` | `apps/app` already calls `api` only from its server, so the token never reaches a browser. Phase 4 sessions pass the user alongside it. |
| Where shared service code lives | New workspace `packages/service-kit` (`@repo/service-kit`) | One implementation of the guard, limiter, error shape and lifecycle instead of copies that drift (they already had). The services still never import each other. |
| Error shape | oRPC's error JSON: `{ defined, code, status, message, data? }`, built with `ORPCError(...).toJSON()` | Hand-written errors then match the contract errors exactly; one parser handles every error from either service. |
| Pagination | Keyset on `id`, `limit + 1` probe | Stays fast at any size (no `OFFSET`), no count query. |
| `apps/ai` readiness | Ready once configured; not a provider ping | A provider call per probe costs money and latency. |

## `@repo/service-kit`

`packages/service-kit`, set up like the contract packages: `exports` → `./src/index.ts` (no build
step), `@repo/typescript-config/bun.json`, `@types/bun` and `@orpc/server` via `catalog:`, its own
`typecheck` and `test` scripts. Imported only by `apps/api` and `apps/ai` (it uses Bun APIs).

| Module | Exports | Origin |
|---|---|---|
| `errors.ts` | `errorResponse(code, { status?, message?, headers? }): Response` — body is `new ORPCError(code, { status, message }).toJSON()` | new |
| `guard.ts` | `createGuard({ token, allowedOrigins, allowLocalhostOrigins })` → `(req) => Response \| null`; constant-time bearer compare; a present `Origin` must be allowed | moved from `apps/ai/src/guard.ts` |
| `rate-limit.ts` | `RateLimiter`, `RateLimitResult`, `createMemoryRateLimiter({ limit, windowMs, now? })` | moved from `apps/ai/src/rate-limit.ts` |
| `protect.ts` | `createProtect({ guard, rateLimiter, keyFor })` → `(handler) => (req, server) => Promise<Response>`: guard → rate limit (429 + `Retry-After`) → handler; denials via `errorResponse` | generalized from `apps/ai/src/server.ts` |
| `lifecycle.ts` | `createLifecycle({ drainMs, cleanup })` → `{ ready(): boolean, shutdown(server): Promise<void>, installSignalHandlers(server) }`; `readyRoute(lifecycle, check?)` → a `/ready` handler (503 while draining or when `check` throws) | new |
| `env.ts` | `isDevLike(nodeEnv)`; `resolveServiceToken({ given, devToken, nodeEnv, name })` — dev/test fall back to `devToken`, production throws `"<name> is required in production"` | shared parts of `apps/ai/src/env.ts` |

`shutdown(server)`: mark not-ready → `server.stop()` (stop accepting, let in-flight requests finish)
raced against `drainMs` → `server.stop(true)` if the race timed out → `cleanup()` → resolve.
`installSignalHandlers` wires SIGTERM/SIGINT to `shutdown` then `process.exit(0)`; tests call
`shutdown` directly.

The ai guard and rate-limit tests move into the package; `errorResponse`, `createProtect` and the
lifecycle get their own tests.

## `apps/api`

**Env** (`src/env.ts`, Zod, NODE_ENV defaults to production as today):

| Variable | Default | Notes |
|---|---|---|
| `API_SERVICE_TOKEN` | dev/test: `DEV_API_TOKEN` (`"dev-only-insecure-api-token"`); production: required | exported from `@repo/api-contract` like `ai-contract`'s `DEV_TOKEN`; production without it exits 1 with the message |
| `API_ALLOWED_ORIGINS` | empty | comma-separated, same semantics as `AI_ALLOWED_ORIGINS` |
| `API_RATE_LIMIT` / `API_RATE_WINDOW_SECONDS` | 300 / 60 | |
| `API_MAX_BODY_BYTES` | 262144 (256 KiB) | passed to `Bun.serve`'s `maxRequestBodySize` |

**Routes** (`src/server.ts`):

| Route | Access | Behavior |
|---|---|---|
| `/health` | open | static `"OK"` (liveness) |
| `/ready` | open | `SELECT 1`; 503 while draining or if it fails |
| `/openapi` (GET), `/openapi/spec.json` (GET) | open | docs and spec |
| `/rpc/*`, `/openapi/*` | protected | guard → rate limit → oRPC |
| anything else | open | 404 via `errorResponse("NOT_FOUND")` |
| thrown past handlers | — | `error()` logs, answers `errorResponse("INTERNAL_SERVER_ERROR")` |

Rate-limit key: `client:<x-api-client-id>` (trimmed, ≤ 128 chars) when sent, else
`ip:<address>` — the same scheme as `apps/ai`.

**Entry point** (`src/index.ts`): loads env (exit 1 with the message on failure), warns when running
on `DEV_API_TOKEN`, creates the server, installs the signal handlers. `createServer` returns the
lifecycle so tests can drive shutdown.

## `apps/ai`

Rewired onto the kit: guard, limiter, `protect`, `error()`, 404 and `/chat`'s 400s all answer
through `errorResponse` (message texts unchanged). Adds `/ready` (no check function: ready once
configured, 503 while draining) and the signal handlers. `AI_*` env variables unchanged.

## `apps/app`

- `src/lib/env.ts`: `API_SERVICE_TOKEN` joins `AppEnv` — dev/test default `DEV_API_TOKEN`,
  required in production.
- `src/lib/api.ts`: `RPCLink` sends `authorization: Bearer <API_SERVICE_TOKEN>`. `api.ts` is
  server-only, so the token never reaches the browser.
- No `x-api-client-id` yet: all of `apps/app`'s calls share one rate-limit bucket until Phase 4
  can name the user.
- Notes page: reads `?cursor=`; renders `nextCursor` as an "Older notes" link
  (`/notes?cursor=<n>`) and a "Newest" link back when a cursor is set. Server-rendered, no client
  JavaScript.

## Contract: `notes.list`

```ts
input:  z.object({
          cursor: z.coerce.number().int().positive().optional(),
          limit: z.coerce.number().int().min(1).max(100).default(20),
        }).default({})
output: z.object({ items: z.array(NoteSchema), nextCursor: z.number().int().positive().nullable() })
```

`db.notes.list({ cursor, limit })`: `SELECT * FROM notes WHERE (cursor unset OR id < cursor)
ORDER BY id DESC LIMIT limit + 1`; if `limit + 1` rows came back, drop the last and set
`nextCursor` to the last kept row's `id`, else `null`. REST: `GET /openapi/notes?cursor=&limit=`.

## Docker and configuration

- `docker/bun-service.Dockerfile`: `HEALTHCHECK` probes `/ready` instead of `/health`, so Compose's
  `service_healthy` means "database answers".
- `docker-compose.yml`: `API_SERVICE_TOKEN: ${API_SERVICE_TOKEN:-}` on `api` and `app`; `api`
  exits at startup without it, as `ai` does. Consequence: the production-like stack now needs
  `API_SERVICE_TOKEN` in the root `.env` before notes work (it already needed `AI_SERVICE_TOKEN`
  for `ai`); the root `.env.example` and the README's Docker section say so. The dev stack
  (`docker-compose.dev.yml`) runs in development and uses the dev token, unchanged.
- `apps/api/.env.example`, `apps/app/.env.example`, the api README (routes, env, error shape) and
  CLAUDE.md (the new package, "Adding an API endpoint") are updated.

## Error shape reference

| Status | `code` | Sent by |
|---|---|---|
| 400 | `BAD_REQUEST` | ai `/chat` validation; oRPC input validation |
| 401 | `UNAUTHORIZED` | guard (with `www-authenticate: Bearer`) |
| 403 | `FORBIDDEN` | guard (origin) |
| 404 | `NOT_FOUND` | unknown path; `notes.find` |
| 413 | — | Bun itself, before any handler: its own body, not ours |
| 429 | `TOO_MANY_REQUESTS` | rate limit (with `Retry-After`) |
| 500 | `INTERNAL_SERVER_ERROR` | `error()` |
| 503 | `SERVICE_UNAVAILABLE` | `/ready` while draining / database down |

## Testing

- **`service-kit`**: the moved guard and limiter tests; `errorResponse` produces JSON that
  `@orpc/client`'s `isORPCErrorJson` accepts; `createProtect` order (guard before limiter, limiter
  before handler); lifecycle — `shutdown` flips readiness, lets an in-flight request finish within
  `drainMs`, cuts it off after, runs `cleanup` once.
- **`apps/api`** (real server, port 0, in-memory SQLite): no / wrong token → 401 in the shape;
  foreign origin → 403; over the limit → 429 + `Retry-After`; body over the cap → 413; docs open,
  REST procedures protected; unknown path → 404 in the shape; `/ready` 200, then 503 after
  `shutdown`; pagination: three pages of a seeded set, `limit` bounds (0 and 101 rejected),
  `nextCursor: null` on the last page, a cursor past the end → empty page.
- **`apps/ai`**: existing assertions updated to the shape; `/ready`.
- **`apps/app`**: `loadEnv` covers `API_SERVICE_TOKEN`.
- **Real run**: `bun dev` — notes page loads, adds, pages with "Older notes"; `curl` without the
  token → 401. Docker Compose — both services healthy via `/ready`, notes work across containers,
  `docker compose stop api` logs a drained shutdown.

## Out of scope

- 401/429 in the generated OpenAPI documents.
- Migrations, Postgres, schema changes (3b).
- Security headers and error pages in the Next apps (3c).
- Per-user rate limits and sessions (Phase 4).
- A shared rate-limit store for multiple instances (the `RateLimiter` interface stays the seam).
