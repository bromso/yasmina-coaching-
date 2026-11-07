# Outgoing webhooks

A workspace admin or owner can register HTTPS endpoints that `apps/api` pushes its own events to,
so an integration reacts to a note, a member or a key as it happens instead of polling `/v1`. The
how and why (storage, the SSRF guard, the delivery job, auto-disable) are in CLAUDE.md's
**Webhooks** paragraph and `apps/api/README.md`'s **Webhooks** section; this guide is about using
the feature — as a workspace admin registering an endpoint and verifying what arrives, and as a
developer adding a new event type.

> The customer-facing version of this — what a workspace's own developers read — is the public
> **Developers** section in `apps/docs`, at `/developers/webhooks` and
> `/developers/webhooks/verifying-signatures` (with `/developers/webhooks/events/*` alongside
> them). This guide stays the internal reference for maintaining the feature.

Outgoing webhooks are a paid feature (`api` in `FEATURES`, Pro and Team) for everything that
creates, changes or tests an endpoint: `create`, `update` (including re-enabling a disabled
endpoint), `rotateSecret` and `test` all need it. `list`, **Recent deliveries** and `delete` work on every plan, so a
workspace that drops to Free keeps the list of endpoints it already made, each still removable —
just not editable, re-enableable or testable until it upgrades again.

## Adding an endpoint

1. Sign in as an admin or owner and open the account app's **Workspace** page
   (`account.brand.localhost:3003/workspace` in development), the **Webhooks** card.
2. Fill in the **Endpoint URL** (must be `https://`, or `http://`/`https://` to `*.localhost`
   with the right opt-in — see **Local development** below), an optional
   description, and tick the events this endpoint should receive (none is ticked by default — see
   **Events** below).
3. **Add endpoint**. The signing secret is shown exactly once, on a panel with a **Copy webhook
   secret** button and a reminder that it will not be shown again. Store it with the integration
   that will verify deliveries, then **Done with webhook secret**.

Only the endpoint's URL, description, events, status and delivery history are kept after that —
never the plain secret. A workspace can hold up to 10 endpoints at once; past that, **Add
endpoint** answers "A workspace can have up to 10 webhook endpoints. Delete one to add another." —
delete one you no longer need.

