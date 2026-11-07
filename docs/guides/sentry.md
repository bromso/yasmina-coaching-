# Forwarding errors to Sentry

`apps/api` is the only thing that talks to a third party: browsers report to their own app, every
Next app's `/api/telemetry` route forwards server-to-server to `apps/api`, and `apps/api` stores
every error and vital in its own tables (`telemetry_errors`, `telemetry_vitals`). Setting
`TELEMETRY_PROVIDER=sentry` on the api additionally forwards each **new** error to Sentry over
plain `fetch` — no `@sentry/*` SDK in this repo, in any app or service.

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | the root `.env` (copy `.env.example`); `docker-compose.yml` passes `TELEMETRY_PROVIDER`, `SENTRY_DSN` and `SENTRY_ENVIRONMENT` to `api` |
| Production | the api service's environment |

## Setup

1. [sentry.io](https://sentry.io) → create a project (platform doesn't matter — the envelope is
   built by hand; pick "Other" or "Node").
2. **Settings → Projects → \<project\> → Client Keys (DSN)** → copy the DSN
   (`https://<publicKey>@<host>/<projectId>`).
3. Set on the api:
   ```
   TELEMETRY_PROVIDER=sentry
   SENTRY_DSN=https://<publicKey>@<host>/<projectId>
   SENTRY_ENVIRONMENT=production   # optional; empty → NODE_ENV
   ```
4. Restart the api. A bad DSN (no public key, no project id, not a URL) fails at startup rather
   than silently dropping events — `loadEnv` in `apps/api/src/env.ts` requires `SENTRY_DSN` whenever
   `TELEMETRY_PROVIDER=sentry`, and `parseDsn` (`apps/api/src/telemetry/sentry.ts`) throws on a
   malformed one.

Switching back to the default (`TELEMETRY_PROVIDER=store`, or unset) stops the forward; nothing
already in `telemetry_errors` is deleted or backfilled.

Each forward is a `telemetry.forward` background job ([background-jobs.md](background-jobs.md)),
queued only when the provider is not `store`. A network error, a timeout, a `5xx` or a `429` makes
the job retry with backoff (5 attempts, then a dead job on `/admin`); any other `4xx` (a wrong key, a
rejected envelope) would only repeat, so it is logged and dropped. The event's `event_id` is derived
from the error row (sha256 of fingerprint and day), so a job delivered twice — the queue is at least
once — reaches Sentry as one event.

## What arrives

One Sentry event **per new fingerprint per UTC day** (`apps/api/src/telemetry/record.ts`): a repeat
of the same app + kind + normalised message + the stack's first `at …` frame (query string and
`:line:col` stripped) on the same day only increments the row's count and never fires again. Each
event carries:

- `tags`: `app`, `kind` (`boundary` | `unhandled` | `server`), `route` (pathname only)
- `exception`: the error type (parsed from the first `…Error` in the stack), the message, and
  **raw stack frames** — function, filename, line, column, parsed straight from the `Error#stack`
  string (`apps/api/src/telemetry/sentry.ts`'s `parseFrames`). There are **no source maps**: a
  minified production bundle's frames point at the built file, not your source.
- `extra`: the error's `digest` (Next's boundary digest, if any) and the UTC `day` the fingerprint
  belongs to
- `environment`: `SENTRY_ENVIRONMENT`, or `NODE_ENV` when unset
- `fingerprint`: the same fingerprint the api groups by, so Sentry's own grouping matches the
  `/admin` **Errors (24 h)** card

## What never arrives

- Web vitals. Only errors are forwarded; CLS/INP/LCP/FCP/TTFB stay in `telemetry_vitals` and never
  leave the api.
- Anything identifying: no ip, no user id, no cookies, no request body. `userAgent` is stored in the
  api's own table when the visitor consented to "all", but the Sentry envelope never includes it.
- Repeats within the same fingerprint-day — only the row's `count` goes up locally; Sentry sees the
  first occurrence only.

## Testing locally without a Sentry account

Run a throwaway listener that prints whatever it receives:

```bash
bun -e 'Bun.serve({ port: 9999, fetch: async (r) => { console.log(await r.text()); return new Response("{}") } })'
```

Point the api at it (a DSN's host/port only need to resolve, not belong to Sentry):

```
TELEMETRY_PROVIDER=sentry
SENTRY_DSN=http://key@localhost:9999/1
```

Restart the api, trigger a new error (a fresh fingerprint — a previously-seen one on the same day
only counts up and does not forward again), and the listener prints the envelope: the three
newline-separated JSON lines (`header`, `item header`, `event`) `buildEnvelope` produces.
