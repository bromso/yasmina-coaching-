# API keys and the public /v1 API

A workspace admin or owner can create an API key and hand it to an outside tool or script, without
sharing anyone's sign-in. A key acts as the workspace, with the scopes it was given, on a small,
versioned REST surface — `/v1` on `apps/api` — kept apart from the internal procedures the Next
apps use. The how and why (storage, hashing, the guard order, the error shape, the cap) are in
CLAUDE.md's **API keys and /v1.** paragraph, `apps/api/README.md` and
`packages/public-api-contract/README.md`; this guide is about using the feature.

> The customer-facing version of this — what a workspace's own developers read — is the public
> **Developers** section in `apps/docs`, at `/developers/authentication` (and `/developers`,
> `/developers/rate-limits` and `/developers/reference/*` alongside it). This guide stays the
> internal reference for maintaining the feature.

API access is a paid feature (`api` in `FEATURES`, Pro and Team): on the Free plan the account
app's Workspace page shows an upsell in place of the create form. A workspace that drops to Free
(cancelled, or a lapsed payment) keeps its keys, but they are paused: every request with one
answers `401 unauthorized` until the workspace is on Pro or Team again, when they work again
without any change. The card keeps listing them on Free, each with **Revoke**, so a key you no
longer trust can be retired before you upgrade.

## Creating a key

1. Sign in as an admin or owner and open the account app's **Workspace** page
   (`account.brand.localhost:3003/workspace` in development), the **API keys** card.
2. Fill in a name (1–60 characters, for telling keys apart). It is not secret: every member sees
   it on `/notes` as the author of the notes the key creates ("via API key `<name>`"), and it is
   returned as `author.name` to any key with `notes:read` — so never put a secret in it.
3. Choose scopes and an expiry (see below), then **Create key**.
4. The full key is shown exactly once, with a **Copy** button and a reminder that it will not be
   shown again. Store it wherever the tool or script that will use it keeps its secrets, then
   **Done**.

Only the key's prefix, name, scopes, status and timestamps are kept after that — never the secret.
If you lose it, revoke it and create another; there is no way to see a key again.

A workspace can hold up to 20 live keys at once (expired and revoked ones do not count). Past
that, **Create key** answers "A workspace can have up to 20 active API keys. Revoke one to create
another." — revoke one you no longer need, or reuse one that already has the scopes you want.

## Choosing scopes and expiry

A key carries one or more scopes, chosen when it is created and fixed after that (to change them,
revoke the key and create a new one):

| Scope | Lets the key |
|---|---|
| `workspace:read` | Read the workspace's name, slug and plan |
| `members:read` | List members by user id, name and role — never an email address |
| `notes:read` | List and read notes |
| `notes:write` | Create and delete notes |

Give a key only the scopes the tool actually needs. A read-only integration should never hold
`notes:write`; a dashboard that only shows the workspace's plan needs nothing but
`workspace:read`.

Expiry is 30, 90 (the default) or 365 days from creation, or no expiry. An expired key answers
exactly like a revoked one — `401 unauthorized` — with no warning beforehand beyond what the
Workspace page's list shows (an **Expires** date next to each key). Prefer a dated expiry for
anything short-lived (a one-off migration script, a contractor's temporary access); reserve "no
expiry" for a long-running integration you will remember to revoke the day it stops being used —
the card warns about this when you pick it.

## Calling /v1

Every request needs the key in an `Authorization` header, and nothing else — no service token, no
session cookie:

```
Authorization: Bearer bb_live_<prefix>_<secret>
```

The examples below use a fake key (never issued, invalid against any real workspace) and point at
the dev api, `http://api.brand.localhost:3007`. In production the api is served over TLS at
`https://api.<your domain>` — swap the scheme and host.

**Read the workspace:**

```bash
curl http://api.brand.localhost:3007/v1/workspace \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow
```

```json
{ "id": 1, "name": "Acme", "slug": "acme", "plan": "pro" }
```

**List members (`members:read`), paged:**

```bash
curl "http://api.brand.localhost:3007/v1/members?limit=25" \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow
```

```json
{ "items": [{ "userId": 1, "name": "Ada", "role": "owner", "joinedAt": "2026-01-01T00:00:00.000Z" }], "nextCursor": null }
```

Pass the previous page's `nextCursor` back as `?cursor=` to continue; `limit` is 1–100 (default
25). A cursor is just a keyset position, so an id from the wrong workspace, or one belonging to a
member who has since left, simply returns an empty or short page — it never errors.

