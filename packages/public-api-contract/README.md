# @repo/public-api-contract

The public `/v1` REST contract `apps/api` serves to workspace API keys: its own Zod schemas,
routes and error shape, kept apart from `@repo/api-contract` (the internal procedures) so the
internal contract can change freely while `/v1` stays stable. It also carries the outgoing-webhook
event vocabulary (`./webhook-events`, `./webhooks` — see below): what a webhook delivery can
contain is public, versioned surface in the same sense `/v1` is, even though delivery itself is
driven by `apps/api`'s internal procedures, not a `/v1` route.

## Versioning rule

`/v1` only ever **gains**: a new optional input, a new output field, a new route, a new error
message. Anything that could break an existing caller — removing or renaming a field, a route or a
scope, narrowing an input, changing a type, an error code or a status — is **`/v2`**: a new
contract next to this one, served alongside `/v1` until `/v1` is retired. Clients must therefore
ignore fields they do not know.

## Authentication

`Authorization: Bearer bb_live_<prefix>_<secret>` — a workspace API key, created by an admin or
owner on a paid plan (account app, **Workspace → API keys**). Nothing else is accepted: no service
token, no session. A key acts only on its own workspace, with the scopes it was given.

## Routes

| Route | Scope | Answers |
|---|---|---|
| `GET /v1/workspace` | `workspace:read` | `{ id, name, slug, plan }` |
| `GET /v1/members?cursor&limit` | `members:read` | `{ items: [{ userId, name, role, joinedAt }], nextCursor }` — never an email |
| `GET /v1/notes?cursor&limit` | `notes:read` | `{ items: Note[], nextCursor }`, newest first |
| `GET /v1/notes/{id}` | `notes:read` | `Note` |
| `POST /v1/notes` `{ title, body? }` | `notes:write` | `201` `Note`, authored by the key |
| `DELETE /v1/notes/{id}` | `notes:write` | `204` |

`Note` is `{ id, title, body, createdAt, author }`, where `author` is
`{ type: "user", id, name }`, `{ type: "api_key", id, name }` or `null` (the person's account is
gone). `limit` is 1–100 (default 25); `cursor` is the previous page's `nextCursor`.

The generated spec is at `/v1/openapi.json` and the reference at `/v1/docs` (both open).

Every route's `summary` and `description`, and every field's `.describe()` text, are
**customer-facing prose** — not internal comments. They flow straight into the live spec at
`/v1/openapi.json` / `/v1/docs` and into `apps/docs`'s generated `/developers/reference/*` pages
(see **OpenAPI and the developer docs** below), so write them for the person integrating, not for
another contributor reading the source.

## Errors

Every error is `{ "error": { "code", "message" } }`:

| Code | Status | When |
|---|---|---|
| `unauthorized` | 401 | no key, malformed, unknown, revoked, expired, or the workspace lost API access |
| `forbidden_scope` | 403 | the key lacks the route's scope (the message names it) |
| `not_found` | 404 | no such route (given a valid key — without one, an unknown path under `/v1/` is `401`; the bare `/v1` is `404` either way), or an id outside the key's workspace |
| `validation_failed` | 400 (413 for an oversized body) | the input failed the schema |
| `rate_limited` | 429 | over 600 requests a minute for this key, or over 60 refused requests a minute from one address; see `Retry-After` |
| `internal` | 500 (503 past the request deadline) | anything else |

