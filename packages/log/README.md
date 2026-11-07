# @repo/log

A dependency-free structured logger, shared by `apps/api`, its worker and `apps/ai`. Two entries:

- `@repo/log` — `createLogger`, `redact`, `maskEmail`, `newRequestId`, `validRequestId`,
  `REQUEST_ID_HEADER`. Safe to import from anywhere (Node, Bun, the browser).
- `@repo/log/context` — `withRequestContext`, `outsideRequestContext`, `currentRequestId`. **Server-only**: it imports
  `node:async_hooks`. Never import this subpath from client code.

## Creating a logger

```ts
import { createLogger } from "@repo/log"

const log = createLogger({ service: "api" })
log.info("listening", { port: 3007 })
log.error("boom", { error: someError })

const jobLog = log.child({ job: "mail.send", jobId })
jobLog.info("sending")
```

## Line format

One JSON object per line, in call order:

```json
{ "time": "2026-10-15T12:00:00.000Z", "level": "info", "service": "api", "message": "listening", "port": 3007 }
```

`time` is an ISO-8601 timestamp. `requestId` is included only when one is in scope (see below).
Every other field passed to `debug`/`info`/`warn`/`error`/`child` is spread in after redaction;
a field named like an envelope key (`time`, `level`, `service`, `message`, or `requestId` when one
is in scope) never replaces it and is written as `field.<key>` instead. An
`Error` (under any key) is serialised as `{ name, message, stack }` plus its own string and number
properties (`code`, `errno`, Postgres's `detail`, …, each through the same redaction rules; object
properties such as headers or bodies are left out) and its `cause`: an `Error` cause serialised the
same way, any other value redacted like a field, the chain cut after 5 links with
`"[cause chain truncated]"`. The pretty format prints the chain on the error's own line
(`error=Error: fetch failed <- Error: connect ECONNREFUSED [ECONNREFUSED]`).

`format: "pretty"` (the default outside production) renders one readable line instead:

```
2026-10-15T12:00:00.000Z WARN  [api] careful (req-abc12345) n=2
```

A logger never throws: unserialisable fields fall back to a line carrying
`logError: "unserialisable fields"` instead of failing the call.

## Env vars

`createLogger` reads `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`) and
`LOG_FORMAT` (`json` | `pretty`) from `opts.env` (default `process.env`) when `opts.level` /
`opts.format` are not given directly. The default format is `json` when `NODE_ENV=production`,
else `pretty`. An invalid `LOG_LEVEL` falls back to `info` and logs one `warn` line naming the bad
value; it never throws.

## Redaction

`redact(value)` walks plain objects, arrays and `Map`s (as objects) at any depth (capped at 8,
deeper values become `"[depth]"`). Keys are matched case-insensitively, anywhere in the key:
`password`, `token`, `secret`, `authorization`, `cookie`, `apikey` / `api_key` / `api-key`, `dsn`,
`credential` and `private_key` / `privatekey` (so `x-session-token`, `RESEND_API_KEY` and
`SENTRY_DSN` all count), plus the bare key `auth`, become `"[redacted]"`. A key ending in `email`
is masked instead (`maskEmail`: `ada@example.com` -> `a***@example.com`), and so is a value holding
an `@` under `to`, `from` or `address` (a string or an array of strings; a port or a version there
is left alone). A `URL` is written as a string without its username and password, and with the
value of any query parameter whose name is sensitive replaced by `[redacted]`. Every logger call
runs its fields through `redact` before writing — a nested `headers` object or a differently-cased
`Authorization` key is still caught.

## Request context

`withRequestContext({ requestId }, fn)` (from `@repo/log/context`, server-only) makes
`currentRequestId()` — and therefore every log line written during `fn`'s async chain, across
`await` and timers — carry that `requestId`. Importing `@repo/log/context` registers it as the
logger's id source; without that import, `createLogger` never adds a `requestId`.
`outsideRequestContext(fn)` is the reverse: `fn` and everything it starts run with no request id,
for background work a request merely triggers (the api's job worker polls through it when an
enqueue nudges it, so the poll chain never carries that request's id).

`newRequestId()` generates a 22-character base64url id (16 random bytes); `validRequestId(id)`
checks an incoming id against `^[A-Za-z0-9_-]{8,64}$`, returning `null` for anything else so an
untrusted caller cannot plant an oddly shaped value into the logs. `REQUEST_ID_HEADER` is the
`x-request-id` header name both directions use.

**Never import `@repo/log/context` from client code** — it pulls in `node:async_hooks`, which has
no browser implementation.