**List and read notes (`notes:read`):**

```bash
curl "http://api.brand.localhost:3007/v1/notes?limit=25" \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow

curl http://api.brand.localhost:3007/v1/notes/42 \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow
```

A note's `author` is `{ "type": "user", "id", "name" }`, `{ "type": "api_key", "id", "name" }`, or
`null` once the person's account is gone. A note created through `/v1` is always authored by the
key, never a person — `apps/app`'s `/notes` shows it as "via API key `<name>`", even after the key
that made it is revoked.

**Create and delete a note (`notes:write`):**

```bash
curl -X POST http://api.brand.localhost:3007/v1/notes \
  -H "content-type: application/json" \
  -d '{"title":"Synced from the CRM","body":"Optional"}' \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow
# 201 { "id": 43, "title": "Synced from the CRM", "body": "Optional", "createdAt": "…", "author": { "type": "api_key", "id": 7, "name": "CRM sync" } }

curl -X DELETE http://api.brand.localhost:3007/v1/notes/43 \
  -H "Authorization: Bearer bb_live_9F3kD7qL_ODjfcRNL2EDLbdDZ1c5jAU2rjTbrNLwMtshF6PwKluY" # gitleaks:allow
# 204, empty body
```

`title` is required (1–200 characters); `body` is optional, up to 10,000 characters.

**The generated spec and reference**, no key required: `GET /v1/openapi.json` (OpenAPI, built
straight from `@repo/public-api-contract`) and `GET /v1/docs` (a Scalar reference over it).

## Errors

Every error — from the guard and from a route alike — is one shape:

```json
{ "error": { "code": "forbidden_scope", "message": "This API key does not have the notes:write scope" } }
```

| Status | `code` | When |
|---|---|---|
| 401 | `unauthorized` | No key, a malformed one, an unknown prefix, a wrong secret, a revoked or expired key, or a workspace that has lost the `api` feature (e.g. downgraded to Free). One message for all of these, by design — a caller is never told *which* is wrong |
| 403 | `forbidden_scope` | The key is valid but lacks the route's scope. The message names the missing scope. Checked before the request body, so a wrong-scope key never also learns its body was invalid |
| 404 | `not_found` | An id from another workspace, an id that does not exist, or an unknown `/v1/*` path **given a valid key**. Without a key, an unknown path under `/v1/` answers `401` instead — the key check runs first, so an unauthenticated caller cannot discover which paths exist. The bare `/v1` (no trailing path) is the one exception: it answers `404` with or without a key |
| 400 | `validation_failed` | The input failed validation (a missing `title`, a non-numeric id, …). The message is `Input validation failed` and does not name the field; a body that is not valid JSON gets `Malformed request. Ensure the request body is properly formatted and the 'Content-Type' header is set correctly.` instead |
| 413 | `validation_failed` | The request body was too large |
| 429 | `rate_limited` | Over the rate limit — see below. Carries a `Retry-After` header, in seconds |
| 500 | `internal` | Anything unexpected, including a database outage while authenticating a key |
| 503 | `internal` | The request passed `REQUEST_TIMEOUT_MS` before answering. It may still have completed — a write past this point should not be retried blindly |

A `401 unauthorized` also carries `WWW-Authenticate: Bearer`.

## Limits

- **600 requests a minute per key**, counted only once a key authenticates successfully.
- **60 refused requests a minute per connection address**, counted against every *failed*
  authentication attempt from one address — no key, a malformed or unknown key, a wrong secret, a
  revoked or expired key, a workspace that lost the feature. A valid key is never counted here,
  whatever else it does. Past this budget a refused request answers `429 rate_limited` instead of
  `401 unauthorized`.

  The limiter keys on the socket's own address (`server.requestIP(req)`), and never reads
  `X-Forwarded-For`, `X-Real-IP` or any other forwarded header — so configuring a proxy to forward
  them changes nothing. **Behind a reverse proxy in front of the api, every caller arrives from the
  proxy's address, so all refused traffic, from every customer, shares this one 60-per-minute
  budget.** Likewise, a customer's integrations behind one NAT or outbound proxy share a budget.
  Only *failed* attempts are affected — a valid key is never counted against this limiter.

## Revoking a key