The order is fixed: authentication (the key, its workspace and the plan's API access) → the
per-key rate limit → the route's scope → input validation. A key without a route's scope gets
`forbidden_scope` whatever its body holds.

## Isolation

A key acts only on its own workspace: every query `apps/api` runs for it is filtered to that
workspace in SQL, so an id from another workspace is `not_found`, never a hint that it exists.
The `/v1/members` cursor is the one exception that is *not* a `not_found` check — it is a keyset
position, not a reference, so paging past the end of A's members with an id that happens to belong
to B simply returns A's own (possibly empty) page; it is still never B's data.

## Using it

```ts
import type { PublicApiClient } from "@repo/public-api-contract"
```

`publicContract` is an oRPC contract, so `@orpc/openapi-client` can build a typed client over it;
any HTTP client works too.

## Outgoing webhooks

Two subpaths, kept apart from the root export the same way `@repo/api-contract`'s Zod-free
subpaths are, so a browser bundle (the account app's Webhooks card) can import the event
vocabulary without pulling in Zod or the `/v1` contract:

- **`./webhook-events`** (Zod-free): `WEBHOOK_EVENTS` (every event type a delivery can carry,
  `ping` — the test event — included) and `SUBSCRIBABLE_WEBHOOK_EVENTS` (all but `ping`, which only
  **Send test event** sends), plus their `WebhookEventType` / `SubscribableWebhookEvent` types.
- **`./webhooks`** (re-exports the above, plus Zod): a schema per event's `data` —
  `NoteDeletedDataSchema` (`{ id }`), `MemberRoleChangedDataSchema` (a member plus
  `previousRole`), `ApiKeyDataSchema` (`{ id, name, prefix, scopes, expiresAt }` — never the key
  or its hash) and `PingDataSchema` (`{ endpointId }`); `note.created`, `member.joined` and
  `member.left` reuse this package's own `NoteSchema` / `MemberSchema`, and `workspace.updated`
  its `WorkspaceSchema` — the same shapes `/v1` itself returns. `WEBHOOK_DATA_SCHEMAS` maps each
  event type to its schema; `WebhookEventSchema` is the full discriminated-union envelope
  (`{ type, timestamp, data }`) one delivery's body parses as; `WebhookData<T>` and
  `WebhookEventOf<T>` are the inferred types for one event type.

`apps/api` pins `WEBHOOK_EVENT_TYPES` (`@repo/api-contract/webhooks-limits`, the subscribable list
the `workspaces.webhooks.*` procedures validate against) equal to `SUBSCRIBABLE_WEBHOOK_EVENTS`
here in a test, so the two packages' event lists can never drift apart. These schemas follow the
same additive-only rule as `/v1`: a new event only ever adds a type and a schema, never changes
one that already shipped.

## OpenAPI and the developer docs

`./openapi` (pulls in Zod and oRPC, unlike the two subpaths above — not on the Zod-free list):

- **`buildV1OpenAPIDocument({ serverUrl?, title?, docsUrl? })`** — builds the `/v1` OpenAPI 3.1
  document straight from `publicContract` itself (`@orpc/openapi`'s `OpenAPIGenerator` +
  `@orpc/zod`'s `ZodToJsonSchemaConverter`), never from `apps/api`'s implemented router, so
  `apps/api`'s `/v1` reference plugin and `apps/docs`'s generated reference pages read the exact
  same document and can never disagree (a test in `apps/api` deep-equals the live
  `/v1/openapi.json` against it). `serverUrl` fills in `servers`, omitted entirely when not given;
  `title` sets `info.title` (this package takes no branding dependency, so the caller passes its
  own); `docsUrl` appends a sentence naming the developer docs to `info.description`, which the
  `/v1/docs` reference renders at the top of the page.
- **`buildWebhookEventSchemas()`** — one JSON Schema per webhook event type's `data`, converted
  from `WEBHOOK_DATA_SCHEMAS` with the same converter, so a webhook payload's documented shape can
  never drift from `/v1`'s own schema conversion.
- **`buildWebhookEnvelopeSchemas()`** — one JSON Schema per event type for the full delivery
  envelope (`{ type, timestamp, data }`), converted from `WebhookEventSchema`'s own discriminated
  union — the schema `apps/docs`'s generated event pages render.
- **`ERROR_BODY_JSON_SCHEMA`** — the `/v1` error body shape, the one place it is defined;
  `apps/api/src/v1/handler.ts` imports it for its own second (`v1Router`-driven) generation pass.

`apps/docs/scripts/generate-api-reference.ts` (`bun run --filter @repo/docs generate:api`) is the
only consumer of all three builders today: it writes the committed
`content/docs/developers/reference/*` and `developers/webhooks/events/*` MDX pages, with a drift
test that regenerates in memory and fails the moment a committed page disagrees with the contract.
See `apps/docs/README.md`'s **Developers** section and CLAUDE.md's **Developer docs.** paragraph.

## See also

CLAUDE.md's **API keys and /v1.** paragraph (storage, hashing, the guard order, the cap, audit)
and **Webhooks** paragraph (signing, the SSRF guard, delivery, auto-disable),
`apps/api/README.md`'s **API keys and /v1** and **Webhooks** sections (the implementation),
`apps/account/README.md`'s **API keys** and **Webhooks** sections (the cards that manage them),
`docs/guides/api-keys.md` (using the keys, including curl examples and what to do if a key leaks),
`docs/guides/webhooks.md` (adding an endpoint, verifying signatures, adding a new event type) and
`apps/docs/README.md`'s **Developers** section (generating and regenerating the public reference
and event pages this package's `./openapi` subpath feeds).
