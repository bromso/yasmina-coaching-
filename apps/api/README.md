# @repo/api

API shell on `Bun.serve` + [oRPC](https://orpc.dev). Dev: `api.brand.localhost:3007` → prod: `api.brand.com`.

```bash
bun --filter @repo/api dev       # bun --hot: routes swap in place, no restart
bun --filter @repo/api test      # bun test over real HTTP, in-memory SQLite
bun --filter @repo/api build     # dist/index.js (run with `start`) and dist/worker.js (`start:worker`)
bun --filter @repo/api compile   # dist/api — single self-contained binary
```

## Routes

| Path | What | Protected |
|---|---|---|
| `/health` | Static `Response` — Bun dispatches it without running JS (liveness) | no |
| `/ready` | `OK` when the database answers (`SELECT 1`); 503 while shutting down | no |
| `/rpc/*` | Typed RPC for first-party clients | yes |
| `/openapi/*` | The same procedures as REST (`GET /openapi/notes`, …) | yes |
| `/openapi` | Scalar API reference; the spec is at `/openapi/spec.json` | no |
| `/events/workspaces/:workspaceId` | `GET` only: the workspace's Server-Sent Events stream, also needs `x-session-token` (see [Realtime](#realtime)) | yes |
| `/events/me` | `GET` only: the signed-in user's own notification stream, also needs `x-session-token` (see [Notifications](#notifications)) | yes |
| `/billing/webhook` | `POST` only: the billing provider's webhook, authenticated by its signature (see [Billing](#billing)) | no |
| `/metrics` | `GET` only: Prometheus text exposition, bearer `METRICS_TOKEN` (see [Logs, request ids and metrics](#logs-request-ids-and-metrics)) | its own token, not the api's |
| `/v1/*` | The public REST API, for workspace API keys only — never the service token or a session (see [API keys and /v1](#api-keys-and-v1)) | its own guard, not `/rpc`'s |
| `/v1/openapi.json`, `/v1/docs` | The generated `/v1` spec and its Scalar reference | no |

Protected routes need `authorization: Bearer <API_SERVICE_TOKEN>`, are rate limited
(`API_RATE_LIMIT` per `API_RATE_WINDOW_SECONDS`, per `x-api-client-id` or IP) and cap the request body
at 256 KiB (`API_MAX_BODY_BYTES`) — except a `POST` to the two image upload procedures, which gets 3 MB
(`UPLOAD_MAX_BODY_BYTES`; see [Storage](#storage)), and a `POST` to `jobs.apply`, which gets 6 MB for its
5 MB PDF CV (`CV_MAX_BODY_BYTES`). The rate limit is per client id: the Next apps send one per
session (`session:` + a hash of the token, set by `@repo/session`), so one user cannot exhaust the
bucket for everyone. Anonymous auth calls from the Next apps (sign-in, sign-up, password reset, magic link, provider
sign-in) are keyed `anon:<ip hash>` instead. Outside production the token defaults to `dev-only-insecure-api-token`; in
production the service exits at startup without a token, with the dev token, or with one shorter
than 32 characters (generate one with `openssl rand -hex 32`).

**Errors** — every error body the service writes (guard, handlers, 404, unhandled errors) is
`{ defined, code, status, message }`: the shape oRPC clients parse, so a 401 or 429 surfaces as a
typed `ORPCError` rather than a parse failure. An oversized body is a 413: from the
`content-length` check in `createServer` for anything over `API_MAX_BODY_BYTES` that is not an
upload, and from Bun itself past the server-wide `maxRequestBodySize`
(`max(API_MAX_BODY_BYTES, UPLOAD_MAX_BODY_BYTES, CV_MAX_BODY_BYTES)`), which is all that bounds a
chunked body sent without `content-length`.

**Shutdown** — on SIGTERM (or SIGINT) readiness flips, the listener closes and in-flight requests
get up to 8 s to finish before the database closes. `graceMs` keeps the listener up that long first,
answering 503 on `/ready`, for deployments behind a load balancer that polls `/ready`. It is an
option of `createServer` (pass it in `src/index.ts`), not an environment variable. `graceMs` plus the
8 s drain must stay under the container's stop timeout — Docker sends SIGKILL after 10 s by default
— so when you raise `graceMs`, raise `stop_grace_period` on the `api` service in Compose to match.
The job worker stops claiming the moment shutdown begins and its jobs in flight drain alongside the
requests, within the same 8 s (see [Jobs](#jobs)).

## Logs, request ids and metrics

Every log line is structured JSON (`@repo/log`, `packages/log/README.md`): `time`, `level`,
`service` (`"api"` here, `"worker"` on the dedicated worker), `message`, `requestId` when one is
in scope, then fields. `LOG_LEVEL` (`debug`/`info`/`warn`/`error`, default `info`) and `LOG_FORMAT`
(`json`/`pretty`, default `json` in production) override; sensitive fields (`password`, `token`,
`secret`, `authorization`, `cookie`, `x-session-token`, any case, any depth) are redacted and a
field named `email` is masked, so nothing a caller sends ends up verbatim in a log sink. The
existing internal `log(message, error)` callback used throughout the codebase is `legacyLog(logger)`
over the same structured logger.

A request id (22-character base64url) follows every request: an incoming `x-request-id` is kept
only from a caller that already passed the bearer guard, else a fresh one is generated
(`@repo/service-kit`'s `withRequest`, shared with `apps/ai`); it wraps the whole handler
(`@repo/log/context`'s `withRequestContext`, over `AsyncLocalStorage`), is echoed as the
`x-request-id` response header, and is on every log line the request causes — enqueueing a job
stores `currentRequestId()` on `jobs.request_id` (migration `0022_jobs_request_id`), and the
worker resumes it (`withRequestContext({ requestId: row.request_id ?? newRequestId() })`) so a
job's logs join the request that caused it. One `info` access line per request logs `method`,
`route` (a bounded label — a procedure path or REST segment the contract declares, `"other"`
otherwise), `status` and `ms`; `/health`, `/ready` and `/metrics` are never access-logged or
rate-limited.

`GET /metrics` answers Prometheus text exposition (format 0.0.4) behind its own bearer,
`METRICS_TOKEN` (≥ 24 characters): unset → 404 (off by default), wrong or missing → 401. It
exposes `http_requests_total{route,method,status_class}`, `http_request_duration_seconds{route,
method}`, `rate_limit_refusals_total{limiter}`, `realtime_streams_open`, `db_ping_seconds`,
`process_resident_memory_bytes`, `process_uptime_seconds`, `build_info{version,commit}` (`commit`
from `GIT_COMMIT`), and — only when this process also runs the worker (`JOBS_WORKER` not
`false`) — `jobs_queue{status}`, `job_runs_total{name,outcome}`, `job_duration_seconds{name}` and
`scheduler_lag_seconds`; a dedicated worker process exposes those same job metrics on its own
`/metrics` instead, so the two never double-count. Either process also exposes
`backup_last_success_timestamp_seconds`, read from the `jobs` table's last succeeded `backup.run`
row (see [Backups](#backups); an index on `(name, status, finished_at)`, migration
`0023_jobs_name_index`, keeps that lookup off a scan) — unset when `BACKUP_ENABLED` has never been
on, and never moved by a backup the CLI takes (it dumps directly, no job). Full metric list,
scrape config and example alerts: `docs/guides/operations.md`.

## Auth

`apps/api` owns users, sessions and one-time tokens (migration `0002_auth`; `0003_notes_owner` gives
notes a `user_id`; `0004_email_verification` adds `users.email_verified_at` and the `tokens` table; `0005_identities`
makes `users.password_hash` nullable, adds the `magic_link` token purpose and `tokens.email`, and
creates `identities`; `0006_identity_per_provider` makes `(user_id, provider)` unique; `0013_two_factor`
adds two-step verification, see **Two-factor** below; `0014_files` adds `users.avatar_key` and
`workspaces.logo_key`, see **Storage** below; `0018_sessions_revoked_at` adds
`users.sessions_revoked_at`, see **Two-factor** below). Every procedure stays behind the service token; the ones marked ⚑ also need
the caller's session token in `x-session-token`, and answer `401` `Sign in required` without a
valid, unexpired one. A Next app forwards it from the `session` cookie through `@repo/session` —
the browser never calls this service.

| Procedure | REST | Notes |
|---|---|---|
| `auth.signUp` | `POST /auth/sign-up` | `201` `{ user, session: { token, expiresAt } }`; `409 CONFLICT` when the email exists; mails a verify link valid for 24 hours |
| `auth.signIn` | `POST /auth/sign-in` | Same shape — or `{ twoFactor: { challenge, expiresAt } }` instead when the account has two-step verification on (see **Two-factor**); `401` "Invalid email or password" for a wrong password, an unknown email and a passwordless account alike; `429` from the sign-in limiter |
| `auth.me` ⚑ | `GET /auth/me` | `{ user, session: { id, expiresAt } }`; refreshes `last_seen_at` at most once a day |
| `auth.signOut` ⚑ | `POST /auth/sign-out` | Deletes the current session |
| `auth.requestPasswordReset` | `POST /auth/password/forgot` | Always succeeds, so it never reveals whether an account exists; mails a link valid for an hour; silently limited to 3 per email per 15 minutes and `MAGIC_LINK_RATE_LIMIT` api-wide |
| `auth.resetPassword` | `POST /auth/password/reset` | `400` for an invalid, used or expired token; signs the user out everywhere; mails the password-changed notice |
| `auth.verifyEmail` | `POST /auth/email/verify` | `{ token }` from the verify link; sets `email_verified_at` and burns the user's other verify links; `400` for an invalid, used or expired token |
| `auth.magicLink.request` | `POST /auth/magic-link/request` | `{ email }`; always succeeds, known or unknown address; mails `${AUTH_URL}/magic?token=…`, valid 15 minutes; silently limited to 3 per email per 15 minutes |
| `auth.magicLink.consume` | `POST /auth/magic-link/consume` | `{ token, client }` → `{ user, session }`, or `{ twoFactor }` like `auth.signIn`; creates a passwordless, verified account for an address with none; `400` for an invalid, used or expired token |
| `auth.providers` | `GET /auth/providers` | `{ providers }`: the configured ones, in the order google, github, apple |
| `auth.oauth.start` | `POST /auth/oauth/start` | `{ provider }` → `{ url, state, codeVerifier? }` (verifier for Google's PKCE); `404` for an unconfigured provider. With a live, non-impersonation `x-session-token` (a connect) on a session past `REAUTH_WINDOW_MS`, `403` `connectReauth`, `data: { reason: "reauth" }`. The caller must keep `state` and check it on return |
| `auth.oauth.callback` | `POST /auth/oauth/callback` | `{ provider, code, codeVerifier?, appleUser?, client }` → `{ user, session }`, or `{ twoFactor }` like `auth.signIn`; with an `x-session-token` it connects the provider to that user and answers with that same session (no new one) — `403` `connectReauth`, `data: { reason: "reauth" }`, when that session is past `REAUTH_WINDOW_MS`, before anything is written. `403` unverified email, `409` identity owned by another user, `502` provider unreachable, `400` code refused |
| `auth.twoFactor.verify` | `POST /auth/two-factor/verify` | `{ challenge, code, client }` → `{ user, session }`: the only way past a challenge. `code` is a 6-digit TOTP code or an unused recovery code; the winning request alone spends a recovery code, and a challenge issued before the account's last session revocation can never succeed. `401` "That code didn't work…" for a wrong code (including a recovery code another request just spent); `400` "Your sign-in timed out…" for an unknown, expired, used or burnt challenge (the fifth wrong code burns it); `429` from `2fa:verify:<id>`, 10 wrong codes per 15 minutes |
| `auth.passkey.options` | `POST /auth/passkey/options` | `{ options, challengeId }`: WebAuthn request options for a discoverable sign-in (no `allowCredentials`) plus the single-use challenge id to send back |
| `auth.passkey.verify` | `POST /auth/passkey/verify` | `{ challengeId, response, client }` → `{ user, session }`, never a two-factor challenge (a passkey counts as both factors — see **Passkeys**); `401` `PASSKEY_FAILED_MESSAGE` for any client fault (unknown credential, bad signature, no user verification, wrong origin/RP ID, a stale/expired/replayed/wrong-ceremony challenge — one message for all of them); `429` `PASSKEY_RATE_MESSAGE` from `passkey:<x-api-client-id>`, 10 per 15 minutes |
| `auth.emailChange.cancel` | `POST /auth/email-change/cancel` | `{ token }` from the `emailChangeRequested` mail's link; voids the pending change and ends every session of the account; `400` for an invalid, used or expired token (see **Email change**) |
| `auth.emailChange.revert` | `POST /auth/email-change/revert` | `{ token }` from the `emailChanged` mail's 7-day "This wasn't me" link → `{ passwordReset }`; restores and re-verifies the old address, ends every session, deletes every passkey, and rolls back what changed since the change was requested; `400` for an invalid, used or expired token, `409 CONFLICT` `EMAIL_CHANGE_REVERT_TAKEN_MESSAGE` if the old address is now taken (see **Email change**) |
| `account.passkeys.list` ⚑ | `GET /account/passkeys` | `{ id, name, createdAt, lastUsedAt }[]`, oldest first; never the credential id or public key |
| `account.passkeys.registerOptions` ⚑ | `POST /account/passkeys/options` | `{ password? }` → `{ options, challengeId }`: the same password/reauth re-check as `account.twoFactor.setup` (`401` `data.reason: "password"`, `403` `data.reason: "reauth"`); `409` `PASSKEY_LIMIT_MESSAGE` at `MAX_PASSKEYS` (10), checked before the password/reauth re-check; `403` while impersonating |
| `account.passkeys.register` ⚑ | `POST /account/passkeys` | `{ challengeId, response, name? }` → `201` the passkey; mails `passkeyAdded`; `400` `PASSKEY_REGISTER_FAILED_MESSAGE` for a response that doesn't verify or a credential already registered; `409` `PASSKEY_LIMIT_MESSAGE`, re-checked race-safe inside the inserting transaction; `403` while impersonating |
| `account.passkeys.rename` ⚑ | `PATCH /account/passkeys/{id}` | `{ name }`; `404` for another user's or an unknown id; `403` while impersonating |
| `account.passkeys.delete` ⚑ | `DELETE /account/passkeys/{id}` | `404` for another user's or an unknown id; `409` `PASSKEY_LAST_WAY_IN_MESSAGE` for a passwordless, provider-less account's last passkey; mails `passkeyRemoved`; `403` while impersonating |
| `account.resendVerification` ⚑ | `POST /account/email/resend-verification` | `{ sent }`: mails a new link (the earlier one stops working), or `false` when already verified; `429` after 3 per user per 15 minutes |
| `account.email.get` ⚑ | `GET /account/email` | `{ email, pending: { maskedEmail, expiresAt } \| null }` (see **Email change**) |
| `account.email.requestChange` ⚑ | `POST /account/email/change` | `{ newEmail, password?, code? }` → `{ pending: { maskedEmail, expiresAt } }`; mails a confirm link to the new address and a cancel link to the current one; `401`/`403` for a wrong password, code or a stale session (`data.reason`: `password`, `code` or `reauth`), `400` `EMAIL_CHANGE_SAME_EMAIL_MESSAGE`, `429` `EMAIL_CHANGE_RATE_MESSAGE` after 3 per 15 minutes (see **Email change**) |
| `account.email.confirmChange` ⚑ | `POST /account/email/confirm` | `{ token }` → `{ email }`; sets and re-verifies the address, ends every other session, mails the old address a revert link; `400` for another account's, an invalid/used/expired token, `409 CONFLICT` `EMAIL_CHANGE_TAKEN_MESSAGE` if the address was taken meanwhile (see **Email change**) |
| `account.updateProfile` ⚑ | `PATCH /account/profile` | `{ name }` → the user |
| `account.changePassword` ⚑ | `POST /account/password` | `403` when the current password is wrong (always, for a passwordless account); ends every other session; mails the password-changed notice |
| `account.setPassword` ⚑ | `POST /account/password/set` | `{ password }`: a first password for a passwordless account; `409` when one exists; `403` "Sign in again to set a password." (`data.reason: "reauth"`) when the session is 10+ minutes old; burns reset links and open two-step challenges, stamps `sessions_revoked_at` (ends no session of its own), mails the password-changed notice, keeps sessions |
| `account.identities.list` ⚑ | `GET /account/identities` | `{ items: [{ provider, email, createdAt }] }` |
| `account.identities.disconnect` ⚑ | `DELETE /account/identities/{provider}` | `404` when not connected; `403` when it is a passwordless account's last identity and it has no passkey |
| `account.sessions.list` ⚑ | `GET /account/sessions` | The user's live sessions, the current one marked `current` |
| `account.sessions.revoke` ⚑ | `DELETE /account/sessions/{id}` | Own sessions only; `404` otherwise |
| `account.sessions.revokeOthers` ⚑ | `POST /account/sessions/revoke-others` | Ends every session but the current one |
| `account.twoFactor.get` ⚑ | `GET /account/two-factor` | `{ enabled, recoveryCodesLeft }` |
| `account.twoFactor.setup` ⚑ | `POST /account/two-factor/setup` | `{ currentPassword? }` (ignored on a passwordless account) → `{ secret, otpauthUrl }`: a new secret, stored encrypted and not yet on; replaces an unconfirmed one; `403` "Verify your email to turn on two-step verification" for an unverified email; `401` wrong (or missing) password, `data.reason: "password"`, on an account that has one; `403` a passwordless account's session 10+ minutes old, `data.reason: "reauth"`; `429` from `2fa:manage:<id>`; `409` when already on |
| `account.twoFactor.enable` ⚑ | `POST /account/two-factor/enable` | `{ code }` (a TOTP code only) → `{ recoveryCodes }` (ten, shown once); `400` before `setup`, `401` wrong code, `403` unverified email (as `setup`), `409` already on or setup replaced meanwhile; `429` from `2fa:manage:<id>`; keeps sessions; mails a notice |
| `account.twoFactor.disable` ⚑ | `POST /account/two-factor/disable` | `{ code }` (TOTP or recovery code); clears the secret, the last step and the codes, kills open challenges; `401` wrong code, `409` when off; `429` from `2fa:manage:<id>`; mails a notice |
| `account.twoFactor.regenerateRecoveryCodes` ⚑ | `POST /account/two-factor/recovery-codes` | `{ code }` → `{ recoveryCodes }`, replacing all ten; `401` wrong code, `409` when off; `429` from `2fa:manage:<id>` |
| `account.avatar.set` ⚑ | `POST /account/avatar` | Multipart `{ file }` → `{ avatarUrl }`: replaces the profile photo (see **Storage**); `400` `IMAGE_UPLOAD_MESSAGE` for anything but a PNG, JPEG or WebP up to 2 MB and 4096 × 4096; `429` "Too many uploads, try again later" after 20 uploads per user per hour |
| `account.avatar.remove` ⚑ | `DELETE /account/avatar` | `{ ok: true }`; a no-op success when there is no photo |
| `notes.list` ⚑ | `GET /notes` | `{ workspaceId, cursor?, limit? }` → `{ items, nextCursor }`, newest first, 20 per page by default (at most 100); viewer and up |
| `notes.find` ⚑ | `GET /notes/{id}` | `{ workspaceId, id }` → the note (`authorId` included); `404` "Note not found" for an id in another workspace; viewer and up |
| `notes.create` ⚑ | `POST /notes` | `{ workspaceId, title, body? }` → `201` the note, the caller as its author; member and up |
| `notes.delete` ⚑ | `DELETE /notes/{id}` | `{ workspaceId, id }`; a member deletes their own notes, an admin or owner anyone's (`403` "Requires the admin role" otherwise); `404` for an id in another workspace. `workspaceId` travels in the JSON body; a REST client that drops DELETE bodies should use the RPC transport |
| `workspaces.list` ⚑ | `GET /workspaces` | `{ items, pendingInvitations }`: the caller's workspaces with their `role`, `memberCount` and `entitlements` (plan, status, seats, features — what `billing.get` returns, less `provider`), and the invitations addressed to the caller's email — listed only once it is verified |
| `workspaces.create` ⚑ | `POST /workspaces` | `{ name }` → `201` the workspace, the caller its `owner`; `403` "Verify your email to create a workspace" while unverified; `429` "Too many workspaces created, try again in an hour" after 10 per user per hour, checked first. The slug is derived from the name (`-2`, `-3`… on collision) and never changes |
| `workspaces.get` ⚑ | `GET /workspaces/{workspaceId}` | The workspace with the caller's `role` and `memberCount`; viewer and up |
| `workspaces.update` ⚑ | `PATCH /workspaces/{workspaceId}` | `{ name }`, the slug unchanged; admin and up |
| `workspaces.delete` ⚑ | `DELETE /workspaces/{workspaceId}` | Deletes it with its memberships, invitations, notes and billing mirror; a subscription not yet `canceled` is canceled with the provider first, and a failed cancel deletes nothing (`500` "Could not cancel the subscription, try again"); owner only |
| `workspaces.leave` ⚑ | `POST /workspaces/{workspaceId}/leave` | `409` "Transfer ownership before leaving." for the last owner; viewer and up |
| `workspaces.transferOwnership` ⚑ | `POST /workspaces/{workspaceId}/transfer` | `{ userId }`: that member becomes an `owner`, the caller an `admin`, in one transaction; `400` when the target is not a member (or is the caller); owner only |
| `workspaces.members.list` ⚑ | `GET /workspaces/{workspaceId}/members` | `{ items: [{ userId, name, email, role, joinedAt }] }`; `email` is `null` for callers below admin; viewer and up |
| `workspaces.members.setRole` ⚑ | `PATCH /workspaces/{workspaceId}/members/{userId}` | `{ role }`, one of `viewer`, `member`, `admin` (never `owner`); `403` "Requires the owner role" when an admin targets an owner; `409` when it would demote the last owner; `400` for a non-member; admin and up |
| `workspaces.members.remove` ⚑ | `DELETE /workspaces/{workspaceId}/members/{userId}` | Same rules as `setRole`; removing yourself is leaving; admin and up |
| `workspaces.invitations.list` ⚑ | `GET /workspaces/{workspaceId}/invitations` | Pending, unexpired invitations; admin and up |
| `workspaces.invitations.create` ⚑ | `POST /workspaces/{workspaceId}/invitations` | `{ email, role }` → `201` the invitation, and mails `${APP_URL}/invitations/<token>`, valid 7 days; replaces a pending invitation to the same address (the old link stops working); `409` "Already a member"; `403` "This workspace has reached its member limit" when the plan's seats are all taken (pending invitations hold none); `429` after 20 per workspace per hour or 50 per inviter per hour, checked before anything is stored; admin and up |
| `workspaces.invitations.revoke` ⚑ | `DELETE /workspaces/{workspaceId}/invitations/{id}` | `404` "Invitation not found" for another workspace's id; admin and up |
| `workspaces.logo.set` ⚑ | `POST /workspaces/{workspaceId}/logo` | Multipart `{ workspaceId, file }` → `{ logoUrl }`: replaces the logo, the same rules, refusals and limiter (`upload:<userId>`, shared) as `account.avatar.set`; admin and up |
| `workspaces.logo.remove` ⚑ | `DELETE /workspaces/{workspaceId}/logo` | `{ ok: true }`; a no-op success when there is no logo; admin and up |
| `invitations.preview` | `GET /invitations/{token}` | `{ workspace: { name }, invitedBy: { name }, email, role, expiresAt }`, the address masked (`a***@example.com`); never consumes the token; `404` "This invitation is no longer valid." for an unknown, used or expired one |
| `invitations.accept` ⚑ | `POST /invitations/{token}/accept` | `{ workspace }`: membership with the invitation's role (an existing member keeps theirs), the token used up; `403` naming the masked address when the caller's email is another, `403` "Verify your email to accept this invitation" while unverified; `403` "This workspace has reached its member limit" when a new member would exceed the plan's seats — checked inside the accept transaction, so the invitation stays pending until an upgrade (an existing member is never refused); `404` as for `preview` |
| `invitations.acceptById` ⚑ | `POST /invitations/by-id/{id}/accept` | The same, for an id from `workspaces.list`'s `pendingInvitations`; an invitation addressed to someone else is `404`, like a missing one (ids are guessable) |
| `billing.get` ⚑ | `GET /workspaces/{workspaceId}/billing` | `{ plan, planName, status, features, seatLimit, seatsUsed, currentPeriodEnd, cancelAtPeriodEnd, interval, portalAvailable, provider }` from the mirrored subscription (`stripe` or `mock`); viewer and up |
| `billing.checkout` ⚑ | `POST /workspaces/{workspaceId}/billing/checkout` | `{ plan: pro\|team, interval: month\|year }` → `{ url }`, the provider's checkout (the mock activates the plan at once and returns the success URL), back to `${ACCOUNT_URL}/payments?checkout=success\|cancelled`; `409` "Use the billing portal to change your plan" while a subscription is live (not `canceled`, `incomplete` or `unpaid`); `400` "This plan is not available" for a pair with no configured price; owner only |
| `billing.portal` ⚑ | `POST /workspaces/{workspaceId}/billing/portal` | `{ url }`, the provider's billing portal returning to `${ACCOUNT_URL}/payments`; `404` "No billing account yet" before the first checkout; owner only |
| `billing.mockChange` ⚑ | `POST /workspaces/{workspaceId}/billing/mock` | `{ plan: pro\|team\|cancel, interval? }` → `billing.get`'s shape: the mock provider's in-app portal; `404` "Mock billing is not enabled" with any other provider; owner only |
| `files.get` | `GET /files/{+key}` | Service token only, no session: the bytes of an uploaded image, with its content type, for a key that a `users.avatar_key` or `workspaces.logo_key` currently holds; `404` "Not found" for any other well-formed key (a replaced or removed image included), `400` for one that fails `FILE_KEY_PATTERN`. What `createFileRoute` in `@repo/session` calls |
| `support.create` | `POST /support` | `{ email, name?, topic, message, page? }` → `{ reference: "HELP-<id>" }`; stores the request and mails support and the sender; links a signed-in caller's own session; `429` after 5 per `x-api-client-id`, 3 per address or 100 api-wide per hour (see Support below) |
| `jobs.apply` | `POST /jobs/apply` | Multipart `{ job, title, name, email, link?, note?, cv }` → `{ reference: "JOB-<id>" }`; stores the application, stores the CV and mails the hiring inbox and the applicant; `400` `CV_UPLOAD_MESSAGE` for anything but a PDF of at most `MAX_CV_BYTES`; `429` after 3 per `x-api-client-id` per hour, 3 per address per day or 50 api-wide per hour (see Hiring below) |
| `waitlist.join` | `POST /waitlist` | `{ email, source? }` (`source`: `www` default, `app`, `docs`, `help`, `jobs`) → `{ joined: true }` for a new and a repeat address alike; only a new one is stored and mailed the welcome; `429` after 5 per `x-api-client-id` per 15 minutes, checked before the insert |

REST paths are under `/openapi` (`POST /openapi/auth/sign-up`); the contract in
`@repo/api-contract` is the source of truth.

- **Stored as hashes only.** Passwords are hashed with `Bun.password` (argon2id). Session, reset,
  verify, magic-link and invitation tokens are 32 random bytes, handed to the client once and stored
  as SHA-256, so a database dump yields nothing usable. Sessions last 30 days; reset tokens an hour,
  verify tokens 24 hours, magic-link tokens 15 minutes, invitation tokens 7 days, all single-use.
- **One `tokens` table.** Every one-time token is a row with a `purpose` (`password_reset`,
  `email_verify`, `magic_link`), `token_hash`, `expires_at` and `consumed_at` (`src/queries/tokens.ts`).
  Consuming checks the purpose, so a verify token never resets a password. A magic link for an
  address with no account has no `user_id` and carries the address in `tokens.email`. A new one-time
  flow adds a purpose value, not a table. Invitations are the exception — they carry a workspace,
  a role and an address — and live in their own `invitations` table, hashed the same way (see
  **Workspaces** below).
- **Sign-up, magic-link and password-reset limiters.** Each sign-up mails a verify link to the address given, so
  two caps run before anything is checked or sent, neither keyed on the client id (which is
  ip-derived and, behind no proxy or an appending one, rotatable): `SIGNUP_EMAIL_RATE_LIMIT` per
  normalised email per hour (default 3, `signUpEmailLimiter` — bounds repeats for one address and
  CONFLICT probes for it; aliases such as `name+tag@` normalise to different keys and are bounded
  only by the global cap), then an api-wide cap, `SIGNUP_RATE_LIMIT` per
  `SIGNUP_RATE_WINDOW_SECONDS` (default 30 per 600 s, `signUpLimiter`). The per-address check runs
  first, so a repeat refused there spends no global token; a global refusal does spend that
  address's token. Past either, `auth.signUp` answers `TOO_MANY_REQUESTS` "Too many sign-ups right
  now, try again in a few minutes", which `apps/auth`'s sign-up form shows as is.
  `auth.magicLink.request` has the same pair: 3 per email per 15 minutes (`magicLimiter`) and
  `MAGIC_LINK_RATE_LIMIT` per `MAGIC_LINK_RATE_WINDOW_SECONDS` api-wide (default 30 per 600 s,
  `magicGlobalLimiter`), both silent; so has `auth.requestPasswordReset`: 3 per email per 15 minutes
  (`resetLimiter`) and `PASSWORD_RESET_RATE_LIMIT` per `PASSWORD_RESET_RATE_WINDOW_SECONDS`
  api-wide (default 30 per 600 s, `resetGlobalLimiter`), both silent. The trade-off is deliberate: a flood of sign-ups or link
  requests refuses new ones for everyone until the window passes (existing users still sign in with
  a password or a provider), instead of letting the api mail any inbox at will. The caps are in
  memory, per process: with N api replicas the effective cap is N times the setting, so lower it
  accordingly, or raise it for a launch day. Each in-memory limiter keeps at most 50,000 keys
  (`maxKeys` in `createMemoryRateLimiter`, per limiter, not one global bound): a new key at the
  cap drops expired windows, then the oldest one, whose counter restarts if it returns — so a
  flood of distinct addresses cannot grow memory without bound. The api-wide caps still bound the
  mail it sends; the sign-in limiter (`signin:<email>`) has none, so 50,000 distinct-email sign-in
  attempts within its window can reset a tripped lockout early (each one costs the caller a
  password hash's time). A tripped api-wide cap (`signup:global`, `reset:global`, `magic:global`, and telemetry's per-app
  `telemetry:app:<app>`)
  logs `rate cap tripped: <key> (refusing until the window passes)` at most once a minute per key
  (`capTripLogger` in `src/cap-trip.ts`), so operators see real users being turned away; per-email
  limits do not log. Email keys need no extra normalising: `EmailSchema` trims and lowercases
  every address before a handler sees it.
- **Sign-in limiter.** 10 attempts per email per 15 minutes (in memory, per process), on top of
  the service-wide `API_RATE_LIMIT`. An unknown email still runs a password verification, so both
  failures take the same time.
- **Reset-request limiter.** 3 requests per email per 15 minutes (in memory, per process). A
  tripped limit answers exactly like success and sends nothing, so it never reveals whether an
  account exists. The mail is enqueued after the response (see **Email** below). A third party who knows an
  email can therefore hold its reset emails for 15 minutes; that is the trade for never revealing
  whether the account exists.
- **Waitlist.** `waitlist.join` stores the normalised email once (`waitlist` table, migration
  `0007_waitlist`, `src/queries/waitlist.ts`); a repeat is a no-op with the same `{ joined: true }`,
  so the endpoint never reveals who is on the list. Its limiter allows 5 joins per 15 minutes (in
  memory, per process) keyed `waitlist:<x-api-client-id>` (`Context.clientId`; a call without the
  header shares the `waitlist:unknown` bucket), and runs before the insert, so a tripped caller
  stores nothing and gets `429` "Too many requests, try again in a few minutes". Only a new row is
  mailed: the `waitlistWelcome` template, linking to `siteUrl("www")` from `SITE_DOMAIN`, as a
  `mail.send` job, so the answer never waits on the mail provider.
- **Support.** `support.create({ email, name?, topic, message, page? })` → `{ reference }`
  (`HELP-<id>`, `supportReference` in `@repo/api-contract`) is the help center's contact form:
  service token only, like the waitlist. Limits, all in memory and before anything is stored:
  5 per hour keyed `support:<x-api-client-id>` (the help action's per-browser ip hash), 3 per hour
  per typed address (`support-to:<normalised email>`, since each request mails that address) and
  100 per hour api-wide (`support:global`), each `429` "Too many requests, try again later.".
  `normalizeEmail` only lowercases, so plus-addressing (`victim+1@…`, `victim+2@…`, …) gets a
  fresh per-recipient bucket per tag; the per-client (5/h) and api-wide (100/h) caps still bound
  the total, and `supportReceived` carries no free text, so the exposure is inbox noise and sender
  reputation, not a relay — an accepted trade-off, the same property sign-up's rate limit has.
  `topic` is one of `SUPPORT_TOPICS`, `message` 10–5000 characters, `name` at most 100; `page` is
  kept only when it is a root-relative help path of at most 200 characters (the schema catches
  anything else to undefined, and the handler applies `supportPage` again), and is
  otherwise stored as null, never refused. The row (`support_requests`, migration `0020_support`,
  `src/queries/support.ts`) and both mails commit in one transaction: `supportRequest` to
  `SUPPORT_EMAIL` (else `MAIL_FROM`'s address) with `Reply-To:` the sender and a link to
  `${AUTH_URL}/admin/support`, and `supportReceived` to the sender — the reference only, never
  their message or name, since the address is whatever was typed, with `Reply-To:` the support
  inbox (`SUPPORT_EMAIL` else `MAIL_FROM`'s address) so "just reply to this email" reaches a read
  mailbox rather than `MAIL_FROM`'s no-reply address. An `x-session-token` that
  resolves to the caller's own live session links `user_id`; an impersonation session, a dead token
  or none links nothing (and is never refused). The data export lists the user's linked requests
  (`supportRequests`); `users.purge` nulls `user_id` and `resolved_by` and keeps the typed address,
  like the waitlist. `admin.support.resolve` erases the request's `ip_hash` (its abuse-limiting job
  is done once the request is closed); nothing else ever prunes a support request — it is kept
  until an operator deletes it.
- **Hiring.** `jobs.apply({ job, title, name, email, link?, note?, cv })` → `{ reference }`
  (`JOB-<id>`, `jobReference` in `@repo/api-contract`) is `apps/jobs`'s apply form: service token
  only, anonymous, like the waitlist and support. `JobApplySchema`'s own field validation (a Zod
  schema, checked by oRPC before the handler runs) comes before any of the three limits below, all
  in memory: 3 per hour keyed `jobs:<x-api-client-id>` (the apply action's own `anon:<ip hash>`),
  3 per day per typed address (`jobs-to:<normalised email>`, since each application mails that
  address) and 50 per hour api-wide (`jobs:global`), each `429` `JOBS_RATE_MESSAGE` "Too many
  applications, try again later.". Past the limits, the CV is checked as a real PDF (`validatePdf`,
  size from `File.size` first, so an oversized file is never read — `400` `CV_UPLOAD_MESSAGE` for
  anything else) and stored under a fresh key, `applications/<random>.pdf` (`CV_KEY_PATTERN` — no
  id segment, unlike an avatar or logo key, since an application has no account to namespace by).
  One transaction then inserts the row (`job_applications`, migration `0021_job_applications`,
  `src/applications.ts`) and queues both mails: `jobApplication` to `HIRING_EMAIL` (falling back to
  wherever support requests go: `SUPPORT_EMAIL`, else `MAIL_FROM`'s address) with `Reply-To:` the
  applicant and a link to `${AUTH_URL}/admin/applications`, and `jobApplicationReceived` to the
  applicant — the role and reference only, never their own text, the same reasoning as
  `supportReceived` — with `Reply-To:` the hiring inbox. A failed commit queues the CV just written
  for `storage.delete` rather than leave it orphaned. `admin.applications.list/setStatus/delete/cv`
  (see **Admin** above) back `apps/auth`'s `/admin/applications`: the list defaults to status
  `"all"`; `setStatus` is a no-op with no re-stamp and no audit row when the status given is
  already the row's; `delete` queues the CV for `storage.delete` itself, in the same transaction,
  rather than leave it to the nightly sweep; `cv` is the only way a CV is ever served (never
  `files.get`). Applications are kept `APPLICATION_RETENTION_MONTHS` (6 months): the nightly
  `applications.prune` schedule (`50 3 * * *`; see **Jobs** below) deletes every row past its
  `delete_after` and queues its CV. Applications are address-keyed, not account-linked — there is
  no `user_id` column — so `users.purge` never touches them; `privacy.export`'s `jobApplications`
  lists only those sent from the account's own, verified address (see **Privacy** below).
- **Pruning.** Issuing a session deletes the user's expired ones, and the sessions list shows live
  sessions only. Used and expired `tokens` rows of every purpose are deleted hourly by the
  `tokens.prune` schedule (see [Jobs](#jobs)), not on any request path; a successful reset or a password change invalidates every other outstanding reset link of that
  user, and a new verify link invalidates the previous one.
- **Soft verification.** `User.emailVerified` reports the state and `apps/account` shows it; no
  user action is gated on it, but provider linking and magic-link consume purge an account whose
  email was never verified (see **Social sign-in and magic link** below). A future email-change flow must reset `email_verified_at` and send a new
  verify link.
- **`AUTH_URL`** — the auth app's base URL as the browser reaches it; reset links point at
  `${AUTH_URL}/reset-password?token=…`, verify links at `${AUTH_URL}/verify-email?token=…`, magic
  links at `${AUTH_URL}/magic?token=…`, and every provider's redirect URI is
  `${AUTH_URL}/oauth/<provider>/callback`. Defaults to `http://auth.brand.localhost:3002` outside
  production; in production the service exits at startup without it.
- **`ACCOUNT_URL`** — the account app's base URL; the password-changed notice links to
  `${ACCOUNT_URL}/security`. Defaults to `http://account.brand.localhost:3003` outside production;
  in production the service exits at startup without it.
- **`APP_URL`** — the app's base URL; invitation links point at `${APP_URL}/invitations/<token>`.
  Defaults to `http://app.brand.localhost:3001` outside production; in production the service
  exits at startup without it.
- **`SITE_DOMAIN`** — the parent domain `@repo/sites` builds cross-app links from; the waitlist
  welcome mail links to `siteUrl("www")` (`https://www.<SITE_DOMAIN>`). Defaults to
  `http://www.brand.localhost:3000` when unset (warning once in production); set it in production.
  It is also the passkey relying party id's default (`PASSKEY_RP_ID`, see **Passkeys**), and the
  api refuses to start when that does not cover the `AUTH_URL` and `ACCOUNT_URL` hosts.
- **`HIRING_EMAIL`** — where job applications are mailed (`hiringEmailOf`). Optional: falls back to
  wherever support requests go (`SUPPORT_EMAIL`, else `MAIL_FROM`'s address); the api warns at
  startup in production without it. See **Hiring** above.

## Locale

Every call from a Next app carries `x-locale` (sent by `@repo/session`; see its README): the
locale the app resolved for the request — a signed-in user's saved preference, else the `locale`
cookie, else `Accept-Language`, else `en`. `server.ts` reads the header next to
`x-api-client-id` through `localeFromHeader` (`src/i18n.ts`), trimmed and capped at 35 characters,
and puts two values on `Context`:

- **`locale`** — what the api answers in. A supported value (`isLocale`) as given; otherwise
  `negotiateLocale` on it (`en-US` → `en`); missing or unsupported → `en`.
- **`requestedLocale`** — the supported locale the header actually *named*, or `null` for a
  missing, empty or unsupported header (`negotiateLocale` answers `en` for those too, so a real
  `en-*` is told apart by a small `namesEnglish` check). This is the value `auth.signUp`, magic-link
  account creation and OAuth account creation store on the new user — `null` leaves the choice
  unset (`users.locale` stays `NULL`, which reads as English) rather than recording a guess.

**`users.locale`** (migration `0017_user_locale`, nullable `TEXT`) is the user's saved preference;
`null` means never chosen. `toUser` maps it to `User.locale`, with `null` or anything invalid
reading as `DEFAULT_LOCALE`. `Me.localeChosen` (`auth.me`) is `isLocale(user.locale)` — it exists
because the column alone cannot tell "chose English" from "never chose anything", which
`@repo/session`'s `getLocale()` needs to decide whether the saved value should outrank the
`locale` cookie. `account.setLocale` (⚑, `PUT /account/locale`) writes `users.locale` and is
allowed while impersonating, audited as `user.locale_set` like a profile write.

**User-facing messages.** Every error and notice the Next apps display goes through
`apiMessage(context, key, values?)` (`src/i18n.ts`): one `translatorFor(locale, "api")` built per
locale at module load, never per request. `requiresRoleMessage(context, role)` also translates the
role name through the catalog's `roles.*`. `FEATURE_MESSAGE_KEYS` maps each `Feature` (currently
just `chat`) to its refusal key. The `api` message catalog
(`packages/i18n/messages/<locale>/api.json`) is tested two ways in `src/i18n.test.ts`: every key
with a named constant (`AUTH_ERRORS.UNAUTHORIZED`, `WORKSPACE_ERRORS.NOT_FOUND`, …) equals that
constant when read in English — so the catalog and `@repo/api-contract`'s declared defaults can
never drift apart — and a coverage test unions every key the suite actually checks (named
constants, contract defaults, `FEATURE_MESSAGE_KEYS`, the interpolated keys, and `roles`) against
`Object.keys(messagesFor("en", ["api"]).api)`, so a new key added to the catalog without a test
fails the gate instead of shipping unverified. The wrong 2FA code on `auth.twoFactor.verify`,
`account.twoFactor.enable/disable/regenerateRecoveryCodes` carries `data: { reason: "wrong_code" }`
(`TWO_FACTOR_WRONG_CODE_REASON`/`_ERROR` in `@repo/api-contract`) precisely because its *message*
is translated and so can no longer be compared by text — `apps/account`'s code-field logic reads
`data.reason`, not `error.message`. `account.twoFactor.setup`'s own re-auth check carries
`data: { reason: "password" }` (`TWO_FACTOR_PASSWORD_REASON`) for a wrong or missing current
password, and `data: { reason: "reauth" }` (`TWO_FACTOR_REAUTH_REASON`) for a passwordless
account's stale session, told apart the same way.

**Left in English on purpose**: everything under `admin.*` (the superadmin tooling), the two
machine-facing ingest procedures (`analytics.ingest`, `telemetry.ingest`), the realtime SSE
stream's own responses, `server.ts`'s transport-level 404/413/500, and — always — logs, audit rows
and telemetry. The oRPC input-validation `BAD_REQUEST` ("Input validation failed") and the
service-kit guard/rate-limiter's own 401/429 are not translated either: they never reach
`Context`, so there is nowhere to read a locale from.

**Emails** pick their locale by who asked for them:

- **Sent without being asked** — `passwordChanged`, `twoFactorEnabled`, `twoFactorDisabled`,
  `twoFactorReset`, `accountReset`: the recipient row's own saved locale (`userLocale(row)`, next
  to `toUser`; English when it never chose one).
- **Asked for by the recipient** — `resetPassword` (`requestPasswordReset`), `magicLink`
  (`magicLink.request`), `verifyEmail` (sign-up and `account.resendVerification`):
  `selfInitiatedLocale(context, row)` — the saved locale when the account chose one, else the
  locale this request named (`context.requestedLocale`), else English. A magic link to an address
  with no account yet has no row, so it uses the request locale too.
- **`invitation`**: the invitee's saved locale when the address already has an account that chose
  one, else the inviter's `context.locale`.
- **`waitlistWelcome`**: the anonymous caller's `context.locale`.
- **`supportReceived`**: the locale the request named (`context.requestedLocale`), else English;
  `supportRequest` (to the support team) is always English.

See [Email](#email) and `packages/email/README.md`.

## Workspaces

The tenant. Migration `0008_workspaces` creates `workspaces` (`name`, a unique `slug`,
`created_by`), `memberships` (`workspace_id`, `user_id`, `role`; one row per pair) and
`invitations` (`email`, `role`, `token_hash`, `invited_by`, `expires_at`, `accepted_at`; at most one
pending row per workspace and address); `0009_notes_workspace` adds `notes.workspace_id`, giving
every existing note owner a workspace named after them (`"<name, else the email's local part>'s
workspace"`, never the full address) and dropping notes with no owner. Queries are in
`src/queries/workspaces.ts`, `memberships.ts` and `invitations.ts`; the helpers in `src/workspaces.ts`.

- **Roles.** `ROLES = ["viewer", "member", "admin", "owner"]` and `roleAtLeast` come from
  `@repo/api-contract`. Invitations and `setRole` name only `ASSIGNABLE_ROLES`; `owner` is reached
  only through `transferOwnership`.
- **`member(min)`.** Every scoped procedure takes `workspaceId` and runs behind this middleware in
  `src/router.ts` (after the session check): it loads the caller's membership and sets
  `context.workspace` and `context.role`. A non-member gets `404` "Workspace not found" whether or
  not the workspace exists, so outsiders learn nothing; a lower role gets `403` "Requires the
  `<role>` role". Every note query filters on `workspace_id` as well. `member(min)` also refuses a
  member whose account does not satisfy the workspace's required two-step verification, when that
  workspace has one on — see **Required two-step verification** below.
- **The last owner.** `assertNotLastOwner` runs inside the transaction of every leave, removal and
  role change and refuses to remove the only owner (`409` "Transfer ownership before leaving.");
  each such writer (leave, removal, role change, ownership transfer, the account purge) first locks
  the workspace row (`workspaces.lockForOwnership`, a no-op `UPDATE … RETURNING`; the user row
  before workspaces, workspaces in ascending id), so on Postgres two overlapping ones serialise and
  the second's check sees the first's committed result instead of both passing and leaving the
  workspace ownerless (SQLite has one writer at a time anyway). `assertOwnerRemains` still
  re-counts owners after the write in the same transaction, as a safety net. Tested on both
  engines; `last-owner.test.ts` races the writers on Postgres.
- **Invitations.** `newToken()` in the link, `tokenHash()` stored, 7 days (`INVITE_TTL_MS`), single
  use. Accepting needs a signed-in user whose normalised email is the invited one and is verified
  (`acceptInvitation` in `src/workspaces.ts`); the accept and the membership insert are one
  transaction, so a concurrent accept or a revoke wins cleanly. `preview` is anonymous and never
  consumes. The mail (`emails.invitation`, subject `You're invited to <workspace>`) is sent off the
  response path like every other.
- **Invite limiters.** 20 invitations per workspace per hour, keyed `invite:<workspaceId>`
  (`createServer`'s `inviteLimiter` option), then 50 per inviting user per hour across every
  workspace they administer, keyed `invite:user:<userId>` (`inviterLimiter`), so one account cannot
  flood addresses by spreading invites over many workspaces. Both are in memory, per process, and
  checked before anything is stored or sent; `429` "Too many invitations, try again in an hour".
  A concurrent invite to the same address that slips past the delete hits the partial unique index
  `invitations_pending` and is retried once.
- **Workspace-creation limiter.** 10 workspaces per user per hour (in memory, per process), keyed
  `workspace-create:<userId>` (`workspaceCreateLimiter`), checked before anything else;
  `429` "Too many workspaces created, try again in an hour".
- **Invitation domains.** An owner can limit invitations (create, re-invite, accept and acceptById
  alike) to the workspace's own email domains, and `deleteWorkspaceInTx` now locks the workspace row
  before deleting its invitations — see **Invitation domains** below.

## Billing

Billing belongs to the workspace. The plans, statuses and the `entitlementsFor` rule are in
`@repo/api-contract` (`packages/api-contract/src/billing.ts`); this app talks to the provider,
mirrors what it reports and computes entitlements from the mirror on every request. Migration
`0010_billing` creates `billing_customers` (one provider customer per workspace, `UNIQUE (provider,
customer_id)`), `billing_subscriptions` (plan, interval, status, period end, `cancel_at_period_end`
and `source_updated_at`, the provider time of the event the row reflects) and `billing_events` (the
id of every verified event received, applied or not). Queries are in `src/queries/billing.ts`; everything else in
`src/billing/`.

- **The seam.** `src/billing/provider.ts` defines `BillingProvider` (`kind`, `createCheckout`,
  `createPortal`, `hasPrice`, `cancelSubscription`, `verifyWebhook`). `createBillingFactory(env)` in
  `src/billing/create-provider.ts` picks it at boot from `BILLING_PROVIDER`:

  | `BILLING_PROVIDER` | Provider | Needs |
  |---|---|---|
  | `mock` (default) | `src/billing/mock.ts` — "checkout" activates the plan at once and returns the success URL; plan changes and cancellation go through `billing.mockChange`; no Stripe portal (`portalAvailable` is false; the Payments page offers the in-app switch/cancel instead), no webhook | nothing |
  | `stripe` | `src/billing/stripe.ts` — the `stripe` SDK: hosted Checkout, the Customer Portal, `subscriptions.cancel`, signature checks | all six `STRIPE_*` vars below |

  With `stripe`, a missing key exits at startup at any `NODE_ENV`, naming it. With `mock` and
  `NODE_ENV=production` the api warns at startup that plans activate without payment. The mock
  writes through the same `applyBillingEvent` as the webhook (provider `mock`), so seat limits,
  features and ordering behave as they will with Stripe. To add a provider, implement
  `BillingProvider` in `src/billing/` and add a case to `createBillingFactory`.
- **Prices.** Only from the env: `priceFor` / `planForPrice` in `src/billing/plans.ts` map the four
  `STRIPE_PRICE_*` ids to a plan and interval. `hasPrice` gates `billing.checkout` (`400` "This plan
  is not available"); a subscription on any other price is logged (`stripe: unknown price on sub_…`)
  and not mirrored.
- **Entitlements.** `entitlementsForWorkspace` (`src/billing/entitlements.ts`) reads the latest
  subscription, the member count and the customer, then calls `entitlementsFor`; `workspaces.list`
  / `get` return the result as `entitlements` and `billing.get` adds `provider`. `assertSeatAvailable`
  is the seat rule in `workspaces.invitations.create` and `invitations.accept` / `acceptById`
  (members only; pending invitations hold no seat). `workspaces.delete` cancels a live subscription
  with the provider first. Checkout returns to `${ACCOUNT_URL}/payments?checkout=success|cancelled`,
  the portal to `${ACCOUNT_URL}/payments`.
- **The webhook.** `POST /billing/webhook` (`src/billing/webhook.ts`) sits on `Bun.serve` next to
  `/rpc`, deliberately outside the bearer guard and the rate limiter: Stripe sends no token and no
  `x-api-client-id`. The `Stripe-Signature` header over the raw body is the authentication, and
  `API_MAX_BODY_BYTES` still bounds the body. `applyBillingEvent` (`src/billing/mirror.ts`) records
  the event id in `billing_events` and writes the mirror in one transaction, so a redelivery (Stripe
  retries, two replicas) applies once. `billing_events` grows by one row per delivery; rows older
  than Stripe's retry window (3 days) are safe to prune (indexed on `received_at`):

  | Response | When |
  |---|---|
  | `400 {"error":"Bad signature"}` | missing or invalid `Stripe-Signature` (logged without the body) |
  | `200 {"received":true,"ignored":true}` | an event type the api does not use — every POST under `mock` |
  | `200 {"received":true,"applied":true}` | mirrored |
  | `200 {"received":true,"applied":false,"reason":…}` | `duplicate` (already applied), `unattributed` (no workspace id and an unknown customer), `conflict` (the customer is mirrored to another workspace), `gone` (the workspace was deleted), `stale` (older than the row's `source_updated_at`), `customer_changed` (a different customer while the workspace's subscription is live; the mirrored one is kept), `unknown_price` |
  | `500 {"error":"Internal error"}` | a database failure; Stripe retries |

  Locally, forward Stripe's events with `stripe listen --forward-to
  api.brand.localhost:3007/billing/webhook` and put the `whsec_…` it prints in
  `STRIPE_WEBHOOK_SECRET`; the events to subscribe and the dashboard setup are in
  `docs/guides/stripe.md`.
- **Env.** `BILLING_PROVIDER` (`mock` | `stripe`; blank counts as unset), `STRIPE_SECRET_KEY`,
  `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_PRO_MONTH`, `STRIPE_PRICE_PRO_YEAR`,
  `STRIPE_PRICE_TEAM_MONTH`, `STRIPE_PRICE_TEAM_YEAR`, `ACCOUNT_URL`. `.env.example` lists them.
- **Tests.** `start()` from `src/test-server.ts` runs the mock; its `billing` lets a test drive
  `change` directly. `src/billing/webhook.test.ts` covers the route and the mirror with a fake
  provider, `src/billing/stripe.test.ts` the Stripe provider with a fake client (no network),
  `src/billing/billing.test.ts` the mirror (on both engines), entitlements, prices, the mock and the
  procedures' role matrix, and `src/workspaces.test.ts` the seat rule on invite and accept.

## API keys and /v1

A workspace API key lets an outside tool or script act as the workspace, on a small REST surface
kept apart from the internal procedures above — its own contract (`@repo/public-api-contract`),
its own authentication, its own error shape. Migration `0027_api_keys` creates `api_keys`
(`workspace_id` `ON DELETE CASCADE`, `name` 1–60, `prefix` unique and exactly 8 characters,
`secret_hash`, `scopes` as JSON text, `created_by` with no foreign key — like
`audit_log.actor_user_id` — `created_at`, `expires_at`, `last_used_at`, `revoked_at`) and a
nullable `notes.api_key_id` with no foreign key either, so revoking or deleting a key leaves its
notes in place. Queries are `src/queries/api-keys.ts` (`db.apiKeys`); the pure key logic
(generating, parsing, hashing, verifying, computing status) is `src/api-keys.ts`.

- **The key.** `bb_live_<8-char base62 prefix>_<43-char base64url secret>` (`generateApiKey`): the
  secret is 32 bytes from `crypto.getRandomValues` (256 bits), the prefix a *separate* uniform
  draw by rejection sampling, sharing no bytes or entropy with the secret — it is only a lookup
  handle. The full key is returned exactly once, from `workspaces.apiKeys.create`; only
  `secret_hash` (`tokenHash`, SHA-256 hex of the whole key) is ever stored. `parseApiKey` is strict
  (no trimming, no other tag, case-sensitive); `verifyApiKey` compares with
  `crypto.timingSafeEqual` after a length check.
- **Scopes.** `API_SCOPES = ["workspace:read", "members:read", "notes:read", "notes:write"]`
  (`@repo/api-contract/api-keys-limits`, a Zod-free subpath so a client component can import the
  constant without pulling in Zod or the oRPC contract); a key carries one to four, at least one.
- **The paid feature.** `api` is the second entry in `FEATURES` (`packages/api-contract/src/billing-plans.ts`),
  on Pro and Team; `create` needs it (`FORBIDDEN` `FEATURE_MESSAGES.api`, "Upgrade to use the
  API"), and `/v1` itself re-checks it on every request (see the guard below), so a downgrade mid-session
  stops `/v1` at once, not at the key's next natural check.
- **Expiry.** Chosen at creation — 30, 90 (the account app's default) or 365 days, or `null` for
  no expiry (`CreateApiKeySchema`'s `expiresInDays`). Status (`apiKeyStatus`) is computed at read
  time from `revoked_at` and `expires_at` against the injected clock, never stored: revoked wins
  over expired, and `expires_at <= now` is expired.
- **The cap and its lock.** A workspace holds at most `MAX_API_KEYS` (20) keys that are neither
  revoked nor expired (`countLive`). `create` runs the count and the insert in one transaction
  after `workspaces.lockForOwnership(workspaceId)` — the same lock and ordering every
  ownership-sensitive writer in [Workspaces](#workspaces) takes — so two concurrent creates at 19
  live keys can never both land a 20th (`CONFLICT` `API_KEY_LIMIT_MESSAGE`); a prefix collision on
  insert (astronomically unlikely at ~47.6 bits) retries with a fresh `generateApiKey()` up to
  `API_KEY_CREATE_ATTEMPTS` (3) times before answering `500`.
- **Management procedures and audit.** `workspaces.apiKeys.list` / `create` / `revoke` (⚑,
  `member("admin")`). `list` returns `ApiKeySummary[]` — name, prefix, scopes, `createdBy: {id,
  name} | null` with `creatorLeft` when the creator is no longer a member or was purged, timestamps
  and `status` — never the key or its hash, and stays readable while impersonating; `create` and
  `revoke` both refuse `FORBIDDEN` while impersonating. Revoking an already-revoked key is a silent
  no-op (the original `revokedAt` stands, no second audit row); another workspace's key id, or an
  unknown one, is `NOT_FOUND` `API_KEY_NOT_FOUND_MESSAGE`. Every create and revoke writes a
  `workspace.api_key_created` / `workspace.api_key_revoked` row (`auditWorkspace`, in the same
  transaction as the change, with `workspace_id` set and `target_type: "api_key"` / `target_id`
  the key's own id — see CLAUDE.md's **Activity log.** paragraph) — metadata
  `{name, prefix, scopes, expiresAt}` on create, `{name, prefix, scopes}` on revoke, carrying no
  key material. `EXPORTED_AUDIT_METADATA` and `workspaces.activity.list`'s own display allowlist
  both keep only `name`/`scopes`, never `prefix`, so neither the data export nor the workspace's
  own Activity card ever shows it.
- **The /v1 guard.** `createApiKeyGuard` (`src/v1/guard.ts`) is the only way to authenticate on
  `/v1/*` — never the service token, never a session — run in this fixed order on every request:
  1. Parse `Authorization: Bearer bb_live_…` (exactly one space, no trimming).
  2. Look up the key by `prefix` and compare the hash in constant time. An unknown prefix still
     compares — against `DUMMY_KEY_HASH` — so a miss costs what a hit does and the timing never
     tells a caller whether a prefix exists.
  3. Refuse a revoked key — its use recorded through `recordFailure("api key: revoked key used", …)`
     with ids only, never key material, at most once a minute per key (`REVOKED_REPORT_INTERVAL_MS`,
     in memory per process); the uses in between are counted and the next report carries the count
     ("(N uses since the last report)"), so a leaked key in a stuck loop writes one line a minute,
     not one per request — or an expired one.
  4. Confirm the key's workspace still exists (a raw row delete, not only the cascade, is covered).
  5. Confirm the workspace still has the `api` feature, read fresh on every request.
  6. Apply the per-key rate limiter, `api-key:<id>`, 600 requests a minute by default
     (`apiKeyLimiter` option).
  7. Write `last_used_at`, throttled to once a minute per key in an in-memory map — so the value is
     approximate: up to a minute stale, and with several replicas each throttling independently it
     can step backwards across writes.

  Every refusal in steps 1–5 is `401 unauthorized`, with no oracle for which reason; a caller's
  address that exhausts `apiAnonLimiter` (60 refused requests a minute by default, keyed
  `v1-anon:<hash of the socket address>` — the proxy's address behind one that does not forward the
  real client address, so every caller behind it then shares this one budget) gets `429
  rate_limited` instead. A valid key is never counted against `apiAnonLimiter`.
- **The error shape.** Every `/v1` error, from the guard and from a handler alike, is
  `{"error":{"code","message"}}`:

  | Status | `code` | When |
  |---|---|---|
  | 401 | `unauthorized` | No key, malformed, unknown, revoked, expired, or the workspace lost the `api` feature — one message for all of these |
  | 403 | `forbidden_scope` | The key lacks the route's scope (the message names it); checked *before* input validation, so a wrong-scope key is never also told its body was invalid |
  | 404 | `not_found` | An id outside the key's workspace, or an unknown `/v1/*` path *given a valid key* — without a key, an unknown path is `401` instead, since the guard runs first and nothing is revealed to an unauthenticated caller |
  | 400 | `validation_failed` | Input failed its Zod schema |
  | 413 | `validation_failed` | The request body exceeded `maxBodyBytes` |
  | 429 | `rate_limited` | Either limiter above, with `Retry-After` |
  | 500 | `internal` | Anything unexpected, a guard database failure included — a thrown error never leaks past `v1Protected`'s own `try`/`catch` |
  | 503 | `internal` | Past `REQUEST_TIMEOUT_MS` (`withRequest`'s `timeoutResponse`, so even a timeout keeps the `/v1` shape rather than the service-kit default) |
- **Every route and its scope** (`src/v1/router.ts`, implementing `publicContract`):

  | Route | Scope | Answers |
  |---|---|---|
  | `GET /v1/workspace` | `workspace:read` | `{id, name, slug, plan}` |
  | `GET /v1/members?cursor&limit` | `members:read` | `{items: [{userId, name, role, joinedAt}], nextCursor}` — never an email |
  | `GET /v1/notes?cursor&limit` | `notes:read` | `{items: Note[], nextCursor}`, newest first |
  | `GET /v1/notes/{id}` | `notes:read` | `Note` |
  | `POST /v1/notes` `{title, body?}` | `notes:write` | `201 Note`, authored by the key, reusing `notes.create`, `publishAfterCommit` and `recordEvent("note_created", {userId: null, …})` |
  | `DELETE /v1/notes/{id}` | `notes:write` | `204` |
  | `GET /v1/openapi.json`, `GET /v1/docs` | none | the generated spec / its Scalar reference |

  `limit` is 1–100 (default 25); `cursor` is the previous page's `nextCursor`.
- **Isolation.** Every query is filtered to `workspace_id = key.workspaceId` in SQL
  (`notes.page`/`findDetail`/`delete`, `memberships.page`, `workspaces.find`), so another
  workspace's note id is `404 not_found` for get and delete. The members cursor stays
  filter-only — a keyset position, not a reference — rather than answering differently for an id
  from another workspace: the same SQL filter already confines the answer to the key's own rows,
  and rejecting an id that happens to belong to a member who has since left would break ordinary
  paging.
- **`notes.api_key_id` / `Note.apiKey` / "via API key".** The internal `Note` carries
  `apiKey: {id, name} | null` next to `authorId: number | null`, set wherever a `Note` is built —
  `notes.list`, `notes.find`, `notes.create`, the realtime `note.created` event — so a note made
  through `/v1` (`authorId: null`, `apiKey: {id, name}`) is not read as "Deleted user";
  `apps/app`'s `/notes` shows "via API key `<name>`" instead, the name staying even once the key
  is revoked. A `/v1` note's `author` in the public shape is `{type: "api_key", id, name}`.
- **The Gitleaks rule.** `.gitleaks.toml`'s `bb-live-api-key` rule (keyword `bb_live_`) flags a
  leaked key by the same distinctive prefix that makes one detectable by any scanner;
  `scripts/security/gitleaks-rules.test.ts` parses the rule with `Bun.TOML` and runs it over a
  fixture of fake, `# gitleaks:allow`-marked keys (and `src/api-keys.test.ts` checks it against
  200 freshly generated ones), so it needs no Docker and runs before `bun install`.
- **Timeouts and size.** `/v1` sits outside `protect` and its per-client limiter, but still inside
  `logged` (so it gets an access line, a request id and `REQUEST_TIMEOUT_MS`) and the shared
  `maxBodyBytes` check (default 256 KiB, `API_MAX_BODY_BYTES`) ahead of Bun's own server-wide cap.
- **Not built.** `/v1` writes no audit row of its own (the management procedures above do); a note
  it writes is auditable only the way an internal one is (never, outside impersonation).

See CLAUDE.md's **API keys and /v1.** paragraph, `apps/account/README.md` (the Workspace page's
API keys card), `apps/app/README.md` ("via API key"), `packages/public-api-contract/README.md`
(the contract itself) and `docs/guides/api-keys.md` (using the feature).

## Webhooks

A workspace admin or owner registers HTTPS endpoints that the api pushes its own events to —
signed (Standard Webhooks), delivered on the job queue, never on the request path. Migration
`0028_webhooks` adds `webhook_endpoints` (`workspace_id` `ON DELETE CASCADE`, `url` 1–2000,
`description` ≤ 200 nullable, `events` JSON text with a `CHECK` that it isn't `[]`, `secret`,
`created_by` nullable with no FK — like `api_keys.created_by` — `created_at`, `enabled` (0/1,
default 1), `consecutive_failures`, `disabled_at`, `disabled_reason` `CHECK` `failures` / `gone` /
`manual` / `NULL`; index on `workspace_id`) and `webhook_deliveries` (one row per attempt:
`endpoint_id` `ON DELETE CASCADE`, `event_id`, `event_type`, `attempt`, `status` nullable, `error`
`CHECK` `timeout` / `network` / `blocked` / `redirect` / `http` / `NULL` — never a request or
response body — `duration_ms`, `created_at`; index on `(endpoint_id, created_at)`). Both cascade
on Postgres; `workspaces.delete` also deletes the rows explicitly, since SQLite may not enforce
foreign keys. Queries are `src/queries/webhooks.ts` (`db.webhooks`); the pure guard, signing and
delivery logic is `src/webhooks/`.

- **The secret.** `whsec_` + base64 of 32 random bytes (`newWebhookSecret`,
  `src/webhooks/sign.ts`), returned exactly once by `create` and `rotateSecret`; stored
  AES-256-GCM-encrypted (`v1:<iv>:<ct>`, `src/webhooks/secret.ts`) under
  `TWO_FACTOR_ENCRYPTION_KEY`, exactly like TOTP secrets — it must stay readable to sign, so it is
  never hashed. Only the delivery job ever decrypts it, and drops it immediately after signing one
  attempt.
- **The paid feature.** `api` (the same `FEATURES` entry API keys use): `create`, `update`
  (re-enabling included) and `rotateSecret` all need it, checked before the SSRF guard runs so a
  Free workspace's URL never triggers a DNS lookup; `list`, `deliveries` and `delete` work on
  every plan, so a downgraded workspace still manages — and can still remove — what it already
  made.
- **The cap and its lock.** A workspace holds at most `MAX_WEBHOOK_ENDPOINTS` (10) endpoints.
  `create` counts and inserts inside one transaction after `workspaces.lockForOwnership`, the same
  lock and ordering every ownership-sensitive writer in [Workspaces](#workspaces) takes, so two
  concurrent creates at 9 endpoints can never both land a 10th (`CONFLICT` `WEBHOOK_LIMIT_MESSAGE`,
  proven on Postgres with a real overlapping-transaction test).
- **URL rules.** `https` only (with `WEBHOOK_ALLOW_LOCALHOST_HTTP` — any `NODE_ENV` — also
  `http`/`https` to `localhost` and `*.localhost`, pinned to `127.0.0.1` with no DNS lookup); no
  userinfo, no `#fragment`, at most 2000 characters; every A/AAAA record the host resolves to (or,
  for an IP literal, the literal itself) must be a public address. `checkedWebhookUrl` runs this
  (`src/webhooks/ssrf.ts`'s `checkWebhookUrl`) at `create` and on a changed URL at `update`,
  storing the WHATWG-normalised `url.href` the guard checked; a refused URL is `BAD_REQUEST`, one
  of `webhookUrlInvalid` / `webhookUrlBlocked` / `webhookUrlUnresolved` depending on why.
- **The SSRF guard** (`src/webhooks/ssrf.ts`, OWASP's SSRF Prevention Cheat Sheet). `isPublicAddress`
  refuses IPv4 `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`,
  `192.0.2/24`, `192.88.99/24` (deprecated 6to4 relay), `192.168/16`, `198.18/15`, `198.51.100/24`,
  `203.0.113/24`, `224/4`, `240/4` and the broadcast address; IPv6 outside `2000::/3`
  (global unicast) plus, inside it, `64:ff9b::/96` and `64:ff9b:1::/48` (NAT64), `2001::/23`
  (Teredo, benchmarking, ORCHID), `2001:db8::/32` and `3fff::/20` (documentation) — with
  IPv4-compatible, IPv4-mapped, IPv4-translated and 6to4 (`2002::/16`) forms judged by the IPv4
  address they carry, and an IPv6 zone id (`%lo0`) ignored. `checkWebhookUrl` resolves the host
  with a 5-second-timeout wrapper around `dns/promises.lookup` (`systemResolver`) and refuses the
  whole URL if *any* resolved address fails that check — there is no "mostly public" pass.
- **Re-checked at delivery.** `webhook.deliver` reruns `checkWebhookUrl` immediately before
  dialling, so DNS answering differently between `create`/`update` and send (rebinding) is never a
  way in: only the addresses that check just returned are dialled, never a fresh lookup at send
  time.
- **The pinned fetch** (`src/webhooks/deliver.ts`'s `postToCheckedAddresses`). Each checked address
  is written directly into `fetch`'s own URL (IPv6 bracketed); the endpoint's real hostname is
  sent only as the `Host` header (and, over `https`, `tls.serverName`, so SNI and the certificate
  check still name the real host) — so whatever a proxy or the OS resolves for that hostname next
  is irrelevant, only the checked address is ever connected to. `redirect: "manual"` (a `3xx` is
  recorded, never followed), `proxy: false` (see the proxy caveat below), one
  `AbortSignal.any([job signal, AbortSignal.timeout(10_000)])` covering the *whole* attempt —
  every address tried, in turn, on a connection failure — and the response body is cancelled
  unread, never stored, logged or forwarded.
- **Signing** (`src/webhooks/sign.ts`), per [Standard Webhooks](https://www.standardwebhooks.com):
  `webhook-id` (`msg_` + base64url of 16 random bytes), `webhook-timestamp` (unix seconds, the
  attempt's own signing time) and `webhook-signature: v1,<base64 HMAC-SHA256>` over
  `` `${id}.${timestamp}.${body}` ``, `body` the exact bytes sent. `standardwebhooks`, the
  official library, is an `apps/api` **devDependency only** — tests prove our signature verifies
  exactly as a receiver's would; nothing imports it at runtime.
- **Events and payloads.** `WEBHOOK_EVENT_TYPES` (`@repo/api-contract/webhooks-limits`):
  `note.created`, `note.deleted`, `member.joined`, `member.left`, `member.role_changed`,
  `workspace.updated`, `api_key.created`, `api_key.revoked`; plus a test-only `ping` sent only by
  `workspaces.webhooks.test`. Each delivery's body is `{ type, timestamp, data }`, minified JSON;
  `data` is validated against `WEBHOOK_DATA_SCHEMAS[type]` (`@repo/public-api-contract/webhooks`)
  both when it is built and again inside the job's own payload schema, which strips anything the
  schema doesn't declare — so an email address can never ride along even if a caller tried to add
  one. Events and fields are additive-only, the same rule `/v1` follows.
- **Emitters.** `emitWebhookEvent(ctx, workspaceId, type, data, { tx? })` (`src/webhooks/emit.ts`)
  is called where the change already happens, inside that change's own transaction: notes
  create/delete (internal and `/v1`), member join (`invitations.accept`/`acceptById`), leave and
  remove, a role change (`members.setRole`, `workspaces.transferOwnership`), a workspace rename or
  logo change, and API key create/revoke. A rolled-back change therefore sends nothing and a
  committed one sends exactly once. It loads the workspace's enabled, subscribed endpoints first
  and stops there if there are none (so a workspace with no endpoints pays no extra reads), then
  checks the `api` feature once, then enqueues one `webhook.deliver` job per endpoint with dedupe
  key `` `webhook:${eventId}:${endpoint.id}` ``. `privacy.purge` emits `member.left` with
  `name: ""` for every membership it is about to remove, inside the purge's own transaction,
  before the account itself is erased — the empty name is deliberate: the account no longer has
  one to send.
- **The delivery job** (`webhookDeliverJob`, `src/jobs/builtin/webhooks.ts`; `maxAttempts` 8,
  `timeoutMs` 30 s — one 10 s attempt, a bounded DNS lookup and bookkeeping, with room to spare).
  Before dialling, it re-reads everything that could have changed since the event was queued: a
  deleted, disabled or no-longer-subscribed endpoint, or a workspace that lost the `api` feature,
  finishes quietly, sending nothing. A `2xx` resets `consecutive_failures` to 0. `410 Gone` disables
  the endpoint at once (`gone`), with no retry. Anything else throws, so the queue retries with its
  usual backoff (30 s doubling each time, ±20%, about an hour across the 7 retries before the 8th
  and last attempt). Every attempt writes one `webhook_deliveries` row — a status or an error
  class, never a body.
- **Auto-disable.** When the *last* attempt (by the row's own `max_attempts`, not a hard-coded 8 —
  an admin's **Retry** of a dead job gets its own fresh count) still fails,
  `consecutive_failures` increments; at `WEBHOOK_MAX_CONSECUTIVE_FAILURES` (5) the endpoint is
  disabled (`failures`), inside the same transaction as the increment. Either automatic disable
  (`failures` or `gone`) writes a `workspace.webhook_disabled` row (`auditWorkspace`, actor `null`
  — the system — `workspace_id` set, `target_type: "webhook"` / `target_id` the endpoint's id),
  metadata `{ endpointId, host, events, reason, consecutiveFailures }` — never the secret, the
  path or the query; `workspaces.activity.list`'s display allowlist keeps only `host`, `events`
  and `reason` (see CLAUDE.md's **Activity log.** paragraph) — and mails every workspace owner `webhookDisabled` (en + sv, the owner's saved
  locale, English when they never chose one), naming the host and why, and saying that events from
  while it was off are not resent. **Not counted** toward the five: a final attempt lost outright —
  the worker crashing mid-run (the row is reclaimed with `attempts` past `max_attempts` and killed
  unrun) or one whose bookkeeping is otherwise cut off. **Still counted:** a worker timeout, since
  the run continues on its aborted signal and records `timeout` before the throw. A dead delivery
  is also recorded as a telemetry `server` failure (the queue's normal "job died" path), so a
  customer's broken endpoint shows up in the admin's error list and dead-job card; retrying it from
  there runs up to 8 more attempts and can count toward disable again.
- **`webhooks.prune`** (`55 3 * * *`) deletes `webhook_deliveries` rows older than 30 days (see
  [Jobs](#jobs)).
- **The proxy caveat.** Bun 1.4.2 ignores `fetch`'s `proxy: false`: with `HTTP_PROXY` /
  `HTTPS_PROXY` / `ALL_PROXY` set (either case), a delivery still goes through that proxy — it is
  still asked to connect to the checked address already written into the request's own URL, so the
  SSRF pinning holds, but the proxy sees every delivery. The api and the dedicated worker each log
  one startup warning (`webhookStartupWarnings`, `src/webhooks/startup.ts`) naming the first such
  variable found set.
- **`WEBHOOK_ALLOW_LOCALHOST_HTTP`** (default `false`) is the only way to let delivery target
  `http`/`https` on `localhost` or `*.localhost`, honoured in *any* `NODE_ENV` — not derived from
  it, unlike most dev-only switches — with one loud startup warning when it is also on in
  production ("never in a real deployment"). `apps/e2e`'s env sets it; plain `bun dev` needs it set
  to register a `*.localhost` endpoint at all.
- **Management procedures and audit.** `workspaces.webhooks.{list, create, update, rotateSecret,
  delete, test, deliveries}` (⚑, `member("admin")`); everything but `list` and `deliveries` is
  refused `FORBIDDEN` "Not available while impersonating". `test` shares `update`'s rules (the
  `api` feature, admin and up) and queues one `ping` to that endpoint alone — it needs no
  subscription — through the same job, guard and signing as every other event; a disabled endpoint
  answers `CONFLICT` `webhookTestDisabled` rather than queue a delivery that would never leave.
  `test` is limited to `WEBHOOK_TEST_RATE_LIMIT` (20) per workspace per hour (`webhook-test:<id>`,
  in memory, `webhookTestLimiter` in the server options; `TOO_MANY_REQUESTS` `webhookTestRate`),
  since each ping can hold a worker slot for a whole 10 s attempt.
  `deliveries` returns the endpoint's most recent `WEBHOOK_DELIVERIES_LIMIT` (50) rows, newest
  first. Every create, update (only when something actually changed), secret rotation and delete
  writes a `workspace.webhook_created` / `_updated` / `_secret_rotated` / `_deleted` row
  (`auditWorkspace`, `workspace_id` set, `target_type: "webhook"` / `target_id` the endpoint's own
  id — see CLAUDE.md's **Activity log.** paragraph), metadata always `{ endpointId, host, events,
  … }` — `host` is `URL.host` (with a non-default port), never the path or query (which may carry
  a receiver's own token) — and never the secret, encrypted or not.
  `workspaces.activity.list`'s own display allowlist keeps only `host`/`events` (`_secret_rotated`
  shows `host` alone), never `enabled`/`changed` or the redundant `endpointId`.
- **Not built.** Per-endpoint delivery ordering, replaying a past delivery from the UI, IP
  allowlists, and webhooks for non-workspace (account-level) events.

See CLAUDE.md's **Webhooks** paragraph, `apps/account/README.md` (the Workspace page's Webhooks
card), `packages/public-api-contract/README.md` (the `./webhook-events` and `./webhooks`
subpaths), `packages/email/README.md` (`WebhookDisabled`) and `docs/guides/webhooks.md` (using the
feature, verifying signatures, adding a new event type).

## Social sign-in and magic link

Google, GitHub and Apple sign-in, via [Arctic](https://arcticjs.dev) in `src/oauth/` (one adapter
per provider behind `Provider`; `createProviders(env, AUTH_URL)` builds the configured ones at
boot). The api does the token exchange and keeps every secret; `apps/auth` runs the browser legs —
redirect, the `oauth` state cookie, the state check — and calls `auth.oauth.start` /
`auth.oauth.callback`. Provider tokens are not stored. Setup per provider:
[`docs/guides/oauth-providers.md`](../../docs/guides/oauth-providers.md).

| Provider | Scopes | Email the api trusts |
|---|---|---|
| Google | `openid email profile`, PKCE | the id token's `email` when `email_verified` |
| GitHub | `read:user user:email` | the primary address from `/user/emails`, only when verified |
| Apple | `name email`, `response_mode=form_post` | the id token's `email` when `email_verified` (boolean or `"true"`); the name only from the first consent's `user` body |

- **Env.** `OAUTH_GOOGLE_CLIENT_ID` / `_SECRET`, `OAUTH_GITHUB_CLIENT_ID` / `_SECRET`,
  `OAUTH_APPLE_CLIENT_ID` (the Services ID) / `_TEAM_ID` / `_KEY_ID` / `_PRIVATE_KEY`. All optional;
  a provider is on only when every one of its keys is set, and some-but-not-all exits at startup
  naming the missing keys. `OAUTH_APPLE_PRIVATE_KEY` is the `.p8` PKCS#8 PEM (one line with `\n`
  escapes works), parsed at boot: anything else exits with `OAUTH_APPLE_PRIVATE_KEY is not a
  PKCS#8 PEM`, never echoing the value. Arctic signs Apple's ES256 client secret per exchange.
- **`identities`.** One row per connected provider account: `user_id`, `provider`,
  `provider_user_id` (unique per provider), the provider's `email` at link time, `created_at`. A
  user holds at most one identity per provider (`identities_user_provider`): a second is `409`. The
  identity, not the email, is the key once linked, so a provider-side email change neither creates
  nor re-links an account.
- **Linking order** (`auth.oauth.callback`): (1) a known identity signs in its owner (`409` if a
  different user is signed in); (2) a signed-in caller connects an unclaimed identity, whatever its
  email, unless they already have one for that provider (`409`); (3) a provider-verified email links to the account with that email, or creates a
  passwordless, verified one; (4) anything else is `403` and creates nothing. Concurrent callbacks
  for the same identity resolve to the row that won the insert. A signed-in caller ((1) as its
  owner, or (2)) gets back its own session — the same token and expiry, no new row — so connecting
  never restarts the re-authentication window; and that session must be younger than
  `REAUTH_WINDOW_MS`, else `403` `connectReauth` (`data: { reason: "reauth" }`), checked before (1).
- **The pre-account-hijack purge.** Someone can sign up with a victim's address and a password of
  their own before the victim ever arrives. So when (3) links a verified provider email, or a magic
  link is consumed, into an account whose `email_verified_at` is null, `purgeUnverifiedAccount`
  runs first, in one transaction: it deletes every session and every connected identity, clears
  the password, invalidates outstanding reset links, two-factor challenges and every
  `email_change` / `email_change_cancel` / `email_change_revert` link (a change the squatter
  requested to their own mailbox would otherwise leave a live confirm link the signed-in owner
  could be talked into pressing), then marks the email verified. It also turns two-step verification off first — defense in depth, since
  `account.twoFactor.setup` / `enable` refuse an unverified account (whoever proves the mailbox
  would take such an account over anyway). The owner is
  signed in and mailed a notice, "Your account was reset" (`emails.accountReset`, linking to
  `account./security`) and can set a password there; the squatter is locked out. A verified
  account is never purged.
- **Passwordless accounts.** `password_hash` is nullable: accounts created by a provider or a magic
  link have none. `User.hasPassword` reports it; `auth.signIn` verifies against a dummy hash and
  fails like a wrong password; `account.setPassword` sets the first one; `account.identities.disconnect`
  refuses to remove the last identity of an account without a password — unless it also holds a
  passkey, which counts as a way in on its own (see **Passkeys**).
- **Magic link.** `auth.magicLink.request` is silent like the reset request (same path for known
  and unknown addresses; `magic:<email>` limiter, 3 per 15 minutes, in memory) and invalidates the
  address's earlier links. Consume is a `POST` — `apps/auth`'s `/magic` page calls it only from its
  **Continue** button, so a mail scanner's prefetch cannot burn the token. It signs in the token's
  user, or the account that now has the address, or creates a passwordless, verified one; then
  burns the user's other magic links.
- **Logs.** A failed exchange logs the provider and its OAuth error name; never the code, verifier
  or tokens.

## Two-factor

Two-step verification with an authenticator app (TOTP) and recovery codes. Once it is on, no
sign-in method issues a session without the second factor; `auth.signUp` and admin impersonation
never ask for one.

- **Migration `0013_two_factor`.** `users` gains `two_factor_secret` (the encrypted secret),
  `two_factor_enabled_at` (null = off, what every sign-in path checks) and `two_factor_last_step`
  (the last accepted TOTP step); `two_factor_recovery_codes` holds one row per code (`code_hash`,
  `used_at`, `ON DELETE CASCADE` with the user — enforced on Postgres only: the SQLite connection
  never sets `PRAGMA foreign_keys`, and nothing deletes users today); `tokens.purpose` gains `two_factor_challenge` (the CHECK
  extended as `0005` did). Queries are `src/queries/two-factor.ts`.
- **Migration `0018_sessions_revoked_at`.** `users.sessions_revoked_at`, nullable `TEXT`, stamped by
  every path that ends *all* of a user's sessions: `users.revokeSessions` (`auth.resetPassword`,
  `account.changePassword`, `account.sessions.revokeOthers`, `admin.users.revokeSessions` and
  `admin.users.resetTwoFactor`) stamps it and deletes the sessions in one transaction;
  `account.setPassword` and the unverified-account purge call the stamp-only
  `users.stampSessionsRevoked` (`setPassword` ends no session; the purge deletes them inside its
  own transaction). Ending a single session (`account.sessions.revoke`) or stopping an
  impersonation stamps nothing. `users.lockForSession`
  takes the row's write lock with a no-op `UPDATE … RETURNING`, portable to SQLite, and returns the
  stamp it guards.
- **The secret.** 20 random bytes, shown base32 and as an `otpauth://` URL (label
  `BRAND_NAME:<email>`, issuer `BRAND_NAME`), stored AES-256-GCM-encrypted (`v1:<iv>:<ciphertext>`,
  a random IV each time, Web Crypto) under `TWO_FACTOR_ENCRYPTION_KEY` (32 bytes, base64). The api
  exits at startup in production without it or with the public development key printed in
  `src/env.ts` and `.env.example`; elsewhere it falls back to that key. It is deliberately not
  derived from `API_SERVICE_TOKEN`: rotating that would lock every 2FA user out. A secret the key
  cannot open is recorded as a failure and fails the TOTP check; recovery codes (hashed, not
  encrypted) still work. Code in `src/two-factor/` (`totp.ts`, `secret.ts`, `recovery.ts`).
- **TOTP.** RFC 6238 defaults (SHA-1, 6 digits, 30 s) through `@oslojs/otp`, checked against the
  RFC's test vectors; steps now−1, now and now+1 are accepted, and a code whose step is not greater
  than `two_factor_last_step` is refused, so an accepted code never works twice.
- **Recovery codes.** Ten `xxxxx-xxxxx` codes (lowercase base32 alphabet), stored as SHA-256 hashes
  like the one-time tokens, each marked `used_at` when spent; input is trimmed, lowercased and
  re-dashed before the lookup. `enable` and `regenerateRecoveryCodes` return them once.
- **A verified email first.** `setup` and `enable` answer `403` "Verify your email to turn on
  two-step verification" while `email_verified_at` is null: an unverified account is taken over by
  whoever proves the mailbox (the purge above), so a second factor on it would protect nothing.
- **Enabling is two steps.** `setup` stores the encrypted secret with `two_factor_enabled_at` still
  null; only `enable` with a correct TOTP code (never a recovery code) turns it on, conditioned on
  that same secret, so an abandoned or concurrently replaced setup locks nobody out.
- **Setup re-checks who is asking**, before minting a secret, since a hijacked session could
  otherwise plant a second factor the real owner cannot clear: the current password
  (`input.currentPassword`) on an account that has one — wrong or missing is `401`
  `currentPasswordIncorrect`, `data: { reason: "password" }` (`TWO_FACTOR_PASSWORD_REASON`), and
  counts against `2fa:manage:<id>`'s budget — or, on a passwordless account (nothing to re-verify a
  password against), the *current session's* `created_at` under `REAUTH_WINDOW_MS` (10 minutes,
  `@repo/api-contract`); a session that old is `403` `twoFactorReauth`,
  `data: { reason: "reauth" }` (`TWO_FACTOR_REAUTH_REASON`), spending no budget (nothing was
  guessed). `apps/account`'s setup action builds the reauth link the card shows on that refusal.
  Two more gates share the window (`pastReauthWindow` in the router), both `403` with
  `data: { reason: "reauth" }`: `account.setPassword` (only a passwordless account can call it) —
  `setPasswordReauth` "Sign in again to set a password." (`SET_PASSWORD_REAUTH_MESSAGE`), so an old
  session cannot set a password and then pass setup's password check with it; and connecting a
  provider while signed in, for every account — `connectReauth` "Sign in again to connect a
  sign-in provider." (`CONNECT_REAUTH_MESSAGE`), from `auth.oauth.start` when it is sent a live,
  non-impersonation `x-session-token` (so the browser is not sent to the provider for nothing) and
  again from `auth.oauth.callback` before anything is written (the session can age during the
  round trip) — so an old session cannot attach its holder's identity and keep signing in with it.
  Without a session both are a plain sign-in, unaffected; an impersonation session stays refused by
  the callback. A connect that passes answers with the caller's *own* session (same token,
  `created_at` and expiry) rather than minting a fresh one that would restart the window.
- **The challenge.** `issueSessionOrChallenge` sits at the end of `auth.signIn`,
  `auth.magicLink.consume` and `auth.oauth.callback`, after everything that already ran there
  (password check, unverified-account purge, provider linking, limiters). With 2FA on it stores a
  `two_factor_challenge` token (32 random bytes, hashed, 5 minutes, bound to the user; the session's
  client info comes from `verify`'s own input) and answers `{ twoFactor: { challenge, expiresAt } }` instead of a session.
  `auth.twoFactor.verify` peeks at the challenge first (a dead one answers `400` before anything is
  counted), then reserves an attempt from `2fa:verify:<id>`'s budget (`hit`, before the code is
  looked at, so a parallel burst cannot all get through — `429` once it is spent), then checks the
  code; a right code gives its reservation back (`refund`), a wrong one keeps it and also counts
  against the challenge's own budget, and the challenge's fifth wrong code burns it.
  Success runs one transaction: it takes the user row's write lock first (`users.lockForSession`,
  the same order `users.revokeSessions` locks in, so the two can never deadlock), consumes the
  challenge (two right codes racing get one session), refuses a challenge older than the lock's
  `sessions_revoked_at` (a reset or password change since the challenge was issued wins), spends a
  recovery code when that is what matched, and issues the session. A recovery code a concurrent
  request already spent throws inside that transaction, rolling it back; the challenge survives,
  and the attempt is answered exactly like an ordinary wrong code.
- **Limits.** `2fa:verify:<id>`: 10 *wrong* codes per user per 15 minutes against
  `auth.twoFactor.verify`'s sign-in challenge. `2fa:manage:<id>`: 10 wrong codes (or setup's wrong
  passwords) per user per 15 minutes, shared by `setup`, `enable`, `disable` and
  `regenerateRecoveryCodes` — kept apart from `verify`'s budget so a stolen session cannot grind
  through sign-in challenges from the account page, or the reverse. Every check reserves an attempt
  with `hit` first and gives it back with `refund` when the code (or password) is right, so the
  count is atomic under concurrency and only a failure stays counted (`FailureLimiter` in
  `@repo/service-kit`). Plus
  `2fa:challenge:<hash>`: 5 wrong codes per challenge; `reset2fa:<adminId>`: 10 admin resets per
  hour. All in memory, per process.
- **What ends a challenge.** Besides verifying: `disable`, an admin reset, `auth.resetPassword`,
  `account.changePassword`, `account.setPassword`, `account.sessions.revokeOthers`,
  `admin.users.revokeSessions` and the unverified-account purge invalidate the user's open
  challenges (directly, or by stamping `sessions_revoked_at` before the challenge was issued —
  either makes `verify` refuse it). A password reset by email sets only the password: 2FA stays on
  and the next sign-in still asks.
- **Impersonation.** `setup`, `enable`, `disable` and `regenerateRecoveryCodes` answer `FORBIDDEN`
  "Not available while impersonating" (declared in the contract alongside each one's other
  `FORBIDDEN`); `get` stays readable.
- **Mail.** `twoFactorEnabled`, `twoFactorDisabled` and `twoFactorReset` from `@repo/email`,
  `mail.send` jobs like `passwordChanged`.
- **Env.** `TWO_FACTOR_ENCRYPTION_KEY` — required in production; generate it with
  `openssl rand -base64 32`. `.env.example` and `apps/api/.env.example` list it.

## Passkeys

WebAuthn sign-in (`@simplewebauthn/server`, wrapped in `src/passkeys.ts`): registered on
`apps/account`'s Security page, used to sign in on `apps/auth`'s `/login`. A passkey **signs in on
its own and counts as both factors** — `auth.passkey.verify` never returns a two-factor challenge,
even for an account with two-step verification on.

- **Migration `0024_passkeys`.** `passkeys` (`id`, `user_id` — no FK, like every other user-owned
  table here: `users.purge` and admin removal delete the rows explicitly — `credential_id` TEXT
  UNIQUE base64url, `public_key` TEXT base64url COSE, `counter`, `transports` JSON text or null,
  `name`, `created_at`, `last_used_at`), indexed on `user_id`. `tokens.purpose` gains
  `passkey_challenge` (the same CHECK-constraint rebuild `0013` used for `two_factor_challenge`)
  plus a new `ceremony` column (`register` | `authenticate`, nullable — every other purpose leaves
  it null), so a registration challenge (bound to `user_id`) and a sign-in challenge (not bound)
  share one purpose value without either being redeemable as the other. Queries are
  `src/queries/passkeys.ts`.
- **Relying party.** `PASSKEY_RP_ID` (env; unset → `SITE_DOMAIN`, normalised as `@repo/sites`
  reads it, else `brand.localhost`) — the registrable domain shared by `apps/auth` and
  `apps/account`, since a credential registered on one origin must work signing in on the other.
  `loadEnv` refuses to start (any `NODE_ENV`) when it is neither equal to nor a parent domain of
  both the `AUTH_URL` and `ACCOUNT_URL` hosts, naming the three values (`rpIdCovers` in
  `src/env.ts`): a mismatch would otherwise fail every ceremony in the browser, indistinguishable
  from a cancelled prompt.
  `PASSKEY_RP_NAME` (unset → `BRAND_NAME`) is only what the browser's prompt shows. The expected
  **origins** are not separately configurable: only the `AUTH_URL` and `ACCOUNT_URL` origins,
  deduplicated. A wrong origin or RP ID is refused — never a 500 — by `verifyRegistration` /
  `verifyAuthentication` in `src/passkeys.ts`, which wrap the library in try/catch and turn every
  client fault into `null`. See `docs/guides/passkeys.md` for subdomains and local dev.
- **User verification is `required`**, not the library's `preferred` default (tightened once its
  v13 behaviour was checked, since a passkey must stand in for both factors — a security key with
  no PIN, which only proves possession, is refused). Attestation `none`; resident key `required`
  (discoverable: `auth.passkey.options` names no user — the credential does — so sign-in carries no
  `allowCredentials`).
- **The challenge.** `challengeId` is the WebAuthn challenge itself (32 random bytes, base64url) —
  only its hash is stored, in a single-use `tokens` row, 5 minutes (`PASSKEY_CHALLENGE_TTL_MS`):
  `register` bound to the caller's `user_id` with `ceremony: "register"`, `authenticate` unbound
  with `ceremony: "authenticate"`. Both verify paths start by consuming it
  (`tokens.consume(tokenHash(challengeId), "passkey_challenge", now)`, the same conditional
  `UPDATE … RETURNING` every other one-time token uses) before anything else is checked, so the
  challenge is spent whether or not the response then verifies, and of several concurrent attempts
  exactly one gets the row.
- **The counter.** `counterAdvances(stored, next)`: an authenticator that keeps one (either side
  non-zero) must report a counter strictly greater than last time, or the attempt is refused and
  recorded (`recordFailure("passkey counter did not increase", …)`) — the tell for a cloned
  authenticator. Both sides zero (a passkey that keeps no counter) is accepted.
  `passkeys.recordUse(id, expected, counter, at)` is a compare-and-set
  (`WHERE counter = expected`), so a concurrent sign-in that already moved it wins and this one is
  refused rather than overwriting it.
- **Sign-in** (`auth.passkey.verify`) applies everything `auth.signIn` applies after its password
  check except the code step: a deletion-scheduled account signs in (to cancel), impersonation
  never originates here, no verified-email gate. Limiter `passkey:<x-api-client-id>`, 10 per 15
  minutes, reserved before the response is checked and refunded on success — plus the general
  per-client api limiter. There is no api-wide sign-in cap to join: `auth.signIn` itself has only a
  per-email one, and a signature cannot be brute-forced, so this is a documented gap rather than a
  new global limiter. Once the signature verifies, `passkeys.recordUse` and `issueSession` share
  one transaction that locks the user row first — the order `admin.users.removePasskeys` also
  takes — so a sign-in racing an admin's removal can never leave a session alive past it: whichever
  commits first wins; the other either finds the passkey already deleted (`recordUse` matches by
  id) or deletes the session this verify just made.
- **The cap.** An account may hold at most `MAX_PASSKEYS` (10) passkeys.
  `account.passkeys.registerOptions` checks the count first, before the password/reauth re-check
  below, so a full account spends no password attempt on a request that was always going to be
  refused (`409 CONFLICT` `PASSKEY_LIMIT_MESSAGE`). `account.passkeys.register` re-checks it,
  race-safe: the count and the insert run in one transaction that locks the user row first (the
  order every writer here uses), so two concurrent registers at 9 serialise on the lock and the
  second counts the first's committed row.
- **Registering** shares the fresh-credential gate two-step setup uses
  (`requireFreshCredential` in `src/router.ts`, called by both `account.twoFactor.setup` and
  `account.passkeys.registerOptions`): the current password on an account that has one — wrong is
  `401` `data.reason: "password"`, counted against the shared `2fa:manage:<id>` budget — else a
  session under `REAUTH_WINDOW_MS` on a passwordless account, a stale one `403`
  `data.reason: "reauth"`. `registerOptions`, `register`, `rename` and `delete` all refuse while
  impersonating (`FORBIDDEN` "Not available while impersonating"); `list` stays readable.
- **The last way in.** `account.passkeys.delete` refuses (`409 CONFLICT`
  `PASSKEY_LAST_WAY_IN_MESSAGE`) to remove a passwordless, provider-less account's only remaining
  passkey — the same "keep one way in" rule `account.identities.disconnect` applies to its last
  identity, except `disconnect` also counts the account's passkeys: it refuses only when the
  account is passwordless, has at most one identity left **and** zero passkeys. Both decide inside
  a transaction that locks the user row first (`tx.users.lockForSession`), so two concurrent
  deletes of the account's last two passkeys, or a disconnect and a passkey delete racing each
  other, cannot both pass: the second sees the first's committed result rather than racing it on a
  stale count.
- **Admin removal** (`admin.users.removePasskeys`, superadmin only, never self or another
  superadmin, reason 3–200, limiter `removepasskeys:<adminId>` 10/hour) strips every passkey
  unconditionally — no last-way-in guard, and no conflict for an account with none. Removing all
  of them never locks the account out (a password, or a magic link to its verified email, still
  works); it just ends the shortcut. One transaction, the user row locked first (the same order
  **Sign-in** above takes, so the two can never deadlock): `deleteAllForUser`, void any outstanding
  register challenge (`tokens.invalidateForUser(…, "passkey_challenge", …)` — a sign-in challenge
  is never bound to a user, so there is nothing per-user to void there), then end every session
  in that same transaction (`users.revokeSessionsInTransaction`, stamping `sessions_revoked_at` —
  shares its statements and their order with `users.revokeSessions`). Audits
  `user.passkeys_removed` and mails `passkeysRemoved`. Shares `loadAdminTarget`
  (self/superadmin/not-found checks) with `admin.users.resetTwoFactor`.
- **Squatter passkeys.** Two rulings close the pre-account-hijack hole a passkey would otherwise
  leave open: `purgeUnverifiedAccount` (run when a provider links or a magic link is consumed into
  an account whose email was never verified) now also deletes the user's passkeys and voids their
  open `passkey_challenge` tokens, in a transaction that locks the user row first (the order every
  passkey writer takes), so a squatter's passkey sign-in racing it either commits first and has
  its new session deleted by the purge, or waits and then finds no passkey — never a deadlock, never
  a surviving session; `auth.resetPassword`, inside the reset's own transaction, does
  the same when the account's email is still unverified at the time of the reset (a reset proves
  the mailbox, the same reasoning a magic link already gets the benefit of). A verified account's
  passkeys are untouched by either path — only a squatter's survive to be removed.
- **Mail.** Three templates, like `twoFactorEnabled` / `twoFactorDisabled` / `twoFactorReset`
  before them: `passkeyAdded` and `passkeyRemoved` (self-service, naming the passkey) and
  `passkeysRemoved` (admin removal, plural — it always removes every one and ends every session,
  so it has no single name to interpolate).
- **Privacy.** The data export lists each passkey's `name`, `createdAt` and `lastUsedAt` only,
  never the credential id or public key (see **Privacy** below); `users.purge` deletes the rows
  outright. `User.passkeys` (a count) is populated everywhere a `User` is built, for the UI badge.
- **Env.** `PASSKEY_RP_ID`, `PASSKEY_RP_NAME` — both optional (but in production `SITE_DOMAIN` or
  `PASSKEY_RP_ID` must cover the `AUTH_URL` / `ACCOUNT_URL` hosts); see **Relying party** above
  and `docs/guides/passkeys.md`.

## Email change

Changing the address a user signs in with (`account.email.{get,requestChange,confirmChange}` ⚑,
`auth.emailChange.{cancel,revert}` anonymous, button-consumed) — the new address proven by a
confirm link before the switch, the old one told before and after with a single-use "This wasn't
me" undo link. See CLAUDE.md's **Email change** paragraph for the behaviour in one place; this
section is the api-side reference.

- **Migration `0025_email_change`.** Three new `tokens.purpose` values and one nullable column —
  no new table, since `tokens.email` (added by `0005_identities` for a magic link's pre-account
  address) already holds exactly one address per row: `email_change` (bound to `user_id`, `email`
  = the new address, 24 h — `EMAIL_CHANGE_TTL_MS` in `src/credentials.ts`), `email_change_cancel`
  (bound to `user_id` only, 24 h — the request-time cancel link) and `email_change_revert` (bound
  to `user_id`, `email` = the old address, 7 days — `EMAIL_CHANGE_REVERT_TTL_MS`). `requested_at`
  is new and only `email_change_revert` sets it: `confirmChange` writes the consumed
  `email_change` token's own `created_at` into it, so a revert always rolls back from when the
  change was *requested*, not confirmed. `tokens.create`/`consume`/`peek`/`invalidateForUser`
  needed no logic change — already generic over the purpose and the nullable `email` column;
  `tokens.latestLive` and `tokens.invalidateForUserAfter` (by row id, not time — see **Revert**
  below) are the two queries this feature added.
- **`account.email.get()`** — `{ email, pending: { maskedEmail, expiresAt } | null }` from the
  newest live `email_change` token (`maskEmail`); read-only while impersonating.
- **`account.email.requestChange({ newEmail, password?, code? })`** — refused while impersonating;
  re-authenticates like two-step setup (`requireFreshCredential`: the current password on an
  account that has one, `401` `data.reason: "password"`, else a session under
  `REAUTH_WINDOW_MS`, `403` `data.reason: "reauth"`), and when two-step verification is on also a
  current TOTP or recovery code (`checkSecondFactor`, `401` `data.reason: "code"`, the shared
  `2fa:manage:<id>` budget `account.twoFactor.disable` also spends from); `newEmail` normalised
  like sign-up and refused if unchanged (`400` `EMAIL_CHANGE_SAME_EMAIL_MESSAGE`); limiter
  `email-change:<userId>`, `EMAIL_CHANGE_RATE_LIMIT` (3) per `EMAIL_CHANGE_RATE_WINDOW_MS` (15
  minutes, `429` `EMAIL_CHANGE_RATE_MESSAGE`). One transaction, the user row locked first: the
  account's live `email_change` and `email_change_cancel` tokens are voided and a new pair stored —
  **even when `newEmail` is already taken**, so a taken address leaves the identical pending state
  (and the identical answer) a free one does; only the confirm mail to the taken address is
  withheld, closing the existence oracle `account.email.get` would otherwise be. On a free address
  both mails are enqueued inside that same transaction (`{ tx }`), so a failed job insert rolls the
  whole request back rather than commit a token nobody was told about: `emailChangeConfirm` to the
  new address (`${ACCOUNT_URL}/email/confirm?token=…`) and `emailChangeRequested` to the current
  one (the masked new address, `${AUTH_URL}/email/cancel?token=…`).
- **`account.email.confirmChange({ token })`** — the token's own account only (`400`
  `EMAIL_CHANGE_WRONG_ACCOUNT_MESSAGE` for another's, the token left usable by its owner); an
  unknown/used/expired/replaced token is `400` `EMAIL_CHANGE_LINK_INVALID_MESSAGE`. One
  transaction, the user row locked first: the token consumed, the address re-checked free (`409
  CONFLICT` `EMAIL_CHANGE_TAKEN_MESSAGE` — the unique index is the backstop for the Postgres race),
  `users.changeEmail` sets the address and `email_verified_at` together, an `email_verified`
  analytics event fires if the account was unverified (once per account, per this README's
  **Email** section), every other reset/verify/magic-link/change/cancel token is voided, every
  session but the caller's ends (`revokeSessionsInTransaction(..., { except: caller's session })`),
  an `email_change_revert` token is issued for the old address, `billing.customers.followEmail`
  moves the workspace's mirrored Stripe customer email to the new address (the provider itself is
  never told — its next customer event writes the old one back over the mirror, the same accepted
  limitation **Privacy**'s purge documents), and an audit row `user.email_changed` (`{ from, to }`
  both masked) is written, and `emailChanged` (the old address's 7-day revert link) is enqueued
  in that same transaction (`{ tx }`): a failed job insert rolls the whole confirm back, so a
  change never commits without its undo link.
- **`auth.emailChange.cancel({ token })`** (anonymous — relies on the service guard's per-client
  limit and a 32-byte token, like every other one-time-link consumer; no limiter of its own) —
  voids the pending `email_change`/`email_change_cancel` pair and ends *every* session of the
  account, including whichever one made the request (it may have been stolen); audits
  `user.email_change_cancelled`. A link already consumed by a confirm is `400` link-invalid.
- **`auth.emailChange.revert({ token })`** — restores the old address, re-verified (`409 CONFLICT`
  `EMAIL_CHANGE_REVERT_TAKEN_MESSAGE` if it is now held by another, *verified* account, nothing
  else changing and the link left usable). An **unverified** holder — typically a sign-up on the
  address the change freed, made to defeat the undo — is displaced inside the transaction: the link
  proves that mailbox, so the holder is a squatter by `purgeUnverifiedAccount`'s rule. Its row is
  locked after the reverting user's (ascending id; a lower id is `409` rather than a possible
  deadlock), re-read under the lock, refused (`409`) if it belongs to any workspace, then deleted
  with `users.purge` (files queued for `storage.delete`) and audited `user.displaced_by_revert`
  (actor `null`, `{ email, revertedUserId }`, the address masked) before the address is restored.
  A sign-up racing the revert loses on the unique index either way — `409` for whichever comes
  second, never a `500`;
  ends every session, deletes every passkey, voids every other one-time token (including a
  pre-account magic link to either address). **The rollback window**: using `requested_at` (not
  the confirm) as the cutoff, it deletes any identity linked since (`identities.
  deleteForUserSince`), turns two-step off if it was turned on since (`twoFactor.
  disableInTransaction` — one already on before the request stays; an admin reset is the way to
  remove that), and cancels an account deletion requested since. When the account had a password
  it is cleared and a fresh reset link mailed (`createResetLink`, the helper
  `auth.requestPasswordReset` also uses) to the restored address — `{ passwordReset: boolean }` in
  the response tells the caller whether that happened. **Only newer revert tokens are voided**
  (`tokens.invalidateForUserAfter`, by row id, not "every other") — so after a second change the
  newest link (in whoever made both changes' mailbox) always dies first, but an older link to an
  address the account held before stays live for its own 7 days: the accepted cost of making the
  *oldest* link always win rather than the newest. `billing.customers.followEmail` moves the
  mirror back; audits `user.email_change_reverted` (`{ from, to, via: "email_link", passwordReset,
  passkeysRemoved, identitiesRemoved, twoFactorDisabled, deletionCancelled }`); mails
  `emailChangeReverted`, which lists exactly what was undone and always asks the owner to review
  their connected providers and two-step verification.
- **Locale.** `emailChangeConfirm` (self-initiated, to the address being proven) uses the usual
  saved-else-request-else-English rule; `emailChangeRequested`, `emailChanged` and
  `emailChangeReverted` (every mail to the account's own current or old address) use the saved
  locale, else English — never the request's, the same rule `passwordChanged` follows, since an
  attacker's request locale should never decide what the victim's mailbox reads.
- **Why no confirmation from the old address.** OWASP's Authentication Cheat Sheet's stricter
  option would hold the change until the old mailbox confirms it too; this api deliberately does
  not, since a user who has lost the old mailbox must still be able to change their email — the
  before/after notices and the 7-day undo link are the mitigation. See
  `docs/guides/email-change.md`.
- **Known, accepted races.** A password sign-in can commit a session after a concurrent
  `confirmChange`/`revert` ended the others (only a two-factor challenge checks
  `sessions_revoked_at` before turning into a session); a two-step `enable` already in flight when
  a `revert` commits can still stamp a factor timestamped after it (it needs the session the
  revert just ended).

## Suspension

Blocking an account from signing in without deleting anything (`admin.users.suspend` /
`unsuspend`, superadmin only) — reversible, short of the account-deletion purge. See CLAUDE.md's
**Suspension** paragraph for the behaviour in one place; this section is the api-side reference.

- **Migration `0026_suspensions`.** Four nullable columns on `users`, no new table:
  `suspended_at` (TEXT, null = not suspended), `suspended_until` (TEXT, null = indefinite),
  `suspension_reason` (TEXT, internal — never shown to the suspended user or exported) and
  `suspended_by` (INTEGER, no FK — set `NULL`, not cascaded, when that admin's account is purged,
  the same pattern `audit_log.actor_user_id` uses).
- **The rule.** `isSuspended(user, now)` in `src/queries/users.ts`: `suspended_at` set and
  (`suspended_until` null or later than `now`). Pure, called with `Context.now()` — the same
  injected clock `src/server.ts` builds once (`options.now ?? (() => new Date())`) and the job
  worker already used, so tests inject one clock everywhere — the admin side included: `suspend`'s
  `until` check and `suspended_at` stamp, and `admin.users.list` / `get`'s `active` flag and
  `suspended=true` filter, all read `context.now()`. Nothing clears an expired
  suspension's columns: expiry is never written back by a job, and a row stays "suspended,
  inactive" until an admin calls `unsuspend`.
- **Where it's checked** (`refuseSuspended(context, user)`, `FORBIDDEN`
  `apiMessage(context, "accountSuspended")`) — always after the path's own credential check, so a
  wrong credential answers exactly as before: `issueSessionOrChallenge` (password sign-in,
  magic-link consume and the OAuth callback's sign-in branch all share this one function),
  `auth.twoFactor.verify` (the user re-read under `lockForSession` right after `tokens.consume`, so
  a challenge issued before the suspension is already dead — `revokeSessionsInTransaction` deleted
  it — and one minted by a sign-in that raced the suspension is caught here; the throw rolls back
  the challenge consume and a recovery code's spend, but a TOTP code's step was already advanced
  by `setLastStep` outside the transaction, so that code stays spent), `auth.passkey.verify` (the
  same pattern, rolling back the counter and `last_used_at`), and `admin.users.impersonate` (its own
  `SUSPENDED_TARGET_MESSAGE`, before the limiter — see **Admin**). The OAuth callback and
  magic-link consume may still link an identity, purge an unverified pre-registration or mark the
  email verified before refusing (the existing linking rules, which need provider or mailbox
  proof) — harmless, since no session is issued. `ACCOUNT_SUSPENDED_MESSAGE` is
  declared `FORBIDDEN` on `auth.signIn`, `auth.magicLink.consume`, `auth.twoFactor.verify` and
  `auth.passkey.verify`; `auth.oauth.callback` already declares a different `FORBIDDEN` default
  (`providerEmailUnverified`) for the same error code — oRPC allows one default per code — and
  still answers `accountSuspended` on this path, a comment in the contract notes it.
- **Sessions.** `resolveSession` (`src/access.ts`) takes `now` too: a suspended user's session (an
  impersonation session of them included) resolves to null and is **deleted on sight**, not just
  refused — suspending already ends every session in its own transaction, so the only rows left
  belong to a sign-in that raced the suspension. One presented while the suspension holds is
  deleted; one never presented until a timed suspension's `until` has passed works again, as a
  fresh sign-in by the same credential holder would. Every ⚑ procedure (`requireSession`), the realtime stream's
  `authorize` (on connect and its 60 s recheck) and `support.create`'s optional session link all go
  through it; `optionalSessionUser` (the OAuth callback's connect detection) treats a suspended
  user's session the same way without deleting the row itself — the next ⚑ call does.
- **`admin.users.suspend({ userId, reason, until? })`.** Superadmin only (`NOT_FOUND` otherwise,
  impersonation included); refuses the admin's own id and another superadmin
  (`SELF_SUSPEND_MESSAGE` / `SUPERADMIN_SUSPEND_MESSAGE`); `until`, when given, must be strictly
  future and at most `SUSPEND_UNTIL_MAX_DAYS` (365) days ahead (`BAD_REQUEST`
  `SUSPEND_UNTIL_INVALID_MESSAGE`, checked before the limiter); limiter `suspend:<adminId>`
  20/hour, shared with `unsuspend`. One transaction, the user row locked first
  (`lockForSession`, the order `resetTwoFactor`/`removePasskeys` also take): `users.suspend` writes
  all four columns (`suspended_at` always bumps to "now", even on a reason-only re-suspend — it
  marks when the *current* terms took effect, not when the account was first suspended),
  `revokeSessionsInTransaction` ends every session and stamps `sessions_revoked_at`, and
  `accountSuspended` is enqueued in that same transaction — but only when no suspension was in
  force (`isSuspended` on the row re-read under the lock: never suspended, or expired) or the end
  date changed, never twice for a reason-only edit. `until` is stored normalised
  (`new Date(until).toISOString()`), so the list filter's string comparison and the "changed"
  check see one form per instant. A target purged between the lookup and the lock answers
  `NOT_FOUND`, with no mail and no audit row (`unsuspend` too). Audited after the transaction:
  `user.suspended` (no suspension in force — first time, or over an expired record) or
  `user.suspension_updated` (re-suspending one still in force), the
  admin's `reason` in the audit row's own field — never exported (see **Privacy** below).
- **`admin.users.unsuspend({ userId, reason })`.** Same target-loading and refusals. A row whose
  `suspended_at` is already null returns `{ ok: true }` at once — no limiter hit, no audit, no
  mail. Anything else, including an expired-but-uncleared suspension, hits the limiter, clears all
  four columns and enqueues `accountUnsuspended` inside one transaction (user row locked first),
  then audits `user.unsuspended`. In `apps/auth` the **Lift suspension** form is what the card
  shows whenever a record exists, expired or not, so an expired record is cleared there — and
  suspending again after expiry means lifting first.
- **Mail.** `accountSuspended` (`{ name?, until, brand? }`) and `accountUnsuspended`
  (`{ name?, brand? }`) in `@repo/email`, en + sv — neither template takes a reason or an admin id
  prop, so neither can ever carry one. Both use the account's saved locale, else English, the same
  rule `passwordChanged` follows.
- **Privacy export.** `profile.suspended` is `{ at, until } | null` — `suspension_reason` and
  `suspended_by` are simply never selected by the export's column list. The export's `auditLog`
  section normally forwards an admin-written row's own `reason` to the user (by design, for other
  admin actions such as a 2FA reset or passkey removal); `REASON_REDACTED_ACTIONS` in
  `src/jobs/builtin/privacy.ts` nulls it specifically for `user.suspended`, `user.suspension_updated`
  and `user.unsuspended` rows, closing a leak that mechanism would otherwise reopen.
- **Admin views.** `AdminUser.suspended` is `{ at, until, active, reason, by } | null`: present
  whenever the row has a suspension record at all, expired or not — only `unsuspend` clears it.
  `active` is `isSuspended(row, now)` computed at read time (`toSuspended` in `src/router.ts`), so
  a client never re-derives it from `until`; `admin.users.list({ suspended: "true" })` filters on
  that same `active` test, not raw column presence.
- **Testing.** `src/suspension.test.ts` (both engines): every sign-in path compared
  wrong-credential vs. suspended-with-right-credential, the Swedish message, existing sessions
  refused and deleted, expiry with an injected clock, re-suspend and unsuspend no-ops, and —
  Postgres only — a session racing the suspension in genuinely overlapping transactions
  (`overlapNextTransactions`) leaves no usable session, for both `auth.twoFactor.verify` and plain
  password sign-in.

## Storage

User files — a profile photo per user and a logo per workspace — behind one seam,
`src/storage/` (`Storage`: `put(key, bytes, contentType)`, `get(key)`, `delete(key)`; a missing key
is not an error; `list(prefix)`, an async iterable of `{ key, lastModified }` for `storage.sweep`), picked at boot by `createStorage(env)` from `STORAGE_PROVIDER`. Uploads go
through our servers (form → server action → this api → storage): no presigned URLs, no bucket CORS,
and every form works without JavaScript; small images only. Setting up a bucket:
`docs/guides/storage.md`.

- **Providers.** `local` (the default; `src/storage/local.ts`): files under `STORAGE_DIR`
  (`.data/storage`, relative to the working directory; the Docker image sets `/data/storage`), the
  content type from the key's validated extension, no sidecar; a key that would resolve outside the
  root throws. With `NODE_ENV=production` the api warns at startup — fine on one node with a volume,
  wrong for several. `s3` (`src/storage/s3.ts`): Bun's built-in `S3Client`, no SDK; `S3_BUCKET`,
  `S3_REGION`, `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY` are required (the api exits at startup
  naming the missing ones), `S3_ENDPOINT` optional (R2, MinIO, SeaweedFS, any S3-compatible
  endpoint). `get` is one request (`client.file(key).bytes()`, no existence check first): a
  `NoSuchKey` error returns null, matching `local`; a 403 (`AccessDenied` — a bucket without
  `s3:ListBucket` answers this instead of 404 for a missing key, and wrong credentials answer it
  for every key) also returns null, since both read as "not found" to the image route, but is
  reported every time through `onForbidden` (wired to `recordFailure("storage read forbidden",
  …)` in `src/index.ts` / `src/worker.ts`, since a 403 on every object is a configuration problem,
  not a missing file). The content type comes from the key's own extension (`contentTypeForKey`),
  not the bucket's stored header. `delete` swallows a `NoSuchKey` from endpoints that answer 404 rather than S3's 204.
- **Migration `0014_files`.** `users.avatar_key` and `workspaces.logo_key`, nullable `TEXT`, each
  indexed (`files.get` looks one up on every image request). No `files` table: one image per owner
  needs none; a future attachments feature brings its own.
- **Keys.** `avatars/<userId>/<random>.<ext>` and `logos/<workspaceId>/<random>.<ext>`
  (`newFileKey` in `src/uploads.ts`): `<random>` is 16 random bytes base64url, `<ext>` `png`, `jpg`
  or `webp`; `FILE_KEY_PATTERN` / `FileKeySchema` in `@repo/api-contract` describe them. A key is
  never reused.
- **Replace.** `replaceImage` (`src/uploads.ts`) checks the size first (an oversized file is never
  read into memory), validates and strips the image, writes it under a fresh key, commits the key to
  the row, then enqueues a `storage.delete` job for the previous object (`enqueueStorageDelete`,
  deduped on `storage.delete:<key>`; see [Jobs](#jobs)); if the commit throws, the object just
  written is queued for deletion instead, so storage never outlives the row that would point at it.
  A failed enqueue is logged (`storage.delete enqueue failed`) and recorded as a telemetry `server`
  row for app `api`, never shown to the user — the nightly `storage.sweep` deletes the orphan
  anyway. `remove` clears the column and queues the delete the same way; `workspaces.delete`
  enqueues the logo's delete in the same transaction as the row delete.
- **Validation and stripping** (`src/storage/image.ts`, `processImage`, pure, never throws; no
  image library). The type by magic bytes only — PNG, JPEG or WebP; the declared type and file name
  are ignored, SVG (it can carry script) and GIF refused. At most 2 MB (`MAX_IMAGE_BYTES`); the
  dimensions read from the header, each side 1–4096 (`MAX_IMAGE_DIMENSION`), so a decompression bomb
  is refused; a malformed or truncated file is refused. Every refusal is `400` `IMAGE_UPLOAD_MESSAGE`
  "Upload a PNG, JPEG or WebP image up to 2 MB." Metadata is removed from the stored bytes: every
  format is allowlisted, not denylisted. PNG keeps only `IHDR` (required as the first chunk, and —
  since `i === 8 && type !== "IHDR"` refuses the file, while a later `IHDR` fails the same "must be
  at offset 8" check — exactly once), `PLTE`, `tRNS`, `IDAT`, `IEND`, `gAMA`, `cHRM`, `sRGB`, `iCCP`,
  `sBIT`, `bKGD`, `pHYs`, `acTL`, `fcTL` and `fdAT` (so APNG frames survive), and the PNG 3rd
  edition's `cICP`, `mDCv` and `cLLi` (colour space and HDR levels); every other chunk — text
  (`tEXt` / `iTXt` / `zTXt`), `eXIf`, `tIME`, C2PA (`caBX`), vendor/private — is dropped. WebP
  keeps `VP8 `, `VP8L`, `VP8X`, `ALPH`, `ANIM`, `ANMF` and `ICCP`; `VP8X`'s own EXIF and XMP flag
  bits are cleared (its ICC, alpha and animation flags stay set, since those chunks are kept) since
  the `EXIF`/`XMP ` chunks they describe are dropped. JPEG by allowlist too — SOS and the
  structural segments (SOFn, DHT, DAC, DQT, DNL, DRI, DHP, EXP) always kept, of the APPn markers
  only APP0 JFIF, APP2 ICC_PROFILE and APP14 Adobe, each matched by its payload's own signature; the
  JFIF header is cut to its 16-byte core (thumbnail size 0 × 0), so an embedded RGB thumbnail does
  not survive. Every other APPn (EXIF/GPS, XMP, MPF, Photoshop/IPTC, APP0 JFXX — a thumbnail
  extension — vendor data) and COM dropped. The entropy-coded data is scanned, so a marker between progressive
  scans is filtered the same way, the file ends at the first real EOI (an appended trailer or a
  second image is dropped), and a length-less or reserved marker where a segment should start
  refuses the file. No resizing: the UI sizes with CSS.
- **Limiter.** `upload:<userId>`, 20 upload attempts per hour, in memory, shared by
  `account.avatar.set` and `workspaces.logo.set` (`createServer`'s `uploadLimiter` option); `429`
  "Too many uploads, try again later" (`UPLOAD_RATE_MESSAGE`). Checked before the image is
  processed — the multipart body has already been parsed by then, and a refused file counts.
- **Impersonation.** Allowed, and audited only then (`auditWhileImpersonating`): `user.avatar_set`,
  `user.avatar_removed`, `workspace.logo_set`, `workspace.logo_removed`. A `remove` with no image
  writes no row.
- **URLs.** `User.avatarUrl`, `WorkspaceSummary.logoUrl`, `AdminUser.avatarUrl` and
  `AdminWorkspace.logoUrl` (`string | null`) are `/files/<key>` — relative, so each Next app serves
  it on its own origin through `createFileRoute` (`@repo/session/files`) — or
  `${STORAGE_PUBLIC_URL}/<key>` when that is set (trailing slashes stripped).
- **Serving.** `files.get` (service token only) answers only for a key a row currently holds, so a
  replaced or removed image stops being served at once; a CDN in front of `STORAGE_PUBLIC_URL`
  keeps its copy until it expires. The key is the capability: unguessable, low-sensitivity,
  cacheable; there is no per-request access check.
- **Body size.** `createServer` sets `maxRequestBodySize` to
  `max(API_MAX_BODY_BYTES, UPLOAD_MAX_BODY_BYTES, CV_MAX_BODY_BYTES)` (6 MB) and refuses, with
  `413`, a `content-length` over `API_MAX_BODY_BYTES` on everything except a `POST` to
  `/rpc/account/avatar/set`, `/rpc/workspaces/logo/set` or their `/openapi` paths (which get
  `UPLOAD_MAX_BODY_BYTES`, 3 MB; the `DELETE`s on the same REST paths keep the small cap) and a
  `POST` to `jobs.apply` (which gets `CV_MAX_BODY_BYTES`, 6 MB; see Hiring above). A chunked
  body with no `content-length` on any path is bounded only by the 6 MB server cap.
- **Tests.** `src/storage/storage.test.ts` runs one contract suite against `local` (a temporary
  directory) and `s3` through a small fake S3 endpoint; set `S3_TEST_ENDPOINT` (plus optional
  `S3_TEST_BUCKET`, `S3_TEST_REGION`, `S3_TEST_ACCESS_KEY_ID`, `S3_TEST_SECRET_ACCESS_KEY`, the Compose SeaweedFS's
  defaults otherwise) to run it against a real bucket too — not in CI. `image.test.ts` covers the
  parsers with fixtures (`src/storage/fixtures.ts`); `src/files.test.ts` (uploads, serving,
  limiter, audit) runs on both engines.
- **Env.** `STORAGE_PROVIDER` (`local` default, or `s3`), `STORAGE_DIR`, `STORAGE_PUBLIC_URL`,
  `S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`.
  `.env.example` and `apps/api/.env.example` list them; `docker-compose.yml` points the api at its
  SeaweedFS service.

## Email

Thirteen emails, all from `src/router.ts`: the verify link (sign-up, resend), the reset link, the magic
link (`auth.magicLink.request`), the password-changed notice (after `auth.resetPassword`,
`account.changePassword` and `account.setPassword`), the account-reset notice (after the
pre-account-hijack purge), the waitlist welcome (a new `waitlist.join` only), the invitation
(`workspaces.invitations.create`), the three two-factor notices (`twoFactorEnabled`,
`twoFactorDisabled`, `twoFactorReset`; see **Two-factor** above) and the three Data & privacy
notices (`dataExportReady`, `accountDeletionScheduled`, `accountDeleted`; see
[Privacy](#privacy)). Templates are in
`@repo/email` (`packages/email`), which returns `{ subject, html, text }`; this app only sends.
Each render's locale (the recipient's saved preference; for a mail the user asked for, the
request's own locale when none was saved; for an invitation, the invitee's chosen locale or else
the inviter's; for the waitlist welcome, the caller's) is decided here, in `src/router.ts` — see
[Locale](#locale) above.

- **The seam.** `src/mail/mailer.ts` defines `Message` (`{ to, subject, html, text,
  idempotencyKey?, headers? }`; `headers` is Phase 13 B's addition, used only by the three
  optional notification templates to carry their RFC 8058 pair — see
  [Notification preferences](#notification-preferences) below) and `Mailer` (`{ kind,
  send(message) }`). `createMailer(env)` in
  `src/mail/create-mailer.ts` picks the adapter at boot from `MAIL_PROVIDER`:

  | `MAIL_PROVIDER` | Adapter | Needs |
  |---|---|---|
  | `log` (default) | `src/mail/log.ts` — one `mail` log line per message: masked `to`, `subject` and the whole text body as `text` | nothing |
  | `smtp` | `src/mail/smtp.ts` — Nodemailer, any SMTP server (Mailpit in Compose) | `SMTP_URL` |
  | `resend` | `src/mail/resend.ts` — one `fetch` to Resend's API, sends the idempotency key | `RESEND_API_KEY` |
  | `file` | `src/mail/file.ts` — `fileMailer(dir)` writes each message as `<dir>/<Date.now()>-<random 6 hex>.json` (`{ to, subject, text, html, sentAt }`), `.tmp` then renamed into place so a reader polling the directory never sees a partial write | `MAIL_DIR` |

  A missing key exits at startup at any `NODE_ENV`. **`log` and `file` both expose the links, tokens
  included** — that is how dev works without a provider, and how `apps/e2e` reads one-time links
  from the mailbox directory (`fixtures/mail.ts`) instead of a real inbox; production warns at
  startup when either is still selected. To add a provider, implement `Mailer` in `src/mail/` and add
  a case to `createMailer`.
- **Queued sends.** Every send is a `mail.send` job (`src/jobs/builtin/mail.ts`; see
  [Jobs](#jobs)): `enqueueMail(context.enqueue, template, to, props, { tx?, idempotencyKey? })`
  checks `props` against the template's own type, and the job renders and sends. Invitations and
  the unverified-account purge enqueue in their transaction, so the job commits with the write. Sign-up
  and resend verify, password-changed, the two-factor notices and the waitlist welcome are enqueued
  (awaited) right after the write — a failed enqueue answers `500` though the write committed:
  durability over a silent lost mail. The two
  silent anonymous requests, `auth.requestPasswordReset` and `auth.magicLink.request`, are the
  exception: they enqueue through `detach()` (`src/mail/mailer.ts`, a macrotask that starts after
  the response is written), so a known and an unknown email keep equal timing. A slow, failing or
  down provider never changes a response, its status or its timing: the job retries with backoff (5
  attempts) and, dead, shows on `/admin`. Success logs `mail sent <template key> to
  a***@example.com` (`mail sent verifyEmail to …`), the address masked. `idempotencyKey` (e.g.
  `verify:<userId>:<hash prefix>`), passed only by the one-time-link mails (verify, reset, magic
  link), reaches the mailer — Resend drops a retried duplicate — and doubles as the job's dedupe
  key; the other mails carry none. A dead job keeps its payload, one-time link included, for
  **Retry** until `jobs.prune` deletes it after 30 days; the token expires sooner.
- **Env.** `MAIL_PROVIDER` (`log` | `smtp` | `resend` | `file`), `MAIL_FROM` (default
  `Boilerplate <no-reply@brand.localhost>`; required in production with `smtp` or `resend`, which
  refuse the placeholder domain), `SMTP_URL` (iff `smtp`, e.g. `smtp://localhost:1025` for a local
  Mailpit), `RESEND_API_KEY` (iff `resend`), `MAIL_DIR` (iff `file`, at any `NODE_ENV` — the
  directory each message is written to; `apps/e2e` points it at `apps/e2e/.tmp/mail`), `ACCOUNT_URL`,
  `APP_URL`, `SUPPORT_EMAIL` (optional; where `support.create` mails a request, else `MAIL_FROM`'s
  address, warned at startup in production). `.env.example` lists them all. A blank `MAIL_PROVIDER=` counts as unset (`log`), like
  every other var.
- **SMTP.** The transport gives up after 10 s connecting, 10 s waiting for the greeting and 30 s on
  an idle socket (Nodemailer's defaults are minutes), matching the Resend adapter's 10 s bound.
  Nodemailer reads query flags off the URL, so `SMTP_URL=smtp://user:pass@host:587?requireTLS=true`
  refuses to send if the server does not offer STARTTLS — set it on a credentialed 587 connection in
  production so an active attacker cannot strip TLS. `smtps://` on 465 is TLS from the first byte.
- **Local inbox.** `docker compose up -d --build api mailpit` sends to Mailpit; read the mail at
  `http://localhost:8025`. Outside Docker, run Mailpit yourself and start the api with
  `MAIL_PROVIDER=smtp SMTP_URL=smtp://localhost:1025`.
- **Tests.** `captureMailer()` from `src/test-server.ts` records what was sent; mail is queued, so
  `mailsTo(app, to, subject)` drains the queue (`app.drain()`) before it looks. `src/mail/mail.test.ts`
  covers the adapters without a network, `src/jobs/builtin/mail.test.ts` the job.

## Admin

`SUPERADMIN_EMAILS` (optional, comma-separated, normalised with `normalizeEmail`) names the
platform admins. **Superadmin is configuration, not data**: `isSuperadmin(user, emails)` in
`src/admin.ts` is `emails.has(normalizeEmail(user.email)) && user.email_verified_at !== null` —
computed on every request from the env and the row, never stored, never seeded; dropping an address
revokes it at the next request. `UserSchema.superadmin` and `auth.me`'s `Me.impersonation` surface
it to the apps; the admin UI itself is `apps/auth`'s `/admin` (see `apps/auth/README.md`).

- **Migration `0011_admin`.** `sessions` gains `impersonated_by INTEGER NULL REFERENCES users(id) ON
  DELETE CASCADE` and `reason TEXT NULL` (indexed on `impersonated_by`); `issueSession` takes an
  optional `{ impersonatedBy, reason, ttlMs }` and an impersonation session (`IMPERSONATION_TTL_MS`
  = 60 minutes) is never touched or extended like an ordinary one. `audit_log` is append-only — no
  query ever updates or deletes a row: `id`, `at` (ISO), `actor_user_id` (`ON DELETE SET NULL` —
  `AuditEntry.actor` is nullable once the actor's account is gone), `impersonated_user_id` (`ON
  DELETE SET NULL`), `action`, `target_type`, `target_id`, `reason`, `ip`, `user_agent`, `metadata`
  (JSON text), with indexes on `(at)`, `(actor_user_id, at)`, `(impersonated_user_id, at)` and
  `(target_type, target_id, at)`. Queries are `src/queries/audit.ts`.
- **Impersonation.** `admin.users.impersonate` (`{ id, reason: 3–200 chars, client }`) refuses the
  admin's own id (`SELF_TARGET_MESSAGE`), another superadmin (`SUPERADMIN_TARGET_MESSAGE`) and a
  suspended target (`SUSPENDED_TARGET_MESSAGE`, "A suspended account cannot be impersonated" — its
  session could never act anyway; see **Suspension**), is rate-limited `impersonate:<adminId>` 10/hour, ends the admin's own earlier impersonation first
  (audited `impersonation.replaced`), then issues the 60-minute session and audits
  `impersonation.started`. `requireSession` sets `context.impersonating = session.impersonated_by !==
  null` and loads `context.impersonator` (the admin's row) when it is; an impersonation session whose
  admin account is gone or no longer a superadmin answers `UNAUTHORIZED` at the next request.
  `admin.stopImpersonation` is called **with the impersonation token itself** (plain `authed`, not
  the `superadmin` middleware): no `impersonated_by` on the session is `NOT_FOUND`, otherwise it
  deletes the session and audits `impersonation.stopped`. Every impersonation end writes
  `impersonation.stopped` with `metadata.via` naming how it ended — `stop` (this procedure),
  `sign_out` (`auth.signOut` on the impersonation token), `sessions_revoked`
  (`admin.users.revokeSessions` on the impersonated user; `metadata.impersonatedBy` names the
  admin) or `admin_sessions_revoked` (`admin.users.revokeSessions` on the admin driving it) — and
  `impersonation.replaced` when a new impersonation by the same admin supersedes it.
- **Blocked while impersonating.** `refuseWhileImpersonating(context)` is the first line of eleven
  handlers (plus the four `account.twoFactor` writes, see **Two-factor**, and the four
  `account.passkeys` writes — `registerOptions`, `register`, `rename`, `delete`; `list` stays
  readable, see **Passkeys**) — `account.changePassword`, `account.setPassword`, `account.sessions.revoke`,
  `account.sessions.revokeOthers`, `account.identities.disconnect`, `account.resendVerification`,
  `billing.checkout`, `billing.portal`, `billing.mockChange`, `workspaces.delete`,
  `workspaces.transferOwnership` — throwing `FORBIDDEN` `IMPERSONATING_MESSAGE` ("Not available
  while impersonating"). `account.sessions.list` stays readable. `auth.oauth.callback` is refused the
  same way when a signed-in browser (one connecting a provider) is impersonating, via
  `optionalSessionUser`.
- **Audited only while impersonating.** `auditWhileImpersonating` wraps a plain mutation so it only
  writes a row, with no `workspace_id`, when the session is an impersonation: `notes.create`,
  `notes.delete`, `account.updateProfile`, `account.avatar.set` / `remove`. `admin.*` mutations
  always audit, impersonating or not: `impersonation.started`, `impersonation.replaced`,
  `impersonation.stopped`, `user.sessions_revoked`, `user.two_factor_reset`, `user.passkeys_removed`,
  `user.suspended`, `user.suspension_updated`, `user.unsuspended`,
  `job.retried`, `job.discarded`. The action names in use for this group:
  `impersonation.started`, `impersonation.replaced`, `impersonation.stopped`,
  `user.sessions_revoked`, `user.two_factor_reset`, `user.passkeys_removed`,
  `user.suspended`, `user.suspension_updated`, `user.unsuspended`,
  `job.retried`, `job.discarded`, `note.created`, `note.deleted`, `profile.updated`,
  `user.avatar_set`, `user.avatar_removed`. An audit row is written after the write it records
  succeeds and is not in the same transaction: a failed audit insert answers `500` while the write
  stands.
- **Always audited, with the workspace (Phase 12 A).** `auditWorkspace` (`src/admin.ts`) is the
  write path for every administrative action on a workspace — unlike `auditWhileImpersonating` it
  always writes, impersonating or not, inside the change's own transaction, and only on a real
  change: `workspaces.create`, `workspaces.update` (the name actually changed),
  `workspaces.logo.set` / `remove`, `workspaces.transferOwnership` (`workspace.ownership_transferred`,
  new), a billing mirror write that changes the effective plan or a live plan's interval
  (`workspace.plan_changed`, new), `invitations.accept` / `acceptById` (a real join only, target
  `user`), `workspaces.members.setRole` (the role actually changed, target `user`),
  `workspaces.members.remove` (target `user`), `workspaces.leave` (`workspace.left`, target
  `user`), `workspaces.invitations.create` / `revoke` (the invitee's address masked), the API keys
  and webhooks management procedures (see their own sections above), and the delivery job's own
  endpoint auto-disable. Each row carries `workspace_id`, and most target the member, key or
  endpoint changed (`target_type: "user"` / `"invitation"` / `"api_key"` / `"webhook"`) rather
  than the workspace itself — see CLAUDE.md's **Activity log.** paragraph and **Activity log**
  below for how a workspace's own admins read these back.
- **Procedures** (`admin.*`, every one `authed.use(superadmin)` except `stopImpersonation`; REST
  under `/admin/...`):

  | Procedure | Behaviour |
  |---|---|
  | `admin.metrics` | the counts in `AdminMetricsSchema` (plan counts and past-due count from the billing mirror) |
  | `admin.users.list` | keyset by id desc; `q` matches an email prefix or a name substring; `limit ≤ 100` |
  | `admin.users.get` | the user (with `twoFactorEnabled`) plus memberships, session counts, impersonation count and the last 20 audit rows where they are the actor, the impersonated user, or the target (`targetType: "user"`: an impersonation start or stop, a session revocation, a 2FA reset) |
  | `admin.users.revokeSessions` | ends every impersonation acting as the user or driven by them (each audited `impersonation.stopped`), then `sessions.deleteForUser(id)` and kills their open two-factor challenges; audits `user.sessions_revoked` |
  | `admin.users.impersonate` | see above |
  | `admin.users.resetTwoFactor` | `{ userId, reason: 3–200 chars }`: lost-phone recovery. Turns the user's 2FA off, ends their sessions and open challenges, audits `user.two_factor_reset`, mails `twoFactorReset`; refuses the admin's own id and another superadmin (`SUPERADMIN_RESET_MESSAGE`, "A superadmin's two-step verification cannot be reset"), `409` when 2FA is off, limited `reset2fa:<adminId>` 10/hour |
  | `admin.users.removePasskeys` | `{ userId, reason: 3–200 chars }`: lost-device recovery for passkeys (see **Passkeys**). Deletes every passkey, voids any outstanding register challenge, ends their sessions, audits `user.passkeys_removed`, mails `passkeysRemoved`; refuses the admin's own id and another superadmin (`SELF_REMOVE_PASSKEYS_MESSAGE`, `SUPERADMIN_REMOVE_PASSKEYS_MESSAGE`); no `409` for zero passkeys — a no-op success, unlike `resetTwoFactor`; limited `removepasskeys:<adminId>` 10/hour |
  | `admin.users.suspend` | `{ userId, reason: 3–200 chars, until? }`: blocks sign-in without deleting anything (see **Suspension**). Ends their sessions and stamps `sessions_revoked_at`, audits `user.suspended` (no suspension in force) or `user.suspension_updated` (re-suspending one still in force), mails `accountSuspended` (saved locale, never the reason); refuses the admin's own id and another superadmin (`SELF_SUSPEND_MESSAGE`, `SUPERADMIN_SUSPEND_MESSAGE`), `until` not strictly future or over 365 days ahead (`400` `SUSPEND_UNTIL_INVALID_MESSAGE`); shares `suspend:<adminId>` 20/hour with `unsuspend` |
  | `admin.users.unsuspend` | `{ userId, reason: 3–200 chars }`: lifts a suspension, expired-but-uncleared ones included. No-op success (no audit, no mail) only when `suspended_at` is already null; otherwise clears the record, audits `user.unsuspended`, mails `accountUnsuspended`; same self/superadmin refusals and shared limiter as `suspend` |
  | `admin.stopImpersonation` | see above |
  | `admin.workspaces.list` | keyset; `q` on name/slug; plan/status from the live billing mirror row |
  | `admin.workspaces.get` | the workspace plus members, the mirrored subscription and the last 20 audit rows for it |
  | `admin.audit.list` | newest first; filters `actorId?`, `targetType?`, `targetId?`; `limit ≤ 100`; `retention: { piiDays, rowDays }` (see **Audit retention and export**) |
  | `admin.audit.export` | `{ from, to, format, actorId?, targetType?, targetId? }` → a `File`; see **Audit retention and export** |
  | `admin.telemetry.errors` | the last 24 h: distinct fingerprint count, total event count, top 5 by count (see **Telemetry**) |
  | `admin.telemetry.vitals` | the last 7 d: p75 LCP/INP/CLS per app (see **Telemetry**) |
  | `admin.jobs.list` | `GET /admin/jobs`: `queued` / `running` / `dead` counts and the 20 most recently dead jobs (id, name, attempts, max attempts, last error, run at, finished at) — never a payload (see [Jobs](#jobs)) |
  | `admin.jobs.retry` | `POST /admin/jobs/{id}/retry`: a dead job back to `queued`, `attempts` 0, `run_at` now; `NOT_FOUND` unless it is dead, `CONFLICT` `JOB_RETRY_CONFLICT_MESSAGE` ("A newer copy of this job is already queued") when a newer live job holds its dedupe key; audits `job.retried` |
  | `admin.jobs.discard` | `DELETE /admin/jobs/{id}`: deletes a dead job; `NOT_FOUND` unless it is dead; audits `job.discarded` |
  | `admin.support.list` | `GET /admin/support`: help-center contact requests, newest first, keyset by id desc, 50 per page; `status?` `"open"` (default) / `"resolved"` / `"all"` |
  | `admin.support.resolve` | `POST /admin/support/{id}/resolve`: stamps `resolved_at` / `resolved_by` with the calling admin and erases the request's IP hash; `NOT_FOUND` for an unknown id; idempotent — on an already-resolved request it is a no-op (no re-stamp, no audit row); audits `support.resolved` on the transition |
  | `admin.support.reopen` | `POST /admin/support/{id}/reopen`: clears `resolved_at` / `resolved_by` (the IP hash stays erased); `NOT_FOUND` for an unknown id; idempotent — on an already-open request it is a no-op (no audit row); audits `support.reopened` on the transition |
  | `admin.applications.list` | `GET /admin/applications`: job applications, newest first, keyset by id desc, 50 per page; `status?` one of `APPLICATION_STATUSES` or `"all"` (default) and `job?` (a posting slug) |
  | `admin.applications.setStatus` | `POST /admin/applications/{id}/status`: `{ status }`; `NOT_FOUND` for an unknown id; a no-op with no re-stamp and no audit row when `status` is already the row's (the same guard `admin.support.resolve` uses); audits `application.status_changed` on a real change |
  | `admin.applications.delete` | `DELETE /admin/applications/{id}`: deletes the row and queues its CV for `storage.delete` in the same transaction; `NOT_FOUND` for an unknown id; audits `application.deleted` |
  | `admin.applications.cv` | `GET /admin/applications/{id}/cv`: streams the CV as `<reference>-<name>.pdf`; `NOT_FOUND` for an unknown id or a missing object — the only way a CV is ever served |

  Every procedure in the namespace — and every `/admin` page — answers `NOT_FOUND` (`ADMIN_ERRORS`)
  to a non-superadmin and to an impersonation session alike: no existence oracle, the same posture as
  workspaces. `/openapi` documents the `/admin/*` routes like every other route; the spec is public,
  but every call from a non-superadmin answers `NOT_FOUND`.
- **Env.** `SUPERADMIN_EMAILS` — optional, comma-separated, case/whitespace-normalised; empty means
  nobody can open `/admin`. `.env.example` lists it.
- **Out of scope.** Banning or deleting users (suspending is built — see **Suspension**); editing
  user data; plan overrides; admin-defined roles; a separate admin app; requiring two-step
  verification for superadmins; tamper evidence for the audit log (a hash chain or WORM storage —
  see **Audit retention and export**); archiving a row before deletion. A workspace's own admins
  now have their own activity log — see **Activity log** below.

## Audit retention and export

`audit_log` is append-only in every writer, but not forever: `audit.prune` (cron `45 3 * * *`, see
**Jobs**) strips, then deletes, on two env-driven clocks — `AUDIT_PII_RETENTION_DAYS` (default 90,
integer ≥ 1, strictly less than `AUDIT_RETENTION_DAYS`) and `AUDIT_RETENTION_DAYS` (default 365,
bounded 180–1095, or up to 3650 with `AUDIT_RETENTION_JUSTIFIED=true`, which logs one startup
warning) — validated in `src/env.ts` at boot; an invalid combination (the PII window not strictly
below the row window, or the row window out of bounds) exits naming the problem.

- **The job.** `pruneAudit(ctx, { batchSize?, budgetMs?, clock? })` (`src/jobs/builtin/audit.ts`;
  `auditPruneJob` is `createAuditPruneJob()` with the defaults) runs the **delete** stage first,
  then the **strip** stage, each in batches of `AUDIT_PRUNE_BATCH` (1000) by id —
  `queries/audit.ts`'s `deleteBefore(cutoff, afterId, limit)` deletes rows older than `now() −
  AUDIT_RETENTION_DAYS`, then `stripNetworkBetween(from, to, afterId, limit)` sets `ip = NULL,
  user_agent = NULL` on rows with `at` from that row cutoff up to `now() − AUDIT_PII_RETENTION_DAYS`
  that still hold either, so a row about to be deleted is never stripped first. Both are `WHERE id
  IN (SELECT id … WHERE id > $afterId … ORDER BY id LIMIT $limit)` and return the batch's count and
  highest id, which the loop passes back as the next `afterId` — a keyset over the primary key, so a
  run is linear in the table rather than rescanning rows earlier batches finished. Strict `<` at the
  upper cutoff, so a row exactly at a cutoff survives one more night; no wrapping transaction; no
  migration (the `at` filter is applied along the primary-key walk). The job keeps the default
  `timeoutMs` (`DEFAULT_TIMEOUT_MS`, 60 s), so the worker's shared batch lock — and every crashed
  job's reclaim — is unchanged, and its own time budget, `AUDIT_PRUNE_BUDGET_MS`, is 80 % of that
  (48 s): before every batch it checks the budget and `ctx.signal`, and once the budget has passed
  it stops, logs `audit pruned (partial: time budget reached, the next run continues): N stripped,
  M deleted` and returns normally — a success to the worker, no retry, no dead job — so a large backlog (the first nights
  after an upgrade) drains over several nights. A complete run logs `audit pruned: N stripped, M
  deleted`. Only a single batch hanging past the 60 s timeout makes an attempt fail (retried
  with backoff like any job). Idempotent (a stage with nothing left to touch returns 0). Apart from
  the privacy purge nulling user ids (`users.purge`), this job is the **only** code that updates or
  deletes an `audit_log` row — the `0011_admin` migration's comment still says append-only, and
  every writer is.
- **The limits, surfaced.** `admin.audit.list`'s response gained `retention: { piiDays, rowDays }`
  (`AuditRetentionSchema` in `@repo/api-contract`), read from the same `JobContext`-style fields
  (`auditPiiRetentionDays`/`auditRetentionDays`) threaded through `router.ts`'s `Context`,
  `server.ts`'s `ServerOptions` and `worker.ts` — the same wiring `analyticsRetentionDays`/
  `backupRetentionDays` already use. `/admin/audit` reads it straight off the page's existing data
  fetch.
- **Export.** `admin.audit.export({ from, to, format, actorId?, targetType?, targetId? })` —
  superadmin only, `NOT_FOUND` to anyone else including impersonation, like every `admin.*` call;
  limited `audit-export:<adminId>` 10/hour, checked before any query runs. `from`/`to` are
  `YYYY-MM-DD`, validated by `AuditExportSchema`'s own `superRefine` (a real calendar date, `from`
  ≤ `to`, at most 366 days apart) before the handler runs at all; `auditExportRange` turns them
  into inclusive whole UTC days (`from`'s own midnight through the midnight *after* `to`'s, so a
  row written later today is still included when `to` is today). One clock-dependent rule the
  schema cannot enforce — `to` no later than tomorrow's UTC date (`isToWithinBounds`, run with
  `context.now()` before the rate limiter, the same ordering `admin.users.suspend`'s own `until`
  check uses) — throws `BAD_REQUEST` `AUDIT_EXPORT_DATE_MESSAGE`. Rows come back oldest first
  (`ORDER BY at, id`) from one `listForExport` call at `limit: cap + 1` (`AUDIT_EXPORT_MAX_ROWS`,
  100 000 by default, overridable via `ServerOptions.auditExportMaxRows`): more than `cap` rows
  throws `CONFLICT` `auditExportCapMessage(cap)` rather than a separate count-then-select that
  could race a concurrent write and silently truncate. Columns, in order: `id, at, actor_id,
  actor_email, impersonated_id, impersonated_email, action, target_type, target_id, reason, ip,
  user_agent, metadata` — emails as of the export, `null` for a purged actor; `metadata` the raw
  stored JSON text. `toCsv` (`src/audit-export.ts`) writes RFC 4180 — every field quoted, `"`
  doubled, CRLF line ends, a UTF-8 BOM, a header row — and runs every cell (the header included)
  through `guardCell`: OWASP's CSV-injection guard, a leading `'` on any cell whose first character
  is `=`, `+`, `-`, `@`, a tab or a CR. `toJsonl` writes one object per line with the same columns,
  real `null`s, and `metadata` parsed back to an object when it is valid JSON, else kept as the raw
  string. Both append line by line rather than building an array and joining it, so the array and
  the final string are never both alive at once (measured at the cap: ~100k rows build a ~30 MB CSV
  in ~110 ms, ~210 MB peak RSS across `toCsv` and the `new File` it is wrapped in). The result is a
  `File` named `` `audit-${from}-${to}.${format}` `` (`text/csv; charset=utf-8` /
  `application/x-ndjson`); `file.type` does not survive the api client's `Response.formData()`
  decode reliably, so a caller must set `Content-Type` from its own request `format`, never from
  the returned `File`'s `.type`. After the file is built — never before, and never inside the file
  it describes — the handler writes `audit.exported` (metadata `{ from, to, format, rows, actorId?,
  targetType?, targetId? }`, `rows` the actual fetched count); a refused export (bad range, over
  cap, rate-limited, or not a superadmin) writes nothing.
- **`apps/auth`.** `/admin/audit` gets an Export card (From/To date inputs defaulting to the last
  30 UTC days, a Format select, the page's current filters as hidden fields) posting to
  `POST /admin/audit/export`; see `apps/auth/README.md`.
- **Legal basis** (checked 2026-10-18 against CJEU, GDPR and CNIL sources — not legal advice, the
  operator remains the controller): an IP address a site stores is personal data where it has legal
  means to identify the person (CJEU C-582/14 *Breyer*, 19 Oct 2016, para. 49), subject to the
  balancing GDPR's legitimate-interest basis for security logging requires; GDPR Art. 5(1)(c)/(e)/
  (f), 5(2) and 32; CNIL Délibération n° 2021-122 (14 Oct 2021) recommends six months to a year
  generally, up to three years for documented internal control, longer only for a specific legal
  obligation or a documented DPIA.
- **Known gap.** Tamper evidence (a hash chain or WORM storage) is out of scope — see `docs/guides/operations.md`
  for the full discussion, the backup-overlap effect on effective retention, and what a restore
  brings back.

## Activity log

Phase 12 A: a workspace's own admins and owners can see who changed what in their workspace —
membership, roles, invitations, API keys, webhooks, settings, plan — without asking the
platform's support. See CLAUDE.md's **Activity log.** paragraph for the condensed version; this
section is the detail.

- **Migration `0029_audit_workspace`** adds a nullable `audit_log.workspace_id INTEGER` (no FK, so
  a row outlives its workspace, as one outlives a purged actor — `actor_user_id` does have one,
  `REFERENCES users(id) ON DELETE SET NULL` from `0011_admin`) and an index `audit_log_workspace (workspace_id, at)`. No backfill: before
  this column only impersonation-time rows named a workspace, so the log starts empty at deploy.
- **Writing.** `auditWorkspace(context, workspaceId, input, client?)` (`src/admin.ts`) always
  writes — unlike `auditWhileImpersonating` — and is the one path every action in
  `WORKSPACE_ACTIVITY_ACTIONS` (`@repo/api-contract`, 21 actions — the 20th,
  `workspace.two_factor_requirement_changed`, is Phase 12 B (see **Required two-step
  verification** below) and the 21st, `workspace.invite_domains_changed`, is Phase 12 C (see
  **Invitation domains** below)) uses; see **Admin**'s "Always
  audited, with the workspace" bullet above for every call site and the rule that a row is written
  only on a real change (a same-name rename, a same-role `setRole`, an accept by an existing
  member all write nothing). The actor is the session user, or the impersonator with the user
  recorded as `impersonated`, exactly as `audit()`; with no user and an API key the actor is null
  and `metadata.apiKeyId` / `apiKeyName` name the key (no `/v1` route writes one of these rows
  yet, but the path supports it); with neither, the actor is null — the system, for a billing
  provider's webhook or the delivery job's auto-disable. An impersonated row also carries
  `metadata.bySupport: true`, so a later purge of the member (which nulls `impersonated_user_id`
  but keeps the superadmin as `actor_user_id`) can never re-attribute the superadmin as the member
  who acted.
- **Reading.** `workspaces.activity.list({ workspaceId, cursor?, limit? (1–100, default 50),
  action? })` (⚑, `member("admin")`, every plan, readable while impersonating since it writes
  nothing). `src/workspace-activity.ts` resolves actors and targets; `queries/audit.ts`'s
  `listForWorkspace` reads with an explicit column list — never `ip`, `user_agent` or `reason` —
  scoped to `workspace_id = ?`, `action IN WORKSPACE_ACTIVITY_ACTIONS` and `at >=
  activitySince(now)` (`now − WORKSPACE_ACTIVITY_DAYS`, 90, from `Context.now()`), keyset-paged on
  `(at, id)` descending — toward older rows only, so the client's own "Newest" is just the first
  page again, not a reverse cursor — plus the optional `action` filter. `peopleIn` and
  `apiKeyNamesIn` batch the actor/target lookups, one query each per page.
  - **Actor kinds** (`WORKSPACE_ACTIVITY_ACTOR_KINDS`): `member` (name always; `email` only while
    that person is a *current* member of the workspace — `peopleIn` `LEFT JOIN`s `memberships` on
    this workspace and returns `email` as `NULL` for anyone else, so a former member keeps their
    current name but never their address — data minimisation, GDPR 5(1)(c)); `apiKey` (named by
    `metadata.apiKeyName`, else the live key's name, else `""` once both are gone); `system` (only
    for `workspace.plan_changed` and `workspace.webhook_disabled` — any other actor-less,
    key-less row belonged to an account since purged, and renders `deleted`); `deleted` (a purged
    account, or an impersonated row whose member was purged — `metadata.bySupport` with
    `impersonated_user_id` now null — never resolved to the superadmin who is still `actor_user_id`
    on that row).
  - **Targets.** A member's current name, a key's name (`metadata.name`, else the live key's
    name, else `null`) or an endpoint's host (`metadata.host`); `workspace` and `invitation`
    targets carry no label — an invitation's masked email lives in `details.email`.
  - **Details** are the action's own display allowlist only (`ACTIVITY_DETAILS` in
    `workspace-activity.ts`, per the design's §2 table) — a value of the wrong shape is dropped,
    not shown as-is.
- **Target filter widened.** Since activity rows now target the member, key or endpoint changed
  rather than the workspace, the superadmin's `targetType=workspace&targetId=N` filter
  (`admin.audit.list`, the workspace detail page, `admin.audit.export`) also matches
  `workspace_id = N` now — see **Audit retention and export** above.
- **The data export.** `EXPORTED_AUDIT_METADATA` (`jobs/builtin/privacy.ts`) carries the same
  display keys per action as `ACTIVITY_DETAILS`, so a member's own export sees the same metadata
  the workspace's admins see — plus the keys pre-0029 impersonation-only rows stored, so an older
  row keeps its context. `exportedAuditBy(row, userId)` replaces the old inline `"you"`/`"admin"`
  label with a third value, `"workspace"`: another member, one of the workspace's own API keys, or
  the system, acting on the exported user — never platform staff, who are always `"admin"`.
- **`apps/account`.** The Workspace page's **Activity** card (admin and up, every plan): a type
  filter and **Older** / **Newest** paging links, all plain GET forms and links — the whole card
  works without JavaScript. See `apps/account/README.md`'s **Activity** section.
- **Out of scope.** Exporting the workspace log itself (the superadmin export already covers it),
  alerts on activity, notes or other content in the log, sign-in history, tamper evidence (still
  the documented gap above).
- **Basis** (checked 2026-10-19): OWASP's Logging Cheat Sheet ("when, where, who and what", strip
  or mask what the purpose does not need, restrict and review who may read log data) and
  Garante/CNIL employee-monitoring decisions (transparency to the people monitored, proportionality
  of what is recorded) — hence admin-and-up only, every plan (a safety feature, not an upsell), 90
  days, no ip or user agent ever shown, and the `/privacy` template's own line about it.

## Required two-step verification

Phase 12 B: a workspace owner can require every member to have two-step verification (TOTP) or at
least one passkey — blocked, never removed, the Slack/Google-Workspace model. See CLAUDE.md's
**Required two-step.** paragraph for the condensed version; this section is the detail.

- **Migration `0030_workspace_require_two_factor`** adds
  `workspaces.require_two_factor INTEGER NOT NULL DEFAULT 0 CHECK (require_two_factor IN (0, 1))`,
  the repo's usual boolean pattern (`requiresTwoFactor` in `queries/workspaces.ts`, normalised the
  same way as `webhook_endpoints.enabled`).
- **Satisfying it.** `satisfiesTwoFactor(user, passkeyCount)` (`src/access.ts`) is the one rule —
  `two_factor_enabled_at` not null, or `passkeyCount > 0` — judged from the row and the passkey
  count this request just read, never from how the session signed in. `blockedByTwoFactor(db,
  workspace, user)` wraps it: reads the passkey count only when the workspace requires it and
  two-step is off, so a workspace that does not require it never pays for the extra query.
- **Enforcement.** `member(min, { twoFactorExempt? })` in `src/router.ts` applies the check after
  the membership and role checks (a viewer refused on an admin procedure still sees "Requires the
  admin role" first — the caller is a member either way, so nothing leaks), throwing `FORBIDDEN`
  with `data: { reason: "two_factor_required" }` and the message naming the workspace
  (`workspaceTwoFactorRequired`, en + sv, pinned to the `WORKSPACE_TWO_FACTOR_REQUIRED_MESSAGE` constant).
  Exempt, so a blocked member can always fix it or leave: `workspaces.list`, `workspaces.create`,
  `workspaces.leave` (`twoFactorExempt: true`; its last-owner rule is unchanged),
  `invitations.preview` / `accept` / `acceptById`, and every `account.*` / `auth.*` procedure —
  none of these run through `member`. Every other `member` procedure is blocked: notes, workspace
  get/update/delete/transferOwnership, members, invitations, logo, API keys, webhooks, activity,
  billing. An impersonation session follows the member it impersonates: blocked if the member is
  blocked, even when the impersonating admin's own account satisfies it — no support bypass.
  `/v1` (API keys) and outgoing webhooks are unaffected: both are machine credentials whose
  creation already needed an admin.
- **Realtime.** `GET /events/workspaces/:id`'s `authorize` (`src/realtime/stream.ts`) returns
  `403` with the plain-text body `two_factor_required` (`cache-control: no-store` — not the oRPC
  JSON shape, since `@repo/session`'s relay drops bodies anyway) under the same rule, checked on
  connect and on the existing 60 s recheck, so turning two-step off, removing the last passkey or
  the requirement turning on all close an open stream; a non-member still gets `404`. See
  **Realtime** above.
- **Turning it on and off.** `workspaces.security.get({ workspaceId })` (`member("admin")`, every
  plan) returns `{ requireTwoFactor, membersWithoutTwoFactor }` (a count from
  `memberships.listWithTwoFactor`, the SQL twin of `satisfiesTwoFactor`). `workspaces.security.set({
  workspaceId, requireTwoFactor })` (`member("owner")`, every plan, refused while impersonating)
  turns it on or off: turning it on while the owner does not satisfy it themselves is `FORBIDDEN`
  `data: { reason: "owner_two_factor" }` ("Turn on two-step verification for your own account
  first."); a no-op (already that value) writes nothing. A real change is one transaction: a
  conditional `UPDATE … WHERE require_two_factor <> v` (`setRequireTwoFactor`, so of concurrent
  identical changes only one writes), `auditWorkspace` as `workspace.two_factor_requirement_changed`
  (`metadata: { enabled }` — see **Activity log** above), then, only when turning on, a
  `workspaceTwoFactorRequired` mail (`@repo/email`, en + sv, the recipient's saved locale else
  English, naming only the workspace, link to `${ACCOUNT_URL}/security`) to every member who does
  not satisfy it, excluding the caller — all inside the same transaction, so a failed enqueue
  rolls the whole change back.
  - **Accepted race.** The owner's self-satisfaction check runs outside a lock, so a concurrent
    self-disable of the owner's own two-step can still let the requirement turn on; the owner is
    then blocked like anyone else and recovers through the exempt `account.*` procedures (turning
    two-step back on, or registering a passkey). Likewise `security.set` does not re-read the
    caller's role inside its transaction, so a concurrent `transferOwnership` can let the former
    owner (now an admin) flip the setting once; the change is audited like any other.
- **Members and invitations.** `members.list` gains `twoFactor: boolean | null` per member, `null`
  below `admin` (the same rule as email). `invitations.preview` gains `requireTwoFactor`, so the
  invitation landing page can say the workspace requires it before the invitee even signs in.
- **Chat.** `apps/app`'s `/api/chat` route's `chatEntitlementGate` checks
  `workspace.requireTwoFactor && user.twoFactorSatisfied !== true` before the plan check (fails
  closed on a caller that does not say), answering `403` "Turn on two-step verification to use
  chat in this workspace" — closing the gap the exempt `workspaces.list` would otherwise leave
  open to a direct `/api/chat` call. See **Billing** above.
- **UI.** `apps/account`'s Workspace page gets a **Security** card directly above API keys (owner:
  a checkbox and a two-click, no-JavaScript confirmation naming how many members would be blocked;
  admin: the state and count, read-only; below admin: the state only) and a "No two-step" badge on
  the members list for admin and up; the Security page warns before turning two-step off or
  removing the last passkey when that would leave the account unable to satisfy a workspace that
  requires it. `apps/app`'s `/notes` and `/chat`, and `apps/account`'s `/workspace` and
  `/payments`, show `@repo/ui/blocks/two-factor-required-notice`'s `TwoFactorRequiredNotice` in
  place of the page for a blocked member — a link to set up two-step, switch workspace or leave,
  and no redirect. See `apps/account/README.md`, `apps/app/README.md` and
  `packages/ui/src/blocks/README.md`.
- **Out of scope.** A grace period, requiring a *phishing-resistant* factor only, per-session
  step-up, enforcing on `/v1` keys, SSO.
- **Basis** (checked 2026-10-20): OWASP's Zero Trust Architecture and MFA Cheat Sheets ("MFA for
  everyone"; a lost-factor recovery that must exist without becoming a bypass); NIS2 (Directive
  (EU) 2022/2555) Art. 21(2)(j) (multi-factor authentication among the measures essential/important
  entities must take); the Dutch DPA's z2018-02009 (single-factor authentication to sensitive
  personal data insufficient under GDPR Art. 32) and Art. 5(1)(c) (the members-list status is
  yes/no only, never the factor, device or recovery state); research on mandatory vs. optional MFA
  uptake and risk communication (Kamar et al., *Crime & Delinquency* 2026; Das et al. 2021).

## Invitation domains

Phase 12 C: a workspace owner can limit invitations to addresses on the organisation's own email
domains — a restriction only, never a grant (no domain auto-join, so no DNS proof of ownership is
needed; existing members are never touched). See CLAUDE.md's **Invitation domains.** paragraph for
the condensed version; this section is the detail.

- **Migration `0031_workspace_invite_domains`** adds `workspaces.invite_domains TEXT NOT NULL
  DEFAULT '[]'`, a JSON array of A-label domains; `'[]'`, every existing workspace's value, means
  any address — today's behaviour.
- **The normaliser,** `@repo/api-contract/invite-domains` (Zod-free, so a browser bundle never
  pulls in zod or the oRPC contract — `apps/account` validates with the very same rule):
  - `normalizeInviteDomain(input): string | null` — trim, drop one leading `@`, refuse a line
    holding whitespace, a control character or `/ \ ? # @ : %` (the host parser would otherwise cut
    or rewrite the line — `acme.com/x` and `acme%2ecom` both parse to `acme.com`, `a@b.com` to
    `b.com`, and an inner tab or newline is silently dropped), convert with `toASCII` (`new
    URL("http://" + d).hostname`, the WHATWG URL host parser — `node:url`'s `domainToASCII` has no
    browser equivalent; Next's `url` shim lacks it, and a bare `node:url` import would also fail the
    client-imports guard), strip one trailing dot, then refuse empty, longer than 253, a single
    label (`localhost` included), an IPv4/IPv6 literal, or a label that is empty, longer than 63,
    starts/ends with `-`, holds anything but `[a-z0-9-]`, or whose last label is under 2 characters
    or all digits. Proven identical to `node:url`'s `domainToASCII` under Bun and in a real browser,
    across the spec's normalisation table.
  - `normalizeInviteDomains(lines)` — dedupes, keeps first-seen order, reports each invalid line's
    0-based index (blank lines skipped, never invalid) and whether more than `MAX_INVITE_DOMAINS`
    (20) remain.
  - `emailDomain(address)` and `inviteDomainAllowed(domains, address)` (empty list = any address,
    else exact match only: `acme.com` admits `a@acme.com`, never `a@eu.acme.com`). Invitee
    addresses already pass `EmailSchema` (ASCII-only, lower-case, no trailing dot), so an IDN entry
    (stored as its A-label) matches the A-label form of an address.
  - `queries/workspaces.ts`'s `inviteDomainsOf(row)` reads the stored JSON, returning `null` — never
    `[]` — for anything that is not an array of strings, so the column's gate **fails closed**:
    `inviteDomainAllowedUnder(domains, address)` (the enforcing wrapper every call site below uses)
    is false whenever `domains` is null, and the failure is recorded (`INVITE_DOMAINS_UNREADABLE`,
    the workspace id only, never an address) rather than read as the empty, allow-all list. Only
    `security.get`'s display shows `null` as `[]`.
- **Enforcement — create and re-invite.** `workspaces.invitations.create`'s domain check is the
  handler's first statement: it runs before the `invite:<workspaceId>` / `invite:user:<userId>`
  limiters record a hit, before the already-member check, before the seat check and before the
  delete-then-insert that replaces a pending row. An address outside a non-empty list throws
  `FORBIDDEN` `data.reason: "invite_domain"`, message `inviteDomainRestricted` ("Invitations to
  this workspace are limited to: {domains}.", en + sv), `{domains}` formatted with
  `new Intl.ListFormat(context.locale, { type: "conjunction" })` — the caller is an admin who can
  already read the list, so naming it leaks nothing. An unreadable stored list refuses every
  address with the same `FORBIDDEN` and `data.reason`, but message `inviteDomainNoLongerAllowed`
  (there is no list to name), and records the failure with the workspace id only.
- **Enforcement — accept and acceptById.** `acceptInvitation` (`src/workspaces.ts`) now locks the
  workspace row (`workspaces.lockForOwnership`) before reading the invitation, the same order every
  workspace writer takes (`deleteWorkspaceInTx`, below, included) — re-reads the list under that
  lock, so a concurrent `setInviteDomains` either commits first and is seen, or waits for the
  accept. The refusal order is fixed: not found/expired, then the address mismatch, then an
  unverified email, then the domain list, then — new member only — the seat limit; the domain check
  applies to a caller who is already a member too, so an invitation outside the list is never
  consumed. An address the current list no longer admits throws `FORBIDDEN`
  `data.reason: "invite_domain"`, message `inviteDomainNoLongerAllowed` ("This workspace no longer
  accepts invitations to this address.", en + sv), before the invitation is marked accepted, so it
  stays pending — revocable, or left to expire. Holding the workspace lock for the whole accept is
  deliberate: it serialises concurrent accepts into one workspace, which also makes the seat check
  race-free (two accepts at one seat left can no longer both pass it).
- **`deleteWorkspaceInTx`** (`src/workspaces.ts`, used by `workspaces.delete` and the privacy
  purge's sole-member delete) now calls `workspaces.lockForOwnership` before deleting the
  workspace's invitations. Fix round 1 found that without it, a delete (invitations, then the
  workspace row) and a concurrent accept (the workspace row, then the invitation) could lock in
  opposite orders and deadlock on Postgres; a Postgres-only test overlaps the two transactions and
  fails without the lock.
- **`invitations.preview`** gains `domainAllowed: boolean`, computed the same way.
- **Managing the list.** `workspaces.security.get({ workspaceId })` (`member("admin")`, every plan)
  gains `inviteDomains: string[]`. `workspaces.security.setInviteDomains({ workspaceId, domains })`
  (`member("owner")`, every plan, refused while impersonating): each line of the input (up to 100
  lines of up to 1000 characters — generous on purpose, so a list over 20 after dedupe is still
  refused by index rather than a bare Zod `400`) is normalised; an invalid one is `BAD_REQUEST`
  `data: { reason: "invite_domain_invalid", indexes }` (offending lines' indexes only, never their
  text), message `inviteDomainsInvalid` "Check the lines listed below."; more than 20 distinct
  domains remain is `BAD_REQUEST` `data.reason: "invite_domain_limit"`, message
  `inviteDomainsLimit` "You can list up to 20 domains." The identical **set** of domains (reordered
  or not) is a no-op — no lock, no write, no audit; an unreadable stored value is never treated as
  "the same", so saving any list, even an empty one, repairs it. A real change runs in one
  transaction (lock, re-read, re-compare — so concurrent identical saves still audit exactly once;
  a workspace deleted since the membership check finds no row to lock and answers `NOT_FOUND`
  "Workspace not found", writing no audit row), writes the column, then `auditWorkspace` as `workspace.invite_domains_changed`
  (`metadata: { added, removed }` — see **Activity log** above).
- **UI.** `apps/account`'s Workspace page gets an **Invitation domains** section in the Security
  card, below the two-step requirement; the invite form gets a hint when the list is non-empty; the
  pending invitations list gets an "Outside allowed domains" badge. `apps/app`'s
  `/invitations/[token]` hides **Accept** (and the signed-out sign-in/create-account links, which
  would lead nowhere) when `preview.domainAllowed` is false. See `apps/account/README.md` and
  `apps/app/README.md`.
- **Out of scope.** Domain auto-join and DNS verification, subdomain wildcards, flagging or
  removing existing members outside the list, a per-role allowlist.
- **Basis** (checked 2026-10-20): OWASP's Input Validation Cheat Sheet (validate an email's domain
  syntactically; prefer allowlist validation) and SSRF Prevention Cheat Sheet (domain-name
  validation must reject strings a naive validator accepts, e.g. `<script>…</script>.owasp.org`); no
  legal surface — a list of organisation domains is not personal data, and the feature only narrows
  who may be invited.

## Notifications

Phase 13 A: a per-user in-app inbox for the things that happened **to** the signed-in person —
never "someone joined" noise, that stays the activity log's job. Migration `0032_notifications`:
one table, `notifications` (`id`, `user_id` NOT NULL, `workspace_id` nullable, `type`, `data` JSON
text, `created_at`, `read_at` nullable) — neither column a foreign key, like every other
user-owned table here — indexed `(user_id, created_at)` (the list), `(user_id, read_at)` (the
unread count) and `created_at` alone (the nightly prune's range scan). `type` carries no `CHECK`:
a later type is a code change, not a table rebuild on SQLite, since `notifyUser`
(`src/notifications.ts`) validates every type and its `data` against the contract before it
writes. `NOTIFICATION_TYPES` (`@repo/api-contract`'s Zod-free `./notifications` subpath, so a
client bundle never pulls in zod or the contract for the type list alone) names the seven:
`invitation.received`, `member.role_changed`, `member.removed`,
`workspace.two_factor_required`, `export.ready`, `webhook.disabled`, `plan.changed`; each has its
own strict schema in `notifications-schema.ts`, and every one holds ids and display names only —
a workspace name, a role, a plan, an endpoint's host — **never an email address, a token or a
secret**.

- **Writing.** `notifyUser(ctx, userId, type, data, { tx?, workspaceId? })` parses `data` against
  the type's schema, inserts the row — on `tx` when given, so a rolled-back change creates nothing
  — and registers `db.afterCommit(() => publishAfterCommit(ctx, userChannel(userId), {
  type: "notification.created", id }))` (see `tx.afterCommit` under [Jobs](#jobs) and
  [Realtime](#realtime) below): the announcement only fires once the row is durable, and it is
  fire-and-forget like every other `publishAfterCommit` call — a failed publish never fails the
  change. `ctx` is whatever already carries `db`, a `broadcaster` and `recordFailure`: a request's
  `Context`, a `JobContext`, or the billing mirror's own deps. An after-commit callback that throws
  is caught, logged ("db: an after-commit callback threw") and does not stop the rest, or roll back
  a transaction that already committed. `isActor(context, userId)` — true for the session's own
  user or, on an impersonation session, the impersonating admin — is how every emitter below skips
  telling someone about their own action.
- **Emitters**, each inside the change's own transaction, one notification per recipient:
  `invitations.create` (and a re-invite) tells the account already holding the invited address
  `invitation.received` — **only once that account's email is verified**, the same rule
  `workspaces.list`'s pending invitations already use, so whoever pre-registered someone else's
  address unverified never learns what it is being invited to; an address with no account gets
  nothing. `members.setRole` tells the target `member.role_changed` (unless the target is the
  actor, or the change is a no-op); `workspaces.transferOwnership` tells the new owner the same
  way (`from` their old role, `to: "owner"`) — the former owner made the change, including their
  own demotion, so they get nothing. `members.remove` tells the removed member
  `member.removed`, never on a leave or a self-removal. `workspaces.security.set` turning the
  workspace's two-step requirement **on** tells `workspace.two_factor_required` to every member who
  does not yet satisfy it, alongside the existing `workspaceTwoFactorRequired` mail (see
  **Required two-step verification** above) — never the caller. The `privacy.export` job tells
  `export.ready` on success, inside the same transaction that marks the export `ready`. A webhook
  endpoint's auto-disable (`failures` or `gone`) tells every owner `webhook.disabled` with the
  host and the reason, alongside `webhookDisabled` mail. The billing mirror (mock and Stripe alike)
  tells every owner but the one who made the change `plan.changed` with the new plan; a provider
  webhook carries no actor, so it tells every owner — **a real Stripe checkout therefore produces a
  self-notification**, a known, accepted gap (the mock and the in-app change both skip the actor
  correctly); a cancellation right before the workspace is deleted (`actor === null`) tells nobody,
  like the activity log.
- **Reading and marking.** `notifications.list({ cursor?, limit? 1–50 default 20, unreadOnly? })`
  (⚑) returns the caller's own rows only, newest first, keyset on `(created_at, id)`; `workspaceId`
  comes back only while the caller is still a member of that workspace, else `null`, so a link
  never points back into a workspace the user has left. A stored row whose type or data no longer
  parses is skipped and recorded, never returned half-shaped. `notifications.unreadCount()` (⚑)
  counts through a capped subquery (`NOTIFICATION_UNREAD_CAP` + 1 = 100), so the UI can show `99+`
  without the api ever counting an unbounded backlog. `notifications.markRead({ ids: 1–100 } |
  { all: true })` (⚑) marks only the caller's own rows (another user's ids are silently ignored,
  never an oracle) and is refused while impersonating (`FORBIDDEN` "Not available while
  impersonating"), so support can never clear a user's badge; idempotent either way. Reads stay
  open while impersonating — the admin sees what the user would see — only marking is blocked.
- **Realtime.** `userChannel(id)` = `user:<id>` on the same `Broadcaster` every workspace channel
  uses. `GET /events/me` shares `createStreamHandler`'s `openStream` helper with
  `/events/workspaces/:id` (guard, limiter, session resolution, idle-timeout handling, the ping,
  the 60 s re-check, `resync` on connect) but **keeps its own per-session (5) and per-user (10)
  counters**, apart from the workspace stream's — counting the two kinds together would halve how
  many `/notes` tabs fit in one session, since each would then open two streams — while the
  process-wide `REALTIME_MAX_STREAMS` cap stays shared by both kinds. It sends no presence. An
  impersonation session hears the impersonated user's own channel, never the admin's, and counts
  against the admin's caps; stopping the impersonation ends the stream. See
  [Notifications](#notifications) under **Realtime** too, below.
- **Retention.** `notifications.prune` (`5 4 * * *`, see [Jobs](#jobs)) deletes every read
  notification older than `NOTIFICATION_READ_RETENTION_DAYS` (30) days and every notification,
  read or not, older than `NOTIFICATION_RETENTION_DAYS` (90) days, in one range over the
  `created_at` index.
- **Privacy.** The data export's `notifications` list (type, created, read, data) is read with
  the same explicit-column discipline as every other export section (see [Privacy](#privacy)
  below); `users.purge` deletes a user's rows outright.
- **Known limitations.** A dedicated worker (`src/worker.ts`) builds its own broadcaster: on
  SQLite (`memory`, in-process) a job's `export.ready` or `webhook.disabled` publish reaches no
  api process, so it shows on the signed-in person's next page load rather than live; on Postgres
  the `NOTIFY` reaches every replica, api and worker alike. A real Stripe checkout's `plan.changed`
  self-notification (above) is accepted, not fixed.
- **Basis** (checked 2026-10-21): Ohly et al., *J. Occup. Health* 2023 (notifications disrupt task
  focus; reducing them helps) and Iqbal & Horvitz 2010 (people value notifications for passive
  awareness, not as a trigger to switch tasks) — hence a badge and an inbox, never a toast or a
  sound; the W3C ARIA Authoring Practices (a polite live region announces a changed value without
  interrupting). See `apps/account/README.md`,
  `apps/app/README.md`, `packages/session/README.md`, `packages/ui/src/blocks/README.md` and
  `docs/guides/realtime.md`.

## Notification preferences

Phase 13 B: which of the seven notification types above also reach a person by email — the
in-app inbox always receives every type regardless. Migration `0033_notification_preferences`:
one table, `notification_preferences` (`user_id`, `type`, `email_enabled` INTEGER 0/1 CHECK,
`updated_at`), primary key `(user_id, type)`, no FK, no `CHECK` on `type`. **No row for a user and
type means that type's default.** `NOTIFICATION_EMAIL` (`@repo/api-contract`'s Zod-free
`./notifications` subpath) splits the seven into `locked` — `invitation.received`,
`workspace.two_factor_required`, `export.ready`, `webhook.disabled`; mailed exactly as they
always were, never opt-out-able — and `optional` — `member.role_changed`, `member.removed`,
`plan.changed`; `NOTIFICATION_EMAIL_DEFAULT` is `true` for all three.

- **Preferences.** `account.notificationPreferences.get()` (⚑) returns every type, optional ones
  first (the stored row else the default) then the locked ones (always `{ email: true, locked:
  true }`). `.set({ type, email })` (⚑, `type` typed to `z.enum(NOTIFICATION_EMAIL.optional)` so a
  locked type never parses) writes inside a transaction — an UPDATE only when the value differs,
  else an `INSERT … ON CONFLICT DO NOTHING` only for a non-default value — so a no-op write and a
  race between two identical concurrent sets each audit `user.notification_email_changed` `{ type,
  email, via: "settings" | "link" }` exactly once; refused while impersonating.
- **Sending.** `notifyUser` (see [Notifications](#notifications) above) gains one step for an
  optional type: inside the same transaction that inserts the in-app row,
  `enqueueNotificationEmail` (`src/notification-email.ts`) reads the recipient's preference
  (default on) and, **only when it is on and the recipient's own email is verified** — an address
  nobody has proven to own is never mailed anything it did not ask for — reads their name and
  saved locale (else English) and enqueues a `mail.send` job for one of three new `@repo/email`
  templates: `roleChanged` (`workspaceName`, `role`), `removedFromWorkspace` (`workspaceName`) or
  `planChanged` (`workspaceName`, `plan`). Each shares `NotificationFooter` (an inbox button, a
  visible unsubscribe link and "Turn off these emails") and carries no other member's address. A
  rolled-back change enqueues no mail, exactly like the in-app row.
- **Headers.** `Message` (`src/mail/mailer.ts`) gained `headers?: Record<string, string>`, passed
  through as-is by `smtp` (Nodemailer's own `headers`) and `resend` (its `headers` field, not an
  HTTP header) and recorded verbatim by `log` and `file`. Only an optional-type mail carries
  `List-Unsubscribe: <${AUTH_URL}/email/unsubscribe/one-click?token=…>` and
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` (RFC 8058) — every other template, locked
  ones included, carries neither.
- **The token.** `base64url(payload).base64url(mac)`, `payload` = `<userId>.<type>.1` (the
  trailing `1` a version), `mac` = HMAC-SHA256(payload) under a key derived from
  `TWO_FACTOR_ENCRYPTION_KEY` with `hkdfSync("sha256", key, <empty salt>,
  "notification-unsubscribe-v1", 32)` — HKDF under its own fixed `info` label, never the raw or a
  re-hashed key, so the TOTP-encryption key is reused for nothing else and no new env var is
  needed (RFC 5869 §3.1 allows the empty salt because the input key is already uniformly random).
  `verifyUnsubscribeToken` requires strict, canonical base64url (a re-padded or re-encoded twin of
  a real token fails), compares the mac with `timingSafeEqual` on equal-length buffers, and only
  then parses the payload. The token **never expires** (it works until the key rotates) and names
  exactly one user and one optional type; a correctly signed token for a locked type, another
  version or a malformed payload is invalid.
- **`peek` and `unsubscribe`.** `auth.notificationEmail.peek({ token })` (anonymous, read-only)
  answers `{ type } | null` — null for a bad token or one whose user was purged, the same shape
  either way. `auth.notificationEmail.unsubscribe({ token })` (anonymous) sets that type off in a
  transaction for a valid token and **always answers `{ ok: true }`**, for a bad token too, so the
  outcome is never an oracle. Both verify the token first (one HMAC, constant time): a forged
  token answers at once — `{ ok: true }` or `null`, exactly as a good one would — spends no budget
  and changes nothing. Only a token that verifies spends the two limits they share,
  `notification-email:<clientId>` (default 60/10 min) then api-wide `notification-email:global`
  (default 1000/10 min); either answers `TOO_MANY_REQUESTS`. So invented tokens can never exhaust
  the api-wide budget real links share. Telling a good token from a bad one already needs the key,
  so verifying first adds no oracle. `unsubscribe` locks the user row (`lockForSession`) before
  writing, so a racing purge either commits first (and the link changes nothing) or deletes the
  new row with the rest.
- **The auth app.** `apps/auth`'s `POST /email/unsubscribe/one-click?token=…` is the RFC 8058
  endpoint. It never reads the body (any body, or none, works), keys its client id on
  `unsubscribeTokenClientId(token)` (`unsub:` + the first 32 hex of `sha256(token)`) rather than
  the poster's ip — mail providers post one-clicks from shared egress addresses, where a per-ip
  bucket would refuse real unsubscribes at scale — and maps the api's answer to: a good token or a
  `BAD_REQUEST` (malformed/unknown) both to a blank `200`, `TOO_MANY_REQUESTS` to `429`, and an
  unreachable api or missing env to `503`; never a redirect. It sits deliberately outside
  `assertSameOrigin` (a mail provider posts cross-site, with no cookie and no Origin to check) —
  safe, because the only effect is turning one optional type off for the one user the signed token
  names, idempotent, never a sign-in and never a locked type. `GET` on the same path is a `303` to
  the confirm page, with no api call. The confirm page, `/email/unsubscribe?token=…`
  (`unsubscribeClientId(ip)`), calls `peek` on load and renders `valid` (the type, then **Turn off
  these emails**, a server action — the link alone never unsubscribes anyone), `invalid` (a
  neutral note) or a distinct `unavailable` state (rate-limited, down or misconfigured — never
  shown as a dead link, since the token itself never expires). See `apps/auth/README.md`.
- **The account app.** `apps/account`'s `/notifications` page gets an **Email** card: one
  checkbox per optional type, works with no JavaScript, **Save email settings**, and the four
  locked types listed read-only underneath; disabled while impersonating. See
  `apps/account/README.md`.
- **Privacy.** The export lists `notificationPreferences: [{ type, email, changedAt }]` for the
  optional types only (a locked type is always on, so it is left out); `users.purge` deletes the
  rows outright.
- **Known limitations.** An unverified address gets no optional email at all. `plan.changed` mail
  depends on the billing provider: the billing mirror never mails the actor, so with the mock
  provider an in-app plan change never mails anyone (a workspace's one `owner` is the only one who
  may change the plan, and is the actor); with `BILLING_PROVIDER=stripe` every change, an in-app
  checkout included, arrives through the provider's webhook, whose actor is `{}`, so every owner
  is mailed — the one who just paid included. Forged tokens cost one HMAC each and spend nothing;
  real tokens are bounded per link and api-wide, so a genuine burst past 1000 one-clicks in 10
  minutes answers `429` until the window passes.
- **Basis** (checked 2026-10-21): Context7 `/websites/resend` and `/websites/nodemailer` (RFC
  8058's header pair, honouring a one-click request within 48 hours, keeping a visible unsubscribe
  link in the body) and Directive 2002/58/EC (ePrivacy) Art. 13 (an opt-out on a service
  notification about the recipient's own account is a courtesy and a deliverability measure, not a
  consent requirement). See `apps/auth/README.md`, `apps/account/README.md`,
  `packages/email/README.md` and `docs/guides/notification-preferences.md`.

## Privacy

Migration `0019_privacy`: `users.deletion_scheduled_at` (nullable `TEXT`, indexed — null means no
deletion is scheduled) and `data_exports` (`user_id`, `status` `CHECK` in `pending` / `ready` /
`expired`, `storage_key`, `created_at`, `ready_at`, `expires_at`; indexed on `(user_id, id)`).
Constants live in `@repo/api-contract`'s `privacy.ts`: `EXPORT_TTL_MS` (7 days),
`EXPORT_REQUEST_INTERVAL_MS` (24 hours) and `DELETION_GRACE_MS` (7 days). Queries are
`src/queries/exports.ts` and the relevant methods on `src/queries/users.ts`; the jobs are
`src/jobs/builtin/privacy.ts`.

- **Exporting.** `account.export.request` (⚑) locks the user row, reads `exports.lastRequestedAt`
  and, inside `EXPORT_REQUEST_INTERVAL_MS` of it, answers `CONFLICT` naming when the next one is
  allowed (`data.retryAt`); otherwise it inserts a `pending` row and enqueues `privacy.export` in
  the same transaction. That job reads the account's data with `exports.dataFor` — explicit column
  lists throughout, so nothing secret ever reaches the file: never a password hash, TOTP secret,
  recovery code, session, token or invitation-token hash — and `buildExport` assembles it as one
  JSON document (`format: 1`): `profile` (id, email, name, locale, created-at, email-verified,
  two-factor-enabled, the scheduled deletion date), `avatarUrl` (absolute, so the file works outside
  the app), `signInMethods` (password yes/no, connected providers), `sessions` (dates, user agent,
  ip — impersonation sessions excluded, since that is the admin's device), `workspaces`,
  `invitationsSent`, `notes`, `auditLog` (every row naming the user as actor, as the impersonated
  user, or as the target — `target_type 'user'`, so an admin's impersonation, session revocation
  or 2FA reset is there with its reason; `by: "you" | "admin"`, and only a row the user's own
  session wrote keeps its `ip` / `userAgent` — an admin-written row's are the admin's; `metadata`
  keeps only the keys `EXPORTED_AUDIT_METADATA` lists for its action, so an admin id such as
  `impersonatedBy` never reaches the file), `notifications` (type, created, read, data — see
  [Notifications](#notifications) above), `analyticsEvents`, `pageviews`, `supportRequests` and
  `jobApplications` — the last only those sent from the account's own address, and only once that
  address is verified (an unverified account has not proven it owns the address an application was
  sent from). The file is written through the storage seam under `exports/<userId>/<random>.json`
  (`EXPORT_KEY_PATTERN` in `@repo/api-contract`, apart from `FILE_KEY_PATTERN` on purpose — only
  `account.export.download` ever serves one, never `files.get`), then, in a transaction that
  re-reads the row (a concurrent run of the same job may have already won), marks it `ready` with
  an `expires_at` `EXPORT_TTL_MS` out and enqueues `dataExportReady` linking to the account app's
  `/data-privacy`. `account.export.get` reports the latest row (whatever its status; `null` for
  never requested), except that a row still `pending` `EXPORT_REQUEST_INTERVAL_MS` after its
  request reads as `expired` — its job died, and the page must offer a new request rather than
  "Preparing…" forever; `account.export.download` streams the file — `NOT_FOUND` for another
  user's id, an unknown one, a row that is not `ready`, or one whose `expires_at` has passed even
  if the nightly prune has not yet caught it — as a `File` named `<brand>-data-<day>.json`;
  `apps/account`'s `/data-privacy/export` route (no other app has one) sets
  `Content-Disposition: attachment` so the browser saves rather than opens it. `request` and
  `download` refuse an impersonation session (`refuseWhileImpersonating`): an admin neither asks
  for nor downloads a user's export. `get` does not — it only shows the status.
  `privacy.export.prune` (nightly, see below) turns every `ready` row past its `expires_at` into
  `expired` and queues its file for `storage.delete`, and turns every row still `pending` a day
  after its request into `expired` (a late retry of its dead job then finds it no longer `pending`
  and does nothing), in one transaction per run.
- **Scheduling a deletion.** `account.delete` (⚑, `DeleteAccountSchema`: `{ email }`, any string so
  a mismatch gets its own field error) refuses unless the typed email equals the caller's own
  (case-insensitively), refuses a session past the re-authentication window (`FORBIDDEN`,
  `data.reason: "reauth"`, same check as setting a password or two-step setup) and refuses while the
  caller is the sole owner of a workspace with other members (`CONFLICT`, naming them in
  `data.names` — the purge re-checks this itself, since an invitation can be accepted in the
  meantime). Otherwise it schedules the purge `DELETION_GRACE_MS` ahead with
  `users.scheduleDeletion` — which only ever sets the column once and always returns the date that
  stuck, so **a second call while one is already scheduled is a no-op**: the same date comes back,
  with no second `revokeSessions` and no second `accountDeletionScheduled` mail. On the call that
  actually schedules it, every session (including the caller's) and open two-factor challenge ends
  (`users.revokeSessions`), and `accountDeletionScheduled` is mailed with a link to
  `${AUTH_URL}/login` — signing in during the grace period is how the deletion is cancelled.
  `account.cancelDeletion` (⚑) just clears the column; any live session of the user may call it, not
  only the one that scheduled it, and it is a no-op once nothing is scheduled. Both refuse an
  impersonation session.
- **Purging.** `privacy.purge` (hourly, `25 * * * *`) pages through every user whose
  `deletion_scheduled_at` has passed (`users.dueForDeletion`, keyset on `(scheduled_at, id)` so a
  user skipped for good never hides the ones behind it), calling `purgeUser` for each and catching
  its own errors so one user's failure never stops the page. `purgeUser`, outside any transaction
  first: cancels the live subscription (as `workspaces.delete` does) of every workspace the user is
  the sole member of — a failed cancel skips the user for the next run, deleting nothing. Then, in
  one transaction: locks the user row, then every shared workspace it co-owns, re-reads it (gone
  or no longer due is a skip), re-checks the sole-owner block, re-checks that a workspace that
  became sole-member only after the cancels above has no live subscription left uncancelled, deletes every workspace the user is the sole member of
  (logos queued), runs `users.purge`, and then **re-counts the owners of every shared workspace the
  user co-owned** and rolls the whole purge back (leaving the user scheduled for the next run)
  rather than orphan one. That re-count is a safety net: right after the user row, the purge locks
  every shared workspace the user co-owns (`workspaces.lockForOwnership`, ascending id), so a
  co-owner's racing leave waits for the purge (and is then refused as the last owner) or the purge
  waits for it (and is then skipped as the sole owner). Only the ownership `CONFLICT` counts as
  this skip; any other error in the re-count fails the purge.
  Once past that, it mails `accountDeleted` to the address read inside the transaction, queues the
  avatar and every export file for `storage.delete`, and writes a `user.deleted` audit row (actor
  `null`: the system) naming the workspaces it deleted. A skip (sole owner, an uncancelled
  subscription, or the ownerless re-check) leaves the user scheduled and is retried next run; a
  skip that happened after subscriptions were already cancelled names them
  (`workspace <id> (<subscriptionId>)`) in the recorded failure, so an operator can restore them by
  hand. `PURGE_PAGE_SIZE` (100) and a `pageSize` payload field (tests only) bound how many due users
  one run reads at a time; the job pages until none is left or its signal aborts.
- **What `users.purge` does with every column that references the user** (the full inventory is a
  comment over the function in `src/queries/users.ts`): deletes outright — `sessions` (own and any
  it was impersonating), `tokens` (by `user_id`, and by `email` for a magic link sent before the
  account existed), `identities`, `memberships`, `two_factor_recovery_codes`, `data_exports`.
  Deletes accepted `invitations` to the user's address (a record that the address joined the
  workspace; pending ones stay valid). `SET NULL` — `invitations.invited_by` and
  `workspaces.created_by` (the invitation and the workspace both stay),
  `analytics_pageviews.user_id` and `analytics_events.user_id` (counts survive, de-linked),
  `audit_log.actor_user_id` and `audit_log.impersonated_user_id` (the row
  itself is append-only and stays; only the ids linking it back to the account are cleared —
  `target_id`, `metadata`, `ip` and `user_agent` are kept, so the trail of what was done to the
  account is still legible), and `billing_customers.email` where it matched the user's own address
  (case-insensitively — a workspace's billing customer and its mirrored subscription outlive the
  user who checked out). Left alone on purpose — **kept**: `notes.user_id` keeps pointing at the
  now-gone id (the note belongs to its workspace, not the user), so `Note.authorId` comes back
  `null` and `apps/app` shows "Deleted user" in its place; `waitlist` rows (a marketing address, not
  the account, with its own lifecycle). Returns the avatar key and every export's storage key, read
  before the deletes, for the caller to queue with `storage.delete`.
- **A purged identity no longer blocks its provider.** `auth.oauth.callback` looks up the identity,
  then the user it names; when the user row is gone (linked, then purged before the next sign-in)
  the identity is deleted and the callback proceeds as for an unknown identity — a provider account
  is never locked out by a purged user's leftover link.
- **Deliberately out of scope.** Exporting or purging data held by a third party (a billing
  provider, Sentry, PostHog/Plausible); a "cancel inside N minutes" undo window narrower than the
  7-day grace period; redacting a deleted user's name out of other users' notes (the note's text is
  the author's, kept with the workspace).
- **Tests.** `src/privacy.test.ts` covers the export lifecycle (throttling, the file's contents,
  expiry), the delete/cancel procedures (the reauth and sole-owner refusals, the no-op repeat) and
  `purgeUser`'s skip reasons (sole owner, an uncancelled subscription, the ownerless re-check) plus
  the paging `privacy.purge` job, on both engines.

## Telemetry

`apps/api` is the only thing that talks to a third party: browsers report errors and web vitals to
their own app's `POST /api/telemetry` (same-origin `sendBeacon`), every Next app's route forwards
server-to-server to this api's `telemetry.ingest` with the service token, and `apps/ai` calls it
directly on a request failure. No SDK, no key, and no CSP change in any browser.

- **`telemetry.ingest`** (⚑-free — the service token alone, no session; `app` is whatever the caller
  passes, but every Next app's route already overwrote it to its own name before forwarding, so a
  page cannot claim to be a different app). Rate-limited twice, `TOO_MANY_REQUESTS` past either:
  per client (`telemetryLimiter`, `TELEMETRY_RATE_LIMIT` a minute, default 60, keyed `telemetry:<x-api-client-id>`, skipped for the
  shared `telemetry:<app>` id the route sends when it cannot see the browser's ip — the browser
  route sends `telemetry:<32 hex of sha256(ip)>`, a prefix apart from `@repo/session`'s `anon:`
  sign-in bucket, so telemetry never uses up a browser's sign-in allowance under `API_RATE_LIMIT`),
  then per app (`telemetryAppLimiter`, 3000 a minute, keyed `telemetry:app:<app>`), the backstop
  against a flood spread across many ips and so many client ids.
  Validates against `BrowserBatchSchema` (`@repo/api-contract`): up to `TELEMETRY_LIMITS.batch` (20)
  errors and 20 vitals per call, each field capped (`message` 500, `stack` 4000, `digest` 64,
  `route` 200, `userAgent` 300, `navigationType` 30) — over any cap is `BAD_REQUEST` from the
  contract (the Next route turns that into its own `204` to the browser regardless).
- **Storage (migration `0012_telemetry`).** `telemetry_errors`: one row per `(fingerprint, day)` —
  `fingerprint(app, kind, message, stack, digest?)` (`src/telemetry/fingerprint.ts`) is a sha256 of
  the app, kind, the digest when there is one (Next's id for a server-component error, whose
  production message is the same generic text for every such error — without it they would all be
  one row), a normalised message (digit and hex runs collapsed) and the stack's first `at …` frame
  (its query string and `:line:col` stripped and the same normalisation applied, so neither a
  redeploy that only shifts line numbers nor a content-hashed chunk name such as `app-8f3c2a9b.js`
  splits a group — a different frame still starts a new one), so the same bug on the same day
  counts up (`count`, `last_seen`) instead of adding rows;
  a new day starts a new row. `telemetry_vitals`: one row per sample (app, route, name, value,
  rating, navigationType, at) — no dedup, since a time series needs every sample. Routes are
  pathnames only: `sanitizeRoute` strips a query string or hash and collapses every opaque segment
  (all digits, a UUID, or 16+ characters of `[A-Za-z0-9_-]`) to `:id` before the row is ever
  written, so `/invitations/<token>` is stored as `/invitations/:id` (defence in depth — the
  browser applies the same rule).
- **Retention, a schedule.** Errors 30 days (`ERROR_RETENTION_MS`), vitals 7 days
  (`VITAL_RETENTION_MS`): the `telemetry.prune` job (`src/jobs/builtin/telemetry.ts`) runs
  `DELETE … WHERE last_seen/at < now - retention` at minute 5 of every hour (see [Jobs](#jobs)).
- **Provider seam (`src/telemetry/`, picked at boot by `TELEMETRY_PROVIDER`).** `store` (the
  default): the tables above are the whole story. `sentry`: the same storage, **plus** every newly
  created fingerprint-day's error is forwarded to Sentry's envelope endpoint over plain `fetch`
  (`sentry.ts`'s `buildEnvelope` / `parseDsn`; no `@sentry/*` SDK) — a repeat that only increments an
  existing row's count is not forwarded again. A malformed `SENTRY_DSN` fails at startup, not on the
  first error. The forward is a `telemetry.forward` job (`{ errorId }`), enqueued only when the
  provider is not `store` and never blocking `ingest`'s response (a failed enqueue is logged, not
  raised). A network error, a timeout, a 5xx or a 429 throws, so the job retries with backoff and,
  dead, is recorded like any other; any other 4xx would only repeat and is logged and dropped. The
  envelope's `event_id` is deterministic (sha256 of `fingerprint:day`), so a job redelivered after
  Sentry accepted it is deduplicated by Sentry. See
  `docs/guides/sentry.md` for setup and exactly what a Sentry event contains.
- **The api's own 5xx.** `recordServerError(deps, "api", error, route?)` wraps the existing
  `log("rpc failed" | "unhandled", error)` seam with a `server`-kind event — this is also how
  `apps/ai`'s unexpected failures reach these tables, via its own `createTelemetryClient({ app:
  "ai" })` calling `telemetry.ingest` directly (see `apps/ai/README.md`); neither path can turn a
  reporting failure into a request failure.
- **Background failures.** A job that dies (every mail send, storage delete and prune runs as one),
  a failed `storage.delete` enqueue and the billing webhook's write failure report through
  `context.recordFailure(message, error)`, which
  logs and records a `server` row for app `api` — otherwise a bouncing mail provider would leave
  only a log line. `toErrorEvent` masks the message first (email addresses → `<email>`, runs of 16+
  `[A-Za-z0-9_-]` → `<token>`, then truncation), and puts the masked message in place of the raw one
  at the head of the stack, with any other address in it masked too. Telemetry's own failures (a
  failed record or forward enqueue) are only logged, so a database outage cannot recurse;
  `recordServerError` runs detached and is never awaited on the caller's path.
- **Admin surface.** `admin.telemetry.errors` (24 h window: distinct fingerprints, total events, top
  5 by count, each with the message, route and digest first recorded on its latest day) and
  `admin.telemetry.vitals` (7 d window: the nearest-rank p75 of LCP/INP/CLS per app, picked in SQL —
  `vitalP75` counts each (app, metric) and reads the one value at offset `ceil(0.75 · n) − 1`, on
  both engines, so no sample list is loaded; `samples` is the app's LCP, INP and CLS samples summed)
  feed `apps/auth`'s `/admin` **Errors (24 h)** / **Web vitals (7 d)** cards (see
  `apps/auth/README.md`); a failure of either call renders `Could not load …` in its card instead
  of failing the page. Both sit behind the same `superadmin` middleware as every other `admin.*`
  procedure.
- **Consent, stated once.** An event always carries `app`, `route`, `kind`, `message`, `stack`,
  `digest` and the vital fields. `userAgent` only when the browser's `consent` cookie was `all` at
  send time — never an ip, a user id, a cookie or a request body. `@repo/telemetry/browser` enforces
  this client-side before the request is ever made; the api does not re-derive consent, it only
  stores or drops what arrived.
- **Env.** `TELEMETRY_PROVIDER` (`store` default, or `sentry`), `SENTRY_DSN` / `SENTRY_ENVIRONMENT`
  (required / optional with `sentry`). `.env.example` and `apps/api/.env.example` list them.

## Analytics

First-party visitors, pages and the product events that matter, in the api's own database, shown
on `apps/auth`'s `/admin/analytics`, with an optional seam to forward the same data to PostHog or
Plausible. See `docs/guides/analytics.md` for adding a product event, client events, provider setup
and the privacy text to adapt.

- **Ingest.** `analytics.ingest` (service token only, no session — called only by each Next app's
  own `POST /api/analytics` route and, for product events, `recordEvent`'s own job, never directly
  by a browser). Validates against `ANALYTICS_EVENTS` (`@repo/api-contract/analytics`): an unknown
  name, a client-sent name not marked `client: true`, a prop outside that event's allowlist, or
  props over 1 KB encoded is `BAD_REQUEST`. Collapses the path the same way telemetry does
  (`collapseRoute`), keeps a referrer's host only when it is not one of our own (the `SITE_DOMAIN`
  parent domain or any `*.<domain>`, from `siteDomain()` in `@repo/sites`: www → app is not an
  external referral), and computes `visitor_id` only when both `ip` and
  `userAgent` arrived: `visitorId(saltFor(today), app, ip, userAgent)` — the first 16 hex chars of
  `sha256(salt + ":" + app + ":" + ip + ":" + userAgent)` (`src/analytics/visitor.ts`); the salt
  comes from `analytics_daily_salts` (`saltFor` inserts then selects, so two concurrent first calls
  of the day on either engine agree on one salt via `ON CONFLICT (day) DO NOTHING`). The ip and user
  agent are never stored. Rate-limited per client id (`analyticsLimiter`, `ANALYTICS_RATE_LIMIT` a
  minute, default 120) and per app (`analyticsAppLimiter`, 6000 a minute, the backstop) — a tripped
  limit answers success with nothing stored, same as `telemetry.ingest`'s pattern.
- **`recordEvent(context, name, ids, props, options?)`** (`src/analytics/record.ts`) is what every
  instrumented procedure calls after its write: `auth.signUp` and the oauth/magic-link
  account-creation paths (`signed_up`, `method`), `email_verified` wherever an email becomes
  verified — `auth.verifyEmail` (skipped for an account already verified), oauth and magic-link
  account creation (created verified) and `purgeUnverifiedAccount` (inside its transaction; it only
  runs on a never-verified account) — so each account records it once,
  `workspaces.create` (`workspace_created`), `workspaces.invitations.create` (`member_invited`,
  `role`), `invitations.accept` / `acceptById` (`invitation_accepted`, only for a membership that
  genuinely committed), `notes.create` (`note_created`), the billing mirror on an actual plan change
  — the workspace's effective plan (`entitlementsFor` over `subscriptions.latest`, the row
  `workspaces.get` reads) before and after the write, or the interval of a live paid plan, so a
  status-only change on the same plan, or an old subscription canceled after the workspace moved
  to a new one, records nothing — (`plan_changed`, `plan`, `interval`), and
  `account.twoFactor.enable` (`two_factor_enabled`). On an impersonation session
  (`context.impersonating`) it records nothing at all, for every caller. It enqueues `analytics.event` inside the
  caller's transaction when one is given, so a rolled-back write enqueues nothing; without a `tx` a
  failed enqueue is caught and recorded via `recordFailure`, never slowing or failing the request.
  Invalid props at a call site throw loudly in development/test (a bug to fix) and are dropped and
  recorded in production.
- **Storage (migration `0016_analytics`).** `analytics_pageviews` (`app`, `path`, `referrer_host`,
  `visitor_id`, `user_id` / `workspace_id` — consent or product-event only, `day`),
  `analytics_events` (`name`, `source` — `api` or the browser's app id — `user_id` / `workspace_id`,
  `props` JSON, `visitor_id` for a client event, `day`), `analytics_daily_salts` (one row per UTC
  day, deleted the day after) and `analytics_daily` (one row per `day` / `kind` (`page` or `event`)
  / `app` / `key`, `count` and `visitors`, unique on that tuple — rebuilt, never appended to).
- **Jobs and schedules (see [Jobs](#jobs)).** `analytics.event` (`src/jobs/builtin/analytics.ts`):
  writes one `analytics_events` row (`source: "api"`, no `visitor_id`; the row's `day` comes from
  the event's own `at`, not the job's run time) and, when a provider is configured, enqueues
  `analytics.forward`. `analytics.forward`: delivers one `ForwardItem` to the configured provider,
  retried with backoff on a network error, a timeout, a `5xx` or a `429`. `analytics.rollup`
  (`10 0 * * *`, `{ day? }`): with no `day` (the schedule) rebuilds the day before yesterday and
  yesterday (`rollupDays`), so an event that landed after its day's first rollup still reaches
  `analytics_daily` the next night; with a `day`, that day only. Each day is deleted and rebuilt
  from the raw tables in one transaction — idempotent, safe to re-run — except a day with no raw
  rows left (past retention), which is skipped so its rows are never wiped. Event counts are at
  least once: a worker crash after the `analytics.event` insert re-runs it and double-counts that
  row (the funnel counts distinct users and is unaffected). `analytics.prune`
  (`20 0 * * *`): deletes raw pageview/event rows past `ANALYTICS_RETENTION_DAYS` (default 90) and
  salts older than today; never touches `analytics_daily`.
- **Provider seam (`src/analytics/providers/`, picked at boot by `ANALYTICS_PROVIDER`).** `store`
  (the default): the tables above are the whole story. `posthog`: `POST ${POSTHOG_HOST}/i/v0/e/`
  with `api_key: POSTHOG_KEY`, `distinct_id` `user:<id>` when the row has a user, else
  `workspace:<id>` when it has a workspace (the `ForwardItem` carries `workspaceId` for this alone,
  never as a property), else `visitor:<visitorId>`, else `"anonymous"` with
  `properties.$process_person_profile: false`, a pageview as `$pageview` with `$current_url` built from
  the app's site URL plus the collapsed path, `$ip: null` and `$geoip_disable: true` always, and a
  `uuid` generated once when the forward job is enqueued (never inside the provider) so a retried
  delivery resends the same id and PostHog dedups it. `plausible`: `POST ${PLAUSIBLE_HOST}/api/event`
  with `domain: PLAUSIBLE_DOMAIN`, `name` (`pageview` or the event name), `url` (the app's site URL
  plus the path for a pageview; for a product event, the reporting app's site URL — `"api"` groups
  under `app`, since it has no site of its own) and the api's own honest user agent,
  `boilerplate-bun analytics`, never a faked browser one — Plausible may bot-filter and silently
  drop a server-sent hit on that, and has no dedup key at all, so a retried delivery can double-count
  there; both are accepted limitations (see `plausible.ts`'s doc comment) since the first-party
  tables already counted the hit exactly once and remain the source of truth. Neither provider ever
  receives an ip or a user agent. `createAnalyticsProvider(env, opts, log)` exits the process at
  startup when the chosen provider is missing its vars, naming them; `POSTHOG_HOST` /
  `PLAUSIBLE_HOST` must be URLs.
- **The superadmin summary.** `admin.analytics.summary({ days: 7 | 30 | 90 })` (`NOT_FOUND` to
  anyone else, impersonation included): a zero-filled days series of visitors and pageviews
  (visitors distinct per `(day, app)` — the rollup's per-app `"*"` key — then summed across apps, so
  the same person on two apps counts twice), the top 10 pages and top 10 referrer hosts in the
  range, a per-`(day, name)` events table merged across every source, and a funnel
  (`signed_up` → `email_verified` → `workspace_created` → `invitation_accepted` **or**
  `note_created`) as four nested `Set<number>` intersections within the range, never consulting
  timestamps against each other. Every past day reads `analytics_daily`; a past day the nightly
  rollup hasn't reached yet (or whose job died) falls back to the same live aggregation today always
  uses, for days, top pages and events alike — top referrers always reads raw rows for the whole
  range, rollup-independent. The funnel and top referrers read raw rows, so with
  `ANALYTICS_RETENTION_DAYS` shorter than the range they cover only the retained days; the summary
  returns `retentionDays` and the page says so. Feeds `apps/auth`'s `/admin/analytics` (see
  `apps/auth/README.md`).
- **Consent, stated once.** A pageview or client event carries `userId` / `workspaceId` only when
  the browser's `consent` cookie was `all` at send time and, for a signed-in app, the session was
  not impersonating — never an ip, a user agent, an email, a name or free text. A product event
  recorded by `recordEvent` always carries the account's ids (it is already account-tied data the
  api holds), never an ip or user agent either, and is forwarded to a configured provider too.
- **Env.** `ANALYTICS_PROVIDER` (`store` default, `posthog` or `plausible`),
  `ANALYTICS_RETENTION_DAYS` (default 90; raw rows only — the funnel and top referrers cover at
  most that many days), `ANALYTICS_RATE_LIMIT` (default 120), `POSTHOG_KEY` +
  `POSTHOG_HOST`, `PLAUSIBLE_DOMAIN` + `PLAUSIBLE_HOST` (required iff that provider).
  `.env.example` and `apps/api/.env.example` list them; `docker-compose.yml` forwards all seven to
  the `api` service.

## Jobs

A durable job queue in the api's own database, on SQLite and Postgres alike — no Redis, no extra
service. Every mail, every storage delete, Sentry forwarding and the maintenance prunes run through
it. Adding your own jobs and schedules, and running a dedicated worker: `docs/guides/background-jobs.md`.

- **Migration `0015_jobs`.** One `jobs` table: `name`, `payload` (JSON text), `status` (`CHECK` in
  `queued`, `running`, `succeeded`, `dead`), `attempts` (bumped on claim), `max_attempts`, `run_at`,
  `locked_until`, `last_error` (truncated to 2000 characters), `dedupe_key`, `created_at`,
  `finished_at`. Indexed on `(status, run_at)`; `jobs_live_dedupe_key` is a partial unique index on
  `dedupe_key` `WHERE status IN ('queued', 'running')`, so a finished job frees its key. Migration
  `0022_jobs_request_id` adds a nullable `request_id`, stored at enqueue from
  `currentRequestId()` and resumed by the worker, so a job's logs join the request that caused it
  (see [Logs, request ids and metrics](#logs-request-ids-and-metrics)).
- **Defining.** `defineJob({ name, payload, maxAttempts?, timeoutMs?, run })` (`src/jobs/define.ts`;
  defaults 5 attempts, 60 s) and one entry in `JOBS` in `src/jobs/registry.ts`. `run(payload, ctx)`
  gets `db`, `mailer`, `storage`, `telemetry`, `log`, `recordFailure`, `signal` (aborted at the
  timeout), `attempt` and `now()` (the worker's clock).
- **Enqueueing.** `context.enqueue(def, payload, { tx?, dedupeKey?, runAt? })`
  (`src/jobs/enqueue.ts`). The payload is parsed with the definition's schema at enqueue — a bad one
  throws in the caller — and again at run. `tx` inserts in the caller's transaction (commit
  together or not at all; no nudge, the next poll finds it). A `dedupeKey` a `queued` / `running`
  row already holds returns that row's id (`INSERT … ON CONFLICT (dedupe_key) WHERE … DO NOTHING`,
  never a caught unique violation, which would abort a Postgres transaction). The procedures await
  their enqueues: a failed job insert after a committed write answers `500` — durability over silent
  loss — except a `storage.delete` enqueue, recorded and left to `storage.sweep`. `detach()` remains
  only for the two silent mail enqueues (`auth.requestPasswordReset`, `auth.magicLink.request`: equal
  timing for a known and an unknown email) and for `recordServerError`.
- **The worker** (`src/jobs/worker.ts`). `createServer` starts it unless `JOBS_WORKER=false`
  (`jobsWorker`). Every `JOBS_POLL_MS` (default 1000, 100–60 000) it claims up to
  `JOBS_CONCURRENCY` (default 4, 1–50) minus jobs in flight in one statement — `UPDATE jobs SET
  status = 'running', attempts = attempts + 1, locked_until = … WHERE id IN (SELECT id … WHERE
  (status = 'queued' AND run_at <= now) OR (status = 'running' AND locked_until < now) ORDER BY run_at
  LIMIT n FOR UPDATE SKIP LOCKED)` on Postgres, the same without `SKIP LOCKED` on SQLite, where one
  statement and one writer per file make it atomic (several processes on one file: see **Data**
  below). An enqueue in the same process (except one inside a `tx`, found by the
  next poll) and a freed slot poll at once. The batch's
  lock is the longest registered `timeoutMs` up to 5 minutes (`LONG_JOB_MS`) plus 30 s — so raising
  one job's timeout within that delays the reclaim of every crashed job; a longer job (`backup.run`,
  30 minutes) is left out of it and has its own row's lock extended to its timeout plus 30 s right
  after the claim, so a crashed `mail.send` is still reclaimed after 90 s — and is written with the claimer's clock (keep workers on NTP); each
  job's own timeout aborts its `signal` and counts as a failure, but a run that ignores the signal
  keeps going while its retry runs. Outcomes are written only while the row is still the attempt that ran
  (`id`, `attempts`, `running`), so a late result from a timed-out run cannot overwrite a newer one.
- **Outcomes.** Success: `succeeded`, `payload` `{}`, `finished_at`. A throw or timeout below
  `max_attempts`: back to `queued` at `now + min(30 s × 2^(attempt−1), 1 h) ± 20 %`
  (`src/jobs/backoff.ts`), logged only. The last attempt: `dead`, `last_error` kept,
  `recordFailure` (log plus a telemetry `server` row). An unknown name, an unparseable payload or one
  failing the schema: `dead` at once with that reason — so in a rolling deploy an older worker that
  claims a job it does not know kills it as `unknown job`: deploy workers with or after the code that
  defines it. A row reclaimed from a crashed worker after its last attempt dies as `worker lost the
  job on its last attempt`.
- **At least once.** A crashed worker's `running` rows are reclaimed once their lock passes, so a
  job can run twice. The one-time-link mails (verify, reset, magic link) pass an idempotency key
  (which doubles as their dedupe key) to the mailer, `storage.delete` tolerates a missing key,
  `telemetry.forward` sends a deterministic Sentry `event_id`, `analytics.forward` a uuid fixed at
  enqueue (PostHog dedups it), and the prunes, the sweep and the analytics rollup are re-runnable.
  `analytics.event` is not: a rerun inserts its row again, so event counts are at least once (the
  analytics funnel counts distinct users and is unaffected). The other mails (password-changed, two-factor notices, account reset, invitation,
  waitlist welcome) carry no key and may be sent twice after a worker crash or a timeout — the
  accepted worst case.
- **Payloads.** Cleared on success. A dead job keeps its payload so **Retry** can run it: a
  `mail.send` payload can hold a live one-time link until the job succeeds or `jobs.prune` deletes
  the dead row after 30 days; the token expires on its own (15 minutes to 7 days). No procedure ever
  returns a payload.
- **Scheduler** (`src/jobs/scheduler.ts`, `src/jobs/cron.ts`). Runs in every worker, on each minute
  boundary; due schedules are enqueued with dedupe key `schedule:<name>:<YYYY-MM-DDTHH:MM>` (UTC)
  and `dedupeAnyStatus` (a row of any status holding the key blocks it, not only a live one), so any
  number of workers enqueue a run once, even after the first copy already finished. A late wake-up runs the missed minute and the current
  one, never a backlog. `defineSchedule({ name, cron, job, payload })` parses the 5-field UTC cron at
  import (`*`, numbers, lists, ranges, steps; day of week 0–7; Vixie OR when both day fields are
  restricted). Built-in, in `SCHEDULES`:

  | Schedule | Cron | Job |
  |---|---|---|
  | `tokens.prune` | `0 * * * *` | used or expired one-time tokens (`tokens.deleteStale`) |
  | `telemetry.prune` | `5 * * * *` | errors after 30 days, vitals after 7 |
  | `jobs.prune` | `15 3 * * *` | `succeeded` after 7 days, `dead` after 30 |
  | `analytics.rollup` | `10 0 * * *` | rebuilds `analytics_daily` for yesterday and the day before (a day with no raw rows left is skipped, never wiped) |
  | `analytics.prune` | `20 0 * * *` | raw analytics rows past `ANALYTICS_RETENTION_DAYS`, salts before today |
  | `storage.sweep` | `30 3 * * *` | `Storage.list("avatars/" \| "logos/" \| "exports/")`: objects no `users.avatar_key` / `workspaces.logo_key` / `ready` `data_exports` row holds (one lookup per 100 keys; stops when its signal aborts), last modified over 24 h ago, matching `FILE_KEY_PATTERN` (or `EXPORT_KEY_PATTERN` under `exports/`). Deletes what *this* database does not reference: one bucket per environment Paused by `STORAGE_SWEEP_ENABLED=false`. |
  | `privacy.export.prune` | `40 3 * * *` | every `ready` export past its `expires_at` to `expired`, queuing its file for `storage.delete`, and every export still `pending` a day after its request to `expired` (see [Privacy](#privacy)) |
  | `privacy.purge` | `25 * * * *` | purges every user whose scheduled deletion has passed, paging through all of them (see [Privacy](#privacy)) |
  | `applications.prune` | `50 3 * * *` | deletes every job application past its `delete_after` (6 months after it was sent) and queues its CV for `storage.delete`, in one transaction per row (see Hiring above) |
  | `backup.run` | `0 2 * * *` | off unless `BACKUP_ENABLED=true` (checked on every tick; the process's env is fixed at start, so toggling it is a restart); dumps the whole database to `backups/<date>/<engine>-<time>.jsonl.gz` through the storage seam, then deletes its own objects there past `BACKUP_RETENTION_DAYS` — see **Backups** below |
  | `webhooks.prune` | `55 3 * * *` | deletes `webhook_deliveries` rows older than 30 days (see [Webhooks](#webhooks)) |
  | `notifications.prune` | `5 4 * * *` | deletes every read notification older than 30 days and every notification, read or not, older than 90 days (see [Notifications](#notifications)) |

- **Built-in jobs.** `mail.send` (`{ template, to, props, idempotencyKey? }`), `storage.delete`
  (`{ key }`), `storage.sweep`, `telemetry.forward` (`{ errorId }`; a pruned row is a no-op),
  `telemetry.prune`, `tokens.prune`, `jobs.prune`, `analytics.event` (one product event row),
  `analytics.forward` (one `ForwardItem` to the provider), `analytics.rollup` (`{ day? }`) and
  `analytics.prune` (see [Analytics](#analytics)); `privacy.export` (`{ exportId }`),
  `privacy.export.prune` and `privacy.purge` (`{ pageSize? }`, for tests — see [Privacy](#privacy));
  `applications.prune` (see Hiring above); `backup.run` (`{}`; see **Backups** below);
  `webhook.deliver` (`{ endpointId, eventId, type, timestamp, data }`, `maxAttempts` 8),
  `webhooks.prune` (see [Webhooks](#webhooks)) and `notifications.prune` (see
  [Notifications](#notifications)).
- **A dedicated worker.** `src/worker.ts` (bundled as `dist/worker.js`; `bun --filter @repo/api
  dev:worker` in development, `start:worker` for the bundle): the worker and scheduler only, migrating on boot under the migration lock, serving
  `GET /health` on `HOST:PORT` (default 3007 like the api — give it its own port; 503 when the
  database does not answer) and nothing else.
  Run it with `JOBS_WORKER=false` on the api replicas. `docker-compose.yml` has it as `api-worker`
  under the `worker` profile (the api's `boilerplate-bun-api` image, `PORT` 3017, a `/health` check):
  `JOBS_WORKER=false docker compose --profile worker up -d --build`.
- **Shutdown.** Claiming and the scheduler stop as shutdown begins (the lifecycle's `onShutdown`);
  jobs in flight get `drainMs` (8 s) alongside the HTTP drain before the database closes, and
  anything still running is reclaimed once its lock passes.
- **Admin.** `admin.jobs.list` / `retry` / `discard` (see [Admin](#admin)) feed `apps/auth`'s
  **Background jobs** card.
- **Tests.** `start()` in `src/test-server.ts` runs with `jobsWorker: false`; `app.drain()` claims
  and runs due jobs until none is due and none is in flight, and `mailsTo` / `signUp` drain first.
  `src/jobs/*.test.ts` and `src/jobs/builtin/*.test.ts` cover cron, backoff, enqueue, the worker
  (retries, timeouts, reclaiming, two workers, schedules, shutdown) and each built-in, on SQLite and
  Postgres.
- **Per-name caps.** `createWorker`'s `nameLimits` (`{ [jobName]: limit }`) bounds how many jobs of
  one name a process runs at once: each capped name is claimed in its own statement (`name = …`)
  up to what its cap leaves, then every other name (`name NOT IN (…)`) for the remaining slots —
  still one atomic `UPDATE … WHERE id IN (SELECT … FOR UPDATE SKIP LOCKED)` per claim. Today only
  `webhook.deliver`, at `WEBHOOK_CONCURRENCY` (default 2, 1 to `JOBS_CONCURRENCY`; unset never
  exceeds `JOBS_CONCURRENCY`, a larger value is refused at startup), so endpoints that hang can
  never take every slot from mail and the other jobs.
- **Env.** `JOBS_WORKER` (default `true`), `JOBS_CONCURRENCY`, `JOBS_POLL_MS`, `WEBHOOK_CONCURRENCY`. `.env.example` and
  `apps/api/.env.example` list them.

## Backups

A portable logical backup and restore of the whole database — see `docs/guides/operations.md`'s
**Backups and runbooks** for turning it on, what is and isn't in a backup, the restore drill on
both engines (including cross-engine restore), and runbooks for the common incidents.

- **Format and code** (`apps/api/src/backup/`). `format.ts`: gzipped JSON lines, a header naming
  the engine, `createdAt` and the applied `migrations` (in order), plus each table's last-handed-out
  id, then per table a `{ table, columns }` line and one row per line. `dump.ts`: one read
  transaction (Postgres `REPEATABLE READ READ ONLY`; SQLite a `DEFERRED` transaction on its own
  read-only connection to the file, a WAL snapshot, so the api's own statements are not held behind
  the dump — only `:memory:` dumps on the gated connection), tables
  ordered parents-first by foreign key, read in pages of 1 000, streamed into gzip without buffering
  the whole database. `restore.ts`: refuses a target with any rows unless `force` (which deletes
  them children-first first), refuses a backup naming a migration this build doesn't know or a
  target with *more* migrations applied than the backup lists (even with `force`), migrates the
  target to exactly the backup's migrations, inserts every table in batches, sets each id
  counter (a Postgres sequence, SQLite's `sqlite_sequence`) to at least the backup's own counter
  and at least the restored rows' `MAX(id)`, so an id handed out before the backup — even to a row
  deleted before it was taken — is never reused, then runs the rest of this build's migrations. `tables.ts`:
  introspection (`sqlite_master` / `information_schema`) and the parents-first ordering (a foreign-key
  cycle falls back to alphabetical, with a logged warning). `jobs` and `schema_migrations` are
  excluded (`EXCLUDED_TABLES`) — a queued job would re-run on restore, and the header already carries
  the migration list.
- **The nightly job** (`src/jobs/builtin/backup.ts`). `backup.run`, scheduled `0 2 * * *`, enqueued
  only when `BACKUP_ENABLED=true` (see **Jobs** above): dumps to a local temp file first — never
  straight to storage, so a slow upload never stretches the dump's transaction — then uploads
  it to the storage seam at `backups/<YYYY-MM-DD>/<engine>-<HHMMSS>.jsonl.gz`
  (`BACKUP_KEY_PATTERN`; `local`'s own skip-filter accepts it so retention can list the key, and
  `storage.sweep` never lists `backups/` at all), then deletes its own objects past
  `BACKUP_RETENTION_DAYS` (default 14, 1–365) by the date in the key, leaving any stray non-matching
  key under `backups/` alone. Uploading reads the whole compressed file into memory
  (`Storage.put` takes bytes, not a stream) — worth knowing for a very large database. Success sets
  the gauge `backup_last_success_timestamp_seconds` (read from the `jobs` table's last succeeded
  `backup.run` row on scrape — see [Logs, request ids and metrics](#logs-request-ids-and-metrics) —
  so it disappears 7 days after the last success once `jobs.prune` deletes the row, which is what an
  alert on it should catch) and logs `backup written <key> (<bytes> bytes)`; a dump or upload
  failure goes through `recordFailure` before the usual retry, while a prune failure after a
  successful upload is only recorded (the job succeeds; the next night prunes again). The job's
  timeout (30 minutes) cancels the dump, ending its transaction. Retention prunes every key under
  `backups/` matching the pattern, the CLI's included.
- **CLIs** (`src/backup-cli.ts`, `src/restore-cli.ts`; `backup` / `restore` in
  `apps/api/package.json`, `bun dist/backup-cli.js` / `restore-cli.js` in the image). Both load env
  the same way `index.ts` does and never print a database URL or credential.
  `bun run --filter @repo/api backup [-- --out <file>]` writes the dump to that local file (through
  `<file>.partial`, renamed over it only once complete, so a failed dump never clobbers an earlier
  backup), or without `--out` to the storage seam under a fresh key (logged on success, with its
  size). A key the CLI writes is pruned by `backup.run`'s retention like the job's own, so keep a
  backup you mean to hold on to (before an upgrade, say) with `--out`; and a CLI backup never moves
  `backup_last_success_timestamp_seconds`. `bun run --filter` runs the script in `apps/api`, so a
  relative `--out` or restore path resolves there, not in your shell's directory; both CLIs log the
  absolute path they used. `bun run --filter
  @repo/api restore <file|key> [-- --force]` reads a local file when it exists, else a storage key,
  and loads it with the same rules as above — a `RestoreTargetNotEmpty` exits 1 naming the occupied
  tables and suggesting `--force`; any other failure exits 1 with one clear line, no stack.
- **Env.** `BACKUP_ENABLED` (default `false`), `BACKUP_RETENTION_DAYS` (default `14`, 1–365),
  `STORAGE_SWEEP_ENABLED` (default `true`; `false` pauses `storage.sweep` alone, as the restore
  drill does). `.env.example` and `apps/api/.env.example` list them.

## Realtime

Live updates for signed-in pages over Server-Sent Events, keyless on one node and scaled on
Postgres. The Next apps relay the stream through their own `/api/events` (`createEventsRoute` in
`@repo/session/events`); browsers never call this service. Adding events and subscribing from a
page: `docs/guides/realtime.md`.

- **The bus** (`src/realtime/`). `Broadcaster` (`publish(channel, event)`, `subscribe(channel,
  onEvent)` → unsubscribe, `close()`), built at boot by `createBroadcaster` from the database dialect
  — `memory` for SQLite (in-process fan-out, correct for the one process SQLite implies), `postgres`
  for Postgres — and overridable with `REALTIME_BUS`. `postgres` has its own client, never the
  api's pool: `new SQL(DATABASE_URL, { max: 1 })` (`broadcasterSql`) — one connection for the
  NOTIFYs plus the dedicated one `sql.listen` opens, two in all. It holds one `LISTEN realtime`,
  publishes with
  `SELECT pg_notify('realtime', '<json>')`, so every replica's subscribers hear every replica's
  writes; incoming payloads are validated with `RealtimeEventSchema` and a bad one is logged and
  dropped. After the `LISTEN` connection reconnects, every channel with a local subscriber gets a
  `resync` (notifications sent during the gap are lost). Both buses refuse a `{ channel, event }`
  payload of `NOTIFY_PAYLOAD_LIMIT` (8000) bytes or more, so nothing works on SQLite that would fail
  on Postgres. A subscriber that throws is logged and never stops the others; a channel's entry is
  dropped with its last subscriber. `close()` waits at most 2 s for `UNLISTEN` (a dead connection
  never answers it) and 2 s for pending queries, then closes the connections anyway; a `publish`
  after `close()` is a no-op (matching the memory bus) rather than throwing, so a publish racing
  shutdown is not recorded as a failure.
- **Channels and events** (`@repo/api-contract`'s `realtime.ts`, also the `/realtime` subpath).
  One channel per workspace, `workspaceChannel(id)` = `workspace:<id>`, plus one per user,
  `userChannel(id)` = `user:<id>` (Phase 13 A, see [Notifications](#notifications) above).
  `RealtimeEventSchema` is a union on `type`: `note.created` `{ note }` (the `Note` `notes.list`
  returns), `note.deleted` `{ id }`, `presence` `{ replicaId, members: { userId, name, avatarUrl
  }[] }`, `resync` `{}`; `BroadcastEventSchema` additionally covers `notification.created`
  `{ id }` on the user's own channel, so the Postgres listener does not drop it as a bad event.
- **Publishing.** `notes.create` and `notes.delete` call `publishAfterCommit(context, channel,
  event)` (`src/realtime/after-commit.ts`) once the write returns (neither runs in a transaction; a
  caller inside `db.transaction` calls it after the transaction resolves). It is fire-and-forget:
  never throws, never fails the request; a failure goes to `recordFailure`. A `note.created` over
  the payload limit (a 10 000-character body can be) publishes a `resync` instead, so clients
  re-fetch.
- **The stream.** `GET /events/workspaces/:workspaceId` on `Bun.serve`, outside oRPC, behind the
  bearer guard and the rate limiter like every protected route, plus `x-session-token`. The session
  and membership go through `resolveSession` / `findMembership` (`src/access.ts`), the helpers the
  oRPC middleware uses, so the rules are the same (an impersonation session needs its admin to still
  be a superadmin; it may subscribe, read-only, and never joins presence): `401` without a live
  session, `404` "Workspace not
  found" for a non-member, an unknown workspace and a malformed id alike. Headers
  `content-type: text/event-stream`, `cache-control: no-store`, `x-accel-buffering: no`. It sends
  `retry: 3000`, the presence snapshot and a `resync`, then every event on the channel, each with
  one `id:` (monotonic per process, the same on every stream for the same event — one bus
  subscription per channel fans out locally), and a `: ping` comment every 25 s. Nothing is
  replayed: `Last-Event-ID` is accepted and ignored, the `resync` makes the client re-fetch.
- **Limits.** 5 open streams per session and 10 per user across sessions (`429` "Too many open
  streams"; an impersonation stream counts against the impersonating admin's own cap, not the
  impersonated user's — the admin is the one who could open ten tabs). `GET /events/me` (Phase 13
  A) keeps its **own** per-session and per-user counters apart from the workspace stream's —
  counting the two kinds together would halve how many `/notes` tabs fit in one session, since
  each then opens two streams — while `REALTIME_MAX_STREAMS` per process (default 1000, `503`)
  stays shared by both kinds; `503` "Shutting down" once shutdown began. Bun's 10 s idle timeout
  is turned off before the stream is even set up (`createEventsHandler`), not only once one
  opened: the guard, the rate limiter and `authorize` (a database round trip) all run first, and
  Bun would otherwise count that wait as idle. It is restored to its configured value once the
  answer is known not to be a `200 text/event-stream` (`isEventStream`) — a `401`/`404`/`429`/`503`
  — or `protect`/the stream handler throws (a database error on connect, which only `Bun.serve`'s
  own `error()` callback would otherwise see), so a refused or failed request's keep-alive
  connection still idles out; the pings keep a live stream busy. Each stream buffers
  64 KiB; a client that stops reading is dropped once a further 256 KiB is queued, and its
  connection gets a 1 s idle timeout, released by Bun's 4 s sweep. Session and membership are
  re-checked every 60 s; a stream whose session expired or changed, whose member was removed or
  whose impersonating admin lost the role is closed (a database error during a re-check keeps the
  stream and is recorded once per interval). A drop by the server (backpressure, a failed re-check,
  shutdown) errors the body so its queued bytes are discarded — with no error value, the one body
  error Bun.serve does not print a stack trace for (it never reaches the server's `error` handler);
  a client disconnect closes it.
  `onShutdown` closes every stream first, so the HTTP drain does not wait on them, and publishes no
  presence. The dedicated worker (`src/worker.ts`) serves no streams.
- **Presence** (`src/realtime/presence.ts`). Per process: who has a stream open per workspace, keyed
  by user — several connections of one user are one person (the first is a join, the last close a
  leave; the newest connection's name and avatar win). Each join and leave publishes the workspace's
  full snapshot tagged with this process's random `replicaId`, and one process-wide timer
  re-publishes every present workspace's snapshot with the ping (25 s). Members carry `userId`,
  `name` and `avatarUrl` (resolved like `User.avatarUrl`), never an email, and only the workspace's
  channel receives them. Clients merge the latest snapshot per replica and drop one unheard for
  60 s; on several replicas a newcomer may take up to 25 s to see users on the others. A member's
  name and avatar are read when their stream connects, so a change shows on their next reconnect.
  An impersonation stream never joins: coworkers never see the impersonated user present.
- **Tests.** `src/realtime/broadcaster.test.ts` runs the bus contract against `memory` and, with
  `TEST_DATABASE_URL`, `postgres` (two broadcasters on one database hear each other);
  `stream.test.ts` covers the endpoint over real HTTP (statuses, events after a write, the limits,
  re-checks, slow readers, shutdown); `presence.test.ts` the registry.
- **Env.** `REALTIME_BUS` (optional override), `REALTIME_MAX_STREAMS` (default 1000).
  `.env.example` and `apps/api/.env.example` list them; a blank value (`KEY=`) means the default,
  as for `JOBS_WORKER`, `JOBS_CONCURRENCY` and `JOBS_POLL_MS`.

## Where things live

- **Contract** — `packages/api-contract` (`@repo/api-contract`). Zod schemas plus the oRPC
  contract. The API surface changes here first; clients depend on this package, never on this app.
- **Handlers** — `src/router.ts` implements the contract. It fails to typecheck if a handler's
  input, output or errors drift from the contract.
- **Data** — `src/db.ts`, over Bun's native `Bun.sql`. `DATABASE_URL` picks the engine:
  `sqlite://…` (default, `.data/api.db`) or `postgres://…`; both are tested. Schema changes are
  forward-only migrations in `src/migrations/`: add `NNNN_name.ts` exporting `{ name, up }` and
  list it in `migrations/index.ts`. They run at startup and on demand with
  `bun run --filter @repo/api db:migrate`. Engine differences live in `src/dialect.ts`.
  SQLite specifics in `createDb`: Bun holds one connection per file and runs `sql.begin` on it, so
  while a transaction is open every other statement waits for it (a gate in `db.ts`,
  `serialiseSqlite`) instead of running inside it and rolling back with it; statements on `tx` do
  not wait. The gate asks for a transaction's exclusive lock on the next macrotask rather than
  synchronously, so a statement already started just before `db.transaction` runs first, outside
  it, instead of queuing behind it; `sql.transaction` is gated the same way as `begin`, and `file`,
  `reserve`, `beginDistributed` and `distributed` throw — none of them goes through the gate. What
  remains — a statement queued behind an open transaction that then runs no statement for
  `SQLITE_GATE_WAIT_MS` (30 s) — fails with a "waited … behind an open SQLite transaction" error
  and the transaction rolls back; the clock resets on every statement the transaction runs, and is
  never armed behind the startup pragmas or a transaction still in `BEGIN IMMEDIATE`, so a slow but
  progressing transaction, or one blocked at `BEGIN IMMEDIATE` behind another process, never trips
  it. A pragma failure is logged (an error line, `SQLite pragmas failed`) rather than thrown, so the
  statements behind it fall back to Bun's defaults (no busy timeout, no WAL). A file database opens
  in WAL mode with `busy_timeout` 5000 and transactions start with `BEGIN IMMEDIATE`, so two
  processes on one file (the api and a dedicated worker) queue for the write lock instead of failing
  with "database is locked" — a waiting process blocks its event loop meanwhile, so use Postgres
  for several replicas or busy workers.
  Postgres locally: `docker run -d --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`,
  or `docker compose -f docker-compose.dev.yml --profile postgres up postgres`, then
  `DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres bun --filter @repo/api dev`
  — and `bun run --filter @repo/api test:postgres` runs the suite against it (any Postgres 13+
  works: set `TEST_DATABASE_URL` and run `bun --filter @repo/api test`). Both scripts pass
  `--timeout 30000`: suites that sign up several accounts (argon2 each) or drop throwaway Postgres
  databases exceed bun's 5 s default on CI runners. `Queries.afterCommit(fn)` (Phase 13 A, for
  `notifyUser`'s publish — see [Notifications](#notifications)) queues `fn` on the
  `db.transaction` that built the queries and runs it once that transaction's `sql.begin`
  resolves, dropping it on a rollback; on the pool it runs at once. Nesting is not supported:
  never open one `db.transaction` inside another (on SQLite the inner one's callbacks would run at
  its own end, before the outer commit); no caller does. A throw inside it is caught and logged ("db: an after-commit callback threw"),
  never left to roll back a transaction that already committed, and the remaining callbacks still
  run.
- **Jobs** — `src/jobs/` (definitions, registry, enqueue, worker, scheduler, cron, backoff;
  built-ins in `src/jobs/builtin/`), `src/queries/jobs.ts`, and `src/worker.ts`, the dedicated
  worker's entrypoint. See [Jobs](#jobs).
- **Realtime** — `src/realtime/` (the bus, `publishAfterCommit`, the stream, presence) and
  `src/access.ts` (the session and membership rules it shares with the router). See
  [Realtime](#realtime).
- **Notifications** — `src/notifications.ts` (`notifyUser`, `isActor`, `listNotifications`),
  `src/queries/notifications.ts` and `src/jobs/builtin/notifications.ts` (`notifications.prune`).
  See [Notifications](#notifications).
- **Notification preferences** — `src/notification-email.ts` (the unsubscribe token,
  `enqueueNotificationEmail`, `notificationPreferencesFor`, `setNotificationEmail`) and
  `src/migrations/0033_notification_preferences.ts`. See
  [Notification preferences](#notification-preferences).
- **Config** — `src/env.ts` validates `Bun.env` with Zod. Bun loads `.env*` files itself.
  `NODE_ENV` defaults to `production` — Bun never sets it, so a bare `bun dist/index.js` fails
  closed (no development error pages). Only `bun dev` sets `development`.

## Calling it from a Next app

```ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"

export const api: ApiClient = createORPCClient(
  new RPCLink({
    url: `${origin}/rpc`,
    // Server-side only — the token must never reach the browser.
    headers: { authorization: `Bearer ${process.env.API_SERVICE_TOKEN}` },
  })
)

const { providers } = await api.auth.providers() // fully typed, no codegen
```

Procedures marked ⚑ above also need the user's `x-session-token`: in a Next app, use the `api()`
member of the app's `createAuth(...)` instance from `@repo/session` (see
`packages/session/README.md`), which sends both headers, instead of building the client by hand.

Add `@orpc/client` and `@repo/api-contract` to the app (`catalog:` / `workspace:*`),
`@repo/api-contract` to its `transpilePackages`, and call the API **from the server** — server
components and server actions — with `API_URL` and `API_SERVICE_TOKEN` read at request time. `apps/app/src/lib/api.ts` and
`apps/app/src/app/notes/` are the working example. Avoid `rewrites()` for this: Next resolves
rewrites at build time, so the API's address would be baked into the build (a Docker build
argument) instead of read from the environment when the container starts.