On the Workspace page, **Revoke** next to the key, then **Confirm revoke**. This takes effect
immediately: the very next request with that key answers `401 unauthorized`, the same as an
unknown key. There is no grace period and no undo — create a new key if the integration needs to
keep working.

Revoking is also how you retire a key you no longer trust (see below) or one whose scopes you want
to narrow (revoke, then create a replacement with only the scopes it needs).

## If a key leaks

A workspace API key is as sensitive as a password: whoever holds it can read or write within its
scopes until it is revoked or expires. If a key was committed to a public repository, pasted into
a chat, or otherwise exposed:

1. **Revoke it immediately** from the Workspace page — this is instant and needs nothing from the
   tool or script that used it.
2. **Create a replacement** with the scopes the integration actually needs (an opportunity to
   narrow them if the original key was broader than necessary), and update the integration with
   the new key.
3. **Check the key's "Last used" date** on its row before you revoke it (and `/v1`'s access logs,
   if you have log retention) for signs of use you did not expect. The card shows the day only;
   the stored `last_used_at` is finer but approximate — it can lag up to a minute behind the key's
   real last use — so treat it as a lower bound, not an exact timestamp.
4. There is no way to see what a leaked key was used for beyond its scopes and `last_used_at`:
   /v1 writes no audit trail of its own (the internal procedures that manage keys do — creating
   and revoking are both audited — but a `/v1` request itself is not).

This repository also runs a custom Gitleaks rule (`bb-live-api-key` in `.gitleaks.toml`) that
recognises the `bb_live_` key format, so a key accidentally committed to *this* repository is
caught by the secrets scan before it reaches a reviewer. That does not help a key pasted somewhere
else — a chat, an unrelated repository, a support ticket — which is why the distinctive prefix
exists at all: it makes a leaked key detectable by any scanner that looks for it, not just this
one.

## Adding a /v1 route as a developer

`/v1` is deliberately small and separate from the internal contract, with one hard rule
(`packages/public-api-contract/README.md`): **`/v1` only ever gains.** A new optional input, a new
output field, a new route, a new error message are fine. Anything that could break an existing
caller — removing or renaming a field, a route or a scope, narrowing an input, changing a type, an
error code or a status — is a `/v2`, a new contract served alongside `/v1` until it is retired, not
a change to this one.

To add a route:

1. **Contract** (`packages/public-api-contract/src/index.ts`): add the route to `publicContract`
   with its `method`, `path` (under `/v1/...`), `summary`, `tags`, declared `.errors(...)`, Zod
   `.input()` and `.output()`. Reuse `AUTH_ERRORS` / `NOT_FOUND_ERRORS` / `BODY_ERRORS` for the
   error set a route of its shape needs. If it needs a new scope, add it to `SCOPES` — and to
   `API_SCOPES` in `packages/api-contract/src/api-keys-limits.ts`, which a test pins against this
   package's `SCOPES` (`apps/api/src/v1/v1.test.ts`) so the two can never drift apart.
2. **Handler** (`apps/api/src/v1/router.ts`): implement it on `v1Router`, behind
   `.use(scope("the:scope"))` for whichever scope it needs — this must run before the route's own
   input is trusted, since the scope check is deliberately ordered ahead of validation (a
   wrong-scope key should never learn anything about whether its body was also invalid). Scope
   every database read and write to `context.key.workspaceId` in SQL; never trust a workspace id
   from the request. Reuse the same queries, limits and realtime events the internal procedures
   use where they exist, rather than writing a parallel path.
3. **Tests** (`apps/api/src/v1/v1.test.ts`): the happy path, the missing-scope `403`, cross-workspace
   isolation (another workspace's id answers `404`, never a hint that it exists), and anything the
   route adds to the generated spec.
4. **Docs**: add the route to the table in `packages/public-api-contract/README.md` and, if it is
   significant enough for an integration to care about on its own, to this guide's **Calling /v1**
   section.
5. **Developer docs**: add its `operationId` to `OPERATION_ORDER` in
   `apps/docs/src/lib/api-reference.ts` (an operation missing from that list fails generation), run
   `bun run --filter @repo/docs generate:api`, and commit the generated pages — the drift test in
   `apps/docs/src/lib/api-reference.test.ts` fails until you do.

Nothing about authentication changes per route: `createApiKeyGuard` (`apps/api/src/v1/guard.ts`)
already resolves and validates the key, its workspace and the `api` feature before any router
code runs — a new route only adds its own scope check and handler.
