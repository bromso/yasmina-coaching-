# Outgoing webhooks — design (Phase 11 B)

Phase 11 "developer-facing API": A API keys and /v1 (#108, merged) → **B outgoing webhooks** → C
developer docs. Approved in chat on 2026-10-18. One PR.

## Intent

Let a workspace push its own events to URLs its admins choose, so integrations react without
polling `/v1`. Decided with the owner:
- **Payload:** the same object `/v1` returns for that resource, never emails.
- **Events:** `note.created`, `note.deleted`, `member.joined`, `member.left`,
  `member.role_changed`, `workspace.updated`, `api_key.created`, `api_key.revoked` (plus a
  test-only `ping`).
- **Delivery on the existing job queue** (not a new loop, never on the request path).
- Same ownership and plan as API keys: workspace admins/owners, the paid `api` feature.

## Basis (checked 2026-10-18)

- **Standard Webhooks** (Context7, `/standard-webhooks/standard-webhooks`): headers
  `webhook-id`, `webhook-timestamp`, `webhook-signature: v1,<base64 HMAC-SHA256>` over
  `id.timestamp.body` (the exact bytes sent); secret `whsec_` + base64 of 24–64 random bytes;
  receivers reject beyond a 5-minute tolerance and deduplicate on `webhook-id`; id and timestamp
  never user-controlled.
- **OWASP SSRF Prevention Cheat Sheet** (Context7): `https` only; resolve every A/AAAA record and
  refuse non-public addresses (loopback, RFC 1918, link-local and metadata `169.254.169.254`,
  multicast, IPv6 equivalents); re-check against DNS pinning/rebinding; never follow redirects;
  never forward the response to the user. Research: SSRF is OWASP Top 10 and routinely found in
  real applications (Wang et al., IEEE S&P 2024; Jabiyev et al., ACM SAC 2021) and in generated
  webhook handlers (Khan et al., IEEE Access 2026).
- **Bun** (Context7, `/oven-sh/bun`, "Connect to a specific IP address using fetch"): put the
  checked address in the URL, send `Host: <hostname>` and `tls: { serverName: <hostname> }` (SNI
  and certificate checks against the name), `proxy: false`, `redirect: "manual"`; several
  addresses are tried by the caller. This closes the check-then-resolve rebinding window.
- **GDPR** (Legal Data Hunter, EUR-Lex): Art. 25(2) data protection by default — no emails, no
  preselected events; Art. 28 — the endpoint's operator is the workspace's own recipient or
  processor, which the operator/workspace is responsible for (stated in the privacy template).
- New dependency: `standardwebhooks` (the official JS library) as an `apps/api` **devDependency**
  only, to prove our signatures verify the way receivers verify them. No runtime dependency.

## 1. Endpoints (`apps/api`)

- Migration `0028_webhooks`:
  - `webhook_endpoints`: `id`, `workspace_id` (ON DELETE CASCADE), `url` (≤ 2000), `description`
    (≤ 200, nullable), `events` (JSON array text, ≥ 1), `secret` (AES-256-GCM `v1:<iv>:<ct>`
    under `TWO_FACTOR_ENCRYPTION_KEY`, like TOTP secrets — must be readable to sign),
    `created_by` (nullable, no FK cascade), `created_at`, `enabled` (boolean),
    `consecutive_failures`, `disabled_at`, `disabled_reason` (`failures` | `gone` | `manual` |
    null). Index on `workspace_id`.
  - `webhook_deliveries`: `id`, `endpoint_id` (ON DELETE CASCADE), `event_id`, `event_type`,
    `attempt`, `status` (HTTP status or null), `error` (a class: `timeout`, `network`, `blocked`,
    `redirect`, `http` — never a body), `duration_ms`, `created_at`. Index on
    `(endpoint_id, created_at)`.
- Rules: admin/owner (`member("admin")`); `create`, `update` (re-enable included) and
  `rotateSecret` need the `api` feature; `list`, `deliveries`, `delete` work on every plan;
  everything but `list`/`deliveries` refused while impersonating; at most **10 endpoints** per
  workspace (cap under the workspace-row lock, Postgres race test); URL must be `https`, no
  userinfo, no fragment, ≤ 2000 chars, host passing the SSRF guard (DNS resolved now); outside
  production `http` to `*.localhost` is allowed (local development and e2e).
- Procedures `workspaces.webhooks.{list, create, update, rotateSecret, delete, test,
  deliveries}`: `create`/`rotateSecret` return the secret (`whsec_…`) once; `test` enqueues a
  `ping`; `deliveries({ endpointId })` the last 50. Audit `workspace.webhook_created`,
  `_updated`, `_secret_rotated`, `_deleted`, `_disabled` (metadata: url host, events — never the
  secret).
- SSRF guard `apps/api/src/webhooks/ssrf.ts`: parse; resolve all A/AAAA; refuse if any address is
  non-public — IPv4 `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`,
  `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4`, `240/4`,
  broadcast; IPv6 `::/128`, `::1`, `fc00::/7`, `fe80::/10`, `ff00::/8`, `64:ff9b::/96`,
  `2001:db8::/32`, IPv4-mapped/compatible forms of any of the above. Returns the checked
  addresses.

## 2. Events and delivery

- Envelope `{ "type", "timestamp", "data" }`, minified JSON, signed exactly as sent. `data` per
  type: `note.created` the `/v1` note; `note.deleted` `{ id }`; `member.*` `{ userId, name,
  role, joinedAt }` (+ `previousRole` on `member.role_changed`); `workspace.updated` `{ id, name,
  slug, plan }`; `api_key.*` `{ id, name, prefix, scopes, expiresAt }`; `ping` `{ endpointId }`.
  Schemas in `@repo/public-api-contract` under a `./webhooks` subpath (`WEBHOOK_EVENTS` and the
  payload types); additive-only like `/v1`.
- `emitWebhookEvent(ctx, workspaceId, type, data, { tx? })` called where the change already
  happens (notes create/delete — internal and `/v1`; member join via invitation accept,
  leave/remove, role change; workspace rename and logo; API key create/revoke): one event id
  `msg_<base64url 16 bytes>` and timestamp per event; one `webhook.deliver` job per enabled,
  subscribed endpoint of a workspace that has the `api` feature, inside `tx` when given (a
  rolled-back change sends nothing).
- `webhook.deliver` job (`maxAttempts` 8 — the queue's backoff gives ~3.5 h): re-load the
  endpoint (gone, disabled, unsubscribed or feature lost → finish quietly); SSRF guard again;
  for each checked address in turn: `fetch` to the address with `Host` and `tls.serverName`,
  `proxy: false`, `redirect: "manual"`, a 10 s timeout, headers `content-type:
  application/json`, `user-agent: <BRAND_NAME>-webhooks`, the three signature headers; 2xx →
  success (failure count reset); `410` → disable now (`gone`); any other outcome → record and
  throw (retry). A delivery row per attempt. When the job dies (all attempts failed) the
  endpoint's `consecutive_failures` increments; at **5** it is disabled (`failures`), the owner
  mailed (`webhookDisabled`, en + sv, saved locale), audited.
- `webhooks.prune` schedule `55 3 * * *`: delivery rows older than 30 days.
- At least once, no ordering guarantee; receivers deduplicate on `webhook-id`, order by
  `timestamp`.

## 3. UI, privacy, testing, docs

- `apps/account` Workspace: a **Webhooks** card under API keys, gated like it (admin/owner; Free
  shows the list with delete + upsell; read-only while impersonating): list (URL, description,
  events, status incl. disabled reason, last delivery); **Add endpoint** (URL, description, event
  checkboxes none ticked) → secret shown once with Done (no-JS link like API keys); per endpoint:
  edit events/description, enable/disable, **Rotate secret** (shown once), **Send test event**,
  **Recent deliveries** (event, attempt, status/error class, duration, time), **Delete**
  (two-step). en + sv; Zod-free subpath imports; works without JavaScript except copy.
- `/privacy`: the **API access** section covers webhooks (what is sent, never emails, recipients
  are the operator's/workspace's responsibility).
- Testing: SSRF guard table (every range, mapped forms, DNS returning private, mixed
  public/private); signing verified with `standardwebhooks`; delivery against a local receiver
  on both engines (success, retry, dead → failure count, 5 → disabled + mail, 410, redirect not
  followed, timeout, pinned address — a DNS stub that returns a different address on second
  resolution must not change the dialled address); emitters fire once, inside `tx`, nothing on
  rollback; downgrade → nothing enqueued; disabled/unsubscribed → nothing; cap race; impersonation;
  audit metadata without secrets; account card; e2e — a Pro owner adds an endpoint on a receiver
  the test starts on `*.localhost`, creates a note, verifies the signed `note.created`, disables,
  creates another note, nothing arrives.
- Docs: CLAUDE.md **Webhooks** paragraph; `docs/guides/webhooks.md`; READMEs; the contract
  package README; ROADMAP **Phase 11 — developer-facing API** section (A ticked, B, C) in this
  spec's commit.

## Out of scope

Per-endpoint ordering; replaying past deliveries from the UI; `v1a` asymmetric signatures; IP
allowlists; an end-user webhook portal; webhooks for non-workspace (account-level) events.