**Send test event** queues a single `ping` to that endpoint alone, signed and delivered exactly
like a real event, so you can confirm the receiver is reachable and the signature verifies before
subscribing it to anything real. A disabled endpoint refuses it ("Turn this endpoint on before
sending a test event.") rather than queuing a delivery that would never leave. A workspace can send
20 test events an hour; past that, "Too many test events, try again later."

### Rotating the secret

**Rotate secret** (two clicks: the first arms it and warns, **Confirm rotate** does it) replaces the
endpoint's secret at once and shows the new one exactly once, like **Add endpoint**. There is no
overlap window: the old secret stops being used immediately, and that includes **retries of events
queued before the rotation** — each attempt signs with the endpoint's secret as it is at that
moment, so a delivery that first failed under the old secret is retried signed with the new one.
Update your receiver with the new secret right away; until it has it, every delivery, retries
included, fails verification on your side, burns attempts, and can push the endpoint toward
auto-disable (see below).

## Events and payloads

| Event | `data` |
|---|---|
| `note.created` | The `Note` `/v1` would return |
| `note.deleted` | `{ "id": 42 }` |
| `member.joined` | `{ "userId", "name", "role", "joinedAt" }` |
| `member.left` | Same shape as `member.joined` |
| `member.role_changed` | `member.joined`'s shape, plus `"previousRole"` |
| `workspace.updated` | `{ "id", "name", "slug", "plan" }` |
| `api_key.created` | `{ "id", "name", "prefix", "scopes", "expiresAt" }` — never the key or its hash |
| `api_key.revoked` | Same shape as `api_key.created` |
| `ping` | `{ "endpointId" }` — only from **Send test event**, never worth subscribing to |

Every delivery's body is one envelope, minified JSON, signed exactly as sent:

```json
{
  "type": "note.created",
  "timestamp": "2026-10-19T09:30:00.000Z",
  "data": {
    "id": 42,
    "title": "Synced from the CRM",
    "body": "Optional",
    "createdAt": "2026-10-19T09:30:00.000Z",
    "author": { "type": "user", "id": 7, "name": "Ada" }
  }
}
```

`data` is always the same object `/v1` returns for that resource — never an email address, and
new events and fields only ever get added, the same rule `/v1` itself follows
(`packages/public-api-contract/README.md`).

## Verifying a delivery

Every delivery carries three headers, per the
[Standard Webhooks](https://www.standardwebhooks.com) specification. With the example (never
issued, never real) secret `whsec_ZXhhbXBsZS1vbmx5LW5vdC1hLXJlYWwtc2VjcmV0ISE=`, which is base64 for <!-- gitleaks:allow -->
`example-only-not-a-real-secret!!`, the envelope above, minified exactly in that key order, arrives
as:

```
webhook-id: msg_EXAMPLE_ONLY_not_realA
webhook-timestamp: 1792402200
webhook-signature: v1,YLaSXmNdyNhaFcq14bZmFiRJg/eF7XAg+8IkHS6AKEg=
```

`webhook-id` is `msg_` and 22 base64url characters, the same for every attempt of one delivery;
`webhook-timestamp` is unix seconds, taken when that attempt was signed;
`webhook-signature` is a space-separated list of `<version>,<signature>` entries — today a single
`v1,` one.

**With the official library** (JavaScript/TypeScript — `npm install standardwebhooks`):

```ts
import { Webhook, WebhookVerificationError } from "standardwebhooks"

const wh = new Webhook(secret) // "whsec_…", as shown once when you created or rotated the endpoint

/**
 * The parsed envelope, { type, timestamp, data }, or null to refuse the delivery (answer 400):
 * a missing header, a timestamp more than 5 minutes old or ahead, or no `v1,` entry in
 * `webhook-signature` that matches. `rawBody` must be the exact request body, as a string or
 * Buffer, read before any JSON parsing: a re-serialised copy can differ byte for byte and fail on
 * a genuine delivery.
 */
function readDelivery(rawBody: string | Buffer, headers: Record<string, string>) {
  try {
    return wh.verify(rawBody, {
      "webhook-id": headers["webhook-id"],
      "webhook-timestamp": headers["webhook-timestamp"],
      "webhook-signature": headers["webhook-signature"],
    })
  } catch (error) {
    if (error instanceof WebhookVerificationError) return null
    throw error
  }
}
```

Official libraries exist for Python, Go, Ruby, Rust, PHP, Java and more — see the Standard
Webhooks site. Use one if your stack has it.

**Verifying by hand**, if you cannot add a dependency (Node, `node:crypto` only):

1. Refuse a `webhook-timestamp` more than 5 minutes older or newer than your own clock.
2. Strip `whsec_` from the secret and base64-decode the rest: that is the HMAC key.
3. Compute `HMAC-SHA256(key, "<webhook-id>.<webhook-timestamp>.<raw body>")` — the three parts
   joined by literal dots, the body the exact bytes received — and base64-encode it.
4. Split `webhook-signature` on spaces; accept the delivery if any `v1,<signature>` entry equals
   it, compared in constant time. Skip entries with any other version: a future signing scheme
   would use a different prefix.

```js
const crypto = require("node:crypto")

const TOLERANCE_SECONDS = 5 * 60

/**
 * true when the delivery is genuine and recent. `headers` holds the request's headers with
 * lower-case names (Node's `req.headers`); `rawBody` is the exact body received, as a string or
 * Buffer, before any JSON parsing.
 */
function verifyWebhook(secret, headers, rawBody) {
  const id = headers["webhook-id"]
  const timestamp = headers["webhook-timestamp"]
  const signatures = headers["webhook-signature"]
  if (typeof id !== "string" || typeof timestamp !== "string" || typeof signatures !== "string") {
    return false
  }

  // 1. Recent: within 5 minutes of this machine's clock, in either direction.
  if (!/^\d+$/.test(timestamp)) return false
  const now = Math.floor(Date.now() / 1000)
  if (Math.abs(now - Number(timestamp)) > TOLERANCE_SECONDS) return false

  // 2. The expected signature: HMAC-SHA256 over "id.timestamp.body", keyed with the secret's
  //    bytes (the base64 after "whsec_"), base64-encoded.
  const key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  const expected = Buffer.from(
    crypto.createHmac("sha256", key).update(`${id}.${timestamp}.`).update(rawBody).digest("base64")
  )

  // 3. Any "v1,<signature>" entry of the space-separated list may match; other versions are
  //    skipped. timingSafeEqual throws on unequal lengths, so compare only equal-length buffers.
  for (const entry of signatures.split(" ")) {
    const comma = entry.indexOf(",")
    if (comma === -1 || entry.slice(0, comma) !== "v1") continue
    const given = Buffer.from(entry.slice(comma + 1))
    if (given.length === expected.length && crypto.timingSafeEqual(given, expected)) return true
  }
  return false
}
```

A malformed or truncated header makes it return `false`, never throw.

### The 5-minute tolerance

Reject any delivery whose `webhook-timestamp` is more than 5 minutes from your own clock, in
either direction. The official libraries do this for you, and so does step 1 of the hand-written
check above. This bounds how long a captured request stays
replayable, and `webhook-id`/`webhook-timestamp` are never user-controlled on our side — they come
from our signer, not from anything the endpoint itself sent us.

### Dedup and ordering

Delivery is **at least once**, with **no ordering guarantee** across events (a retry of an older
event can arrive after a newer one). Deduplicate on `webhook-id`: keep a short-lived set or table
of ids you've already processed, and skip one you've seen before — every attempt of one delivery
carries the same `webhook-id`, so a retry after a timeout is simply the same id again. Order your
own processing by the envelope's `timestamp` field (when the event happened), not by arrival
order.

## Retries

A failed attempt (no answer, a timeout, or anything other than a `2xx`/`410`) is retried with the
job queue's usual backoff — 30 seconds, doubling each time (±20% jitter), up to 8 attempts in
total: roughly 30 s, 1 min, 2 min, 4 min, 8 min, 16 min, 32 min between attempts, about an hour
end to end. Each api or worker process runs at most `WEBHOOK_CONCURRENCY` (default 2) deliveries
at once, so a backlog of slow endpoints waits its turn rather than holding up our own mail; a
healthy endpoint answering quickly is never noticeably delayed by it. A `3xx` redirect is never followed and counts as a failed attempt like any other
non-2xx status; a `410 Gone` is the one exception — it is not retried, and disables the endpoint
immediately (see below).

## Auto-disable and re-enabling

An endpoint is turned off automatically in two cases, both named on the Webhooks card:

- **Too many failures** — `Disabled — too many failed deliveries`. After 5 deliveries in a row
  that each exhausted all 8 attempts and still failed, the endpoint is disabled. A single
  successful delivery resets the count to zero, so this only fires on a true losing streak, not on
  the occasional blip.
- **410 Gone** — `Disabled — the endpoint answered 410 Gone`. The receiver itself asked to stop
  (the standard way to retire an endpoint), so there is no retry at all.

Either way every workspace owner is mailed (`webhookDisabled`, in their own saved language) naming
the endpoint's host — never its path or query, which might carry a token of yours — and saying
that events sent while it was off are **not** resent once it's back on; nothing is queued and held
for it. An admin can also disable an endpoint manually (`Disabled`, no reason suffix) from the
**Edit** disclosure's **Enabled** checkbox.

**To re-enable:** open the endpoint's **Edit** disclosure on the Webhooks card and tick
**Enabled** back on (or, for a manual disable, simply tick it on the same way) — this clears the
reason and resets the failure count, so the next delivery starts with a clean slate. Fix whatever
made the endpoint fail (a certificate, a route, a process that was down) before re-enabling it,
since the first attempt happens on the very next matching event.

## The SSRF rules, and why

An endpoint's URL must be `https`, carry no username/password and no `#fragment`, be at most 2000
characters, and — this is the part worth understanding — every address its hostname resolves to
must be a *public* address: no loopback, no private network (RFC 1918), no link-local, no carrier-
grade NAT, none of the documentation/benchmarking/reserved ranges, no multicast. This is checked
both when you add or change the URL, and again, independently, right before every single delivery
attempt.

The reason for checking twice is DNS rebinding: a hostname that resolves to a public address when
you register it could later be pointed at `127.0.0.1`, a cloud metadata endpoint, or an internal
service, by whoever controls its DNS. Checking only once, at creation, would leave a window for
exactly that attack — a workspace admin (or someone who compromises one) registering a
seemingly-fine hostname, then rebinding it to reach something inside your network once it's
delivering. Checking again at delivery time, and dialling *only* the address that check just
returned (never re-resolving in between), closes that window entirely: whatever the hostname
answers next, only an address we just verified as public is ever connected to. This follows
OWASP's SSRF Prevention Cheat Sheet.

A delivery also never follows a redirect (a `3xx` is recorded and left alone — chasing it could
land on an address the guard never checked) and never reads the response body back (so a
compromised or misbehaving receiver cannot use its answer to leak anything through our logs).

## Proxies

**Bun 1.4.2 ignores `fetch`'s `proxy: false` option.** If the api or worker process has
`HTTP_PROXY`, `HTTPS_PROXY` or `ALL_PROXY` set, every webhook delivery goes through that proxy —
the api and worker log one startup warning naming the variable when this is the case. This does
**not** weaken the SSRF guard: the request is still made to the address the guard just checked
(that address is written directly into the request's own URL), so the proxy is asked to connect to
a known-public address either way — it just means that proxy, not your server directly, makes the
outbound connection, and sees every delivery's content. If deliveries must leave the process
directly, unset the proxy variables for it; a future Bun release that honours `proxy: false` would
make this moot.

## Local development

Endpoints normally must be `https`, in every `NODE_ENV` — the one exception is
`WEBHOOK_ALLOW_LOCALHOST_HTTP` (default off, honoured in **every** `NODE_ENV`, including
development and production): with it set, `http://` or `https://` to `localhost` or any
`*.localhost` subdomain is allowed and dialled at `127.0.0.1` directly, with no DNS lookup. Plain
`bun dev` needs this set
to register a `*.localhost` endpoint at all — set it in `apps/api/.env` (or the root `.env`, which
`docker-compose.dev.yml` and `apps/api`'s dev script both read):

```
WEBHOOK_ALLOW_LOCALHOST_HTTP=true
```

Turning it on in production logs a loud, repeated warning ("never in a real deployment") — it
exists only so local development and the e2e suite can point an endpoint at a receiver on the same
machine; there is no reason to enable it on a real deployment, where every endpoint should be a
genuine, publicly reachable `https://` URL.

## Adding a new event type as a developer

Events and fields are additive-only, the same rule `/v1` follows — see
`packages/public-api-contract/README.md`.

1. **Name it** in `packages/public-api-contract/src/webhook-events.ts`'s `WEBHOOK_EVENTS` (and, if
   it's subscribable rather than test-only like `ping`, it's already covered by
   `SUBSCRIBABLE_WEBHOOK_EVENTS`'s filter). This is the Zod-free list a browser component can
   import without pulling in Zod or the contract.
2. **Mirror it** in `packages/api-contract/src/webhooks-limits.ts`'s `WEBHOOK_EVENT_TYPES` — an
   `apps/api` test pins the two lists equal, so they can never drift apart.
3. **Shape its payload** in `packages/public-api-contract/src/webhooks.ts`: add (or reuse) a Zod
   schema for the event's `data` and register it in `WEBHOOK_DATA_SCHEMAS`, keyed by the event
   name, and add it to `WebhookEventSchema`'s discriminated union. Reuse an existing `/v1` shape
   (`NoteSchema`, `MemberSchema`, …) where the event is about the same resource `/v1` already
   serves — never invent a second shape for the same thing. Never include an email address.
4. **Emit it** where the underlying change already happens, inside that change's own database
   transaction: `await emitWebhookEvent(context, workspaceId, "your.event", data, { tx })`. Pass
   either the data directly, or a function returning it (called only once there is a subscribed
   endpoint to send to, so an unrelated write pays no extra cost on the common path where a
   workspace has none).
5. **Label it** in the account app's Webhooks card: a `case` for it in `eventLabel`
   (`apps/account/src/components/webhooks-card.tsx`) and its `account.webhooks.event*` key in both
   `packages/i18n/messages/en/account.json` and `sv/account.json`. The switch ends in a `never`
   check, so a missing case fails the typecheck rather than rendering an empty checkbox label (the
   i18n guard cannot see this: the label is a function call, not a literal).
6. **Test it** in `apps/api/src/webhook-delivery.test.ts`'s style: the event fires once, in the
   `/v1` shape, with no email anywhere in it; nothing is sent when the triggering change rolls
   back, when no endpoint is subscribed, or when the workspace has no `api` feature.
7. **Document it**: add the event and its payload to the table above and to the event list in
   `docs/architecture/webhooks.md`.
8. **Developer docs**: add the event to `EVENT_DOCS` in `apps/docs/src/lib/api-reference.ts`, run
   `bun run --filter @repo/docs generate:api`, and commit the generated event page — the drift test
   in `apps/docs/src/lib/api-reference.test.ts` fails until you do.

Nothing about delivery, signing, retries or the SSRF guard changes per event — a new event type
only adds its name, its schema and the one call site that emits it.
