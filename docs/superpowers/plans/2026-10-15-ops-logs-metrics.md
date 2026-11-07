# Operations B1 — logs, request ids, metrics — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One JSON log line per event carrying `service` and `requestId`, one request id followed from a Next app through `apps/api` into its jobs, and a token-protected Prometheus `/metrics` on the api and the worker.

**Architecture:** A new dependency-free package `@repo/log` (logger + `AsyncLocalStorage` request context) used by `apps/api`, its worker, `apps/ai` and the Next servers. The api keeps its internal `log(message, error)` callback type, now backed by `@repo/log`, so the hundreds of existing call sites do not change. A tiny Prometheus registry lives in `@repo/service-kit`. The Next side gets the id from the shared security proxy and forwards it through `@repo/session`'s clients and the few app-owned clients.

**Tech Stack:** Bun 1.4 (`Bun.serve`, `bun test`), Next 16 (proxy, `headers()`), oRPC, `node:async_hooks`.

**Spec:** `docs/superpowers/specs/2026-10-15-operations-design.md` (section B1)

## Global Constraints

- `@repo/log` has no runtime dependency; its root entry is safe to import from Node and Bun server code; `AsyncLocalStorage` lives in the `@repo/log/context` subpath (server-only).
- Log line (json): `{ "time": ISO, "level", "service", "message", "requestId"?, ...fields }`; default format `json` when `NODE_ENV=production`, else `pretty`; `LOG_FORMAT` (`json` | `pretty`) and `LOG_LEVEL` (`debug` | `info` | `warn` | `error`, default `info`) override; an invalid value → the default, plus one warning line.
- Redaction keys (case-insensitive, any depth): `password`, `token`, `secret`, `authorization`, `cookie`, `x-session-token` → `"[redacted]"`; a key named `email` → masked `a***@example.com`.
- Request id: generated = 16 random bytes base64url; accepted incoming = `^[A-Za-z0-9_-]{8,64}$`; api/ai accept `x-request-id` only from a request that passed the service-bearer guard; echoed as the `x-request-id` response header.
- `/metrics`: `METRICS_TOKEN` (optional, ≥ 24 chars, validated in each service's env schema); unset → `404`; wrong/missing bearer → `401`; Prometheus text format 0.0.4 (`content-type: text/plain; version=0.0.4; charset=utf-8`); never rate-limited, never access-logged; labels are bounded (route templates / procedure paths, `"other"` for unknown).
- Migration `0022_jobs_request_id` (nullable `request_id TEXT` on `jobs`) — forward-only, listed in `migrations/index.ts`.
- A new workspace (`packages/log`) must be added to: root `typecheck` and `test:services` lists, `.github/CODEOWNERS` and the bug/feature issue templates' area lists (`scripts/github.test.ts`), `docker-compose.dev.yml` node_modules volume lines (`scripts/docker.test.ts`), `workspace.code-workspace` folders (`scripts/vscode.test.ts`) — run `bun test scripts` to see what fails.
- Biome: double quotes, no semicolons, 2-space, 100 cols; zero warnings. Commit trailer exactly `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; Conventional Commits ≤ 100 chars.
- Implementers never run Playwright or `bun run ci`; the controller does.

## Review Focus

1. A secret reaching a log line through a field the caller did not think of (a nested `headers` object, an `Authorization` key in another case) → redaction is key-based at any depth and case-insensitive (Task 1 tests nested + mixed-case keys).
2. An anonymous caller planting a request id that then appears in operator logs as if trusted → the api accepts `x-request-id` only after the guard (Task 3 tests with and without the bearer).
3. High-cardinality metric labels from raw URLs (`/openapi/admin/users/123`) blowing up a Prometheus server → `route` is a template or procedure path, unknown → `"other"` (Task 5 tests a raw-id path).
4. A request id lost across `await`, a `setTimeout`, or the job boundary → context tests across `await` and a timer (Task 1) and an enqueue→run round trip (Task 4).
5. `/metrics` reachable without a token in a deployment that never set one → unset means 404, not open (Task 5).

---

### Task 1: `@repo/log`

**Files:**
- Create: `packages/log/package.json`, `packages/log/tsconfig.json`, `packages/log/src/index.ts`, `packages/log/src/context.ts`, `packages/log/src/log.test.ts`, `packages/log/README.md`
- Modify: root `package.json` (`typecheck`, `test:services` lists), `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/*` area lists, `docker-compose.dev.yml`, `workspace.code-workspace` (whatever `bun test scripts` requires for a new workspace)

**Interfaces — Produces:**
- `@repo/log`: `type Level = "debug" | "info" | "warn" | "error"`, `type Logger = { debug(m: string, f?: Fields): void; info(...); warn(...); error(...); child(fields: Fields): Logger }`, `createLogger(opts: { service: string; level?: Level; format?: "json" | "pretty"; write?: (line: string, level: Level) => void; env?: Record<string, string | undefined> }): Logger`, `redact(value: unknown): unknown`, `maskEmail(email: string): string`, `newRequestId(): string`, `validRequestId(id: string | null | undefined): string | null`, `REQUEST_ID_HEADER = "x-request-id"`.
- `@repo/log/context`: `withRequestContext<T>(ctx: { requestId: string }, fn: () => T): T`, `currentRequestId(): string | undefined`.
- The logger reads the current request id through an injectable getter so the root entry does not import `node:async_hooks`: `context.ts` registers itself (`setRequestIdGetter(currentRequestId)`) when imported; the root exports `setRequestIdGetter`.

- [ ] **Step 1: Write the failing tests** (`packages/log/src/log.test.ts`):

```ts
import { describe, expect, test } from "bun:test"
import { currentRequestId, withRequestContext } from "./context"
import { createLogger, maskEmail, newRequestId, redact, validRequestId } from "./index"

const capture = (opts: Partial<Parameters<typeof createLogger>[0]> = {}) => {
  const lines: string[] = []
  const log = createLogger({ service: "t", format: "json", write: (l) => lines.push(l), ...opts })
  return { log, lines, json: () => lines.map((l) => JSON.parse(l)) }
}

describe("@repo/log", () => {
  test("json line: time, level, service, message, fields", () => {
    const { log, json } = capture()
    log.info("hello", { a: 1 })
    const [line] = json()
    expect(line).toMatchObject({ level: "info", service: "t", message: "hello", a: 1 })
    expect(new Date(line.time).toString()).not.toBe("Invalid Date")
  })

  test("levels below the threshold are dropped", () => {
    const { log, lines } = capture({ level: "warn" })
    log.info("no")
    log.warn("yes")
    expect(lines).toHaveLength(1)
  })

  test("LOG_LEVEL and LOG_FORMAT from env; an invalid level falls back to info with one warning", () => {
    const { log, json } = capture({ format: undefined, env: { LOG_LEVEL: "loud", LOG_FORMAT: "json" } })
    log.debug("hidden")
    log.info("shown")
    const levels = json().map((l) => l.level)
    expect(levels).toEqual(["warn", "info"])
  })

  test("redaction: any depth, any case; email masked", () => {
    expect(
      redact({ Authorization: "Bearer x", nested: { headers: { "X-Session-Token": "s" } }, email: "ada@example.com", password: "p", ok: 1 })
    ).toEqual({
      Authorization: "[redacted]",
      nested: { headers: { "X-Session-Token": "[redacted]" } },
      email: "a***@example.com",
      password: "[redacted]",
      ok: 1,
    })
    expect(maskEmail("ada@example.com")).toBe("a***@example.com")
  })

  test("an error field is serialised with name, message and stack", () => {
    const { log, json } = capture()
    log.error("boom", { error: new TypeError("bad") })
    expect(json()[0].error).toMatchObject({ name: "TypeError", message: "bad" })
    expect(typeof json()[0].error.stack).toBe("string")
  })

  test("never throws: a circular field logs a fallback line", () => {
    const { log, lines } = capture()
    const a: Record<string, unknown> = {}
    a.self = a
    expect(() => log.info("circular", { a })).not.toThrow()
    expect(lines).toHaveLength(1)
  })

  test("request id from context, across await and a timer; child adds fields", async () => {
    const { log, json } = capture()
    await withRequestContext({ requestId: "req-12345678" }, async () => {
      await Promise.resolve()
      await new Promise((r) => setTimeout(r, 1))
      expect(currentRequestId()).toBe("req-12345678")
      log.child({ job: "mail.send" }).info("in")
    })
    log.info("out")
    expect(json()[0]).toMatchObject({ requestId: "req-12345678", job: "mail.send" })
    expect(json()[1].requestId).toBeUndefined()
  })

  test("request ids: generated 22 chars; incoming validated", () => {
    expect(newRequestId()).toMatch(/^[A-Za-z0-9_-]{22}$/)
    expect(validRequestId("abc-DEF_123")).toBe("abc-DEF_123")
    expect(validRequestId("short")).toBeNull()
    expect(validRequestId("has space in it")).toBeNull()
    expect(validRequestId(null)).toBeNull()
  })

  test("pretty format is one readable line with level and service", () => {
    const { log, lines } = capture({ format: "pretty" })
    log.warn("careful", { n: 2 })
    expect(lines[0]).toContain("WARN")
    expect(lines[0]).toContain("[t]")
    expect(lines[0]).toContain("careful")
    expect(lines[0]).toContain("n=2")
  })
})
```

- [ ] **Step 2: Run to verify it fails** — `cd packages/log && bun test` → FAIL (module not found).

- [ ] **Step 3: Implement** `packages/log/src/index.ts` and `context.ts`. Behaviour exactly as the tests and Global Constraints say. Notes:
  - `write` default: `level === "error" || level === "warn" ? console.error(line) : console.log(line)`.
  - `redact` walks plain objects and arrays (depth cap 8, then `"[depth]"`); `Error` instances become `{ name, message, stack }` before redaction; keys compare lower-cased against the set.
  - `maskEmail`: first character + `***@` + domain; a value without `@` → `"***"`.
  - JSON line: `JSON.stringify({ time, level, service, message, ...(requestId ? { requestId } : {}), ...redact(fields) })` in a try; on failure write `JSON.stringify({ time, level, service, message, logError: "unserialisable fields" })`.
  - pretty: `${time} ${LEVEL.padEnd(5)} [${service}] ${message}` + (`requestId` ? ` (${requestId})` : "") + ` key=value` pairs (values JSON-stringified when not strings); an `error` field appends its stack on the next lines.
  - `context.ts`: `const storage = new AsyncLocalStorage<{ requestId: string }>()`; `withRequestContext = (ctx, fn) => storage.run(ctx, fn)`; `currentRequestId = () => storage.getStore()?.requestId`; on import call `setRequestIdGetter(currentRequestId)`.
  - `package.json`: `"name": "@repo/log"`, `"private": true`, `"type": "module"`, `"exports": { ".": "./src/index.ts", "./context": "./src/context.ts" }`, scripts `test: "bun test"`, `typecheck: "tsc --noEmit"`, devDependencies `@repo/typescript-config: workspace:*`, `@types/bun: catalog:`. Copy `packages/sites`' tsconfig shape.
  - README: what it is, the line format, env vars, redaction, request context, and "never import `@repo/log/context` from client code".

- [ ] **Step 4: Run** `cd packages/log && bun test && bun run typecheck` → PASS. Then `bun test scripts` and fix every new-workspace list it names (CODEOWNERS, issue templates, dev compose volume line, workspace folders). Add `--filter @repo/log` to the root `typecheck` and `test:services` scripts.

- [ ] **Step 5: Commit** `feat(log): a dependency-free structured logger with request context`.

---

### Task 2: A Prometheus registry in `@repo/service-kit`

**Files:** Create `packages/service-kit/src/metrics.ts`, `packages/service-kit/src/metrics.test.ts`; Modify `packages/service-kit/src/index.ts` (export).

**Interfaces — Produces:** `createRegistry(): Registry`; `Registry = { counter(name, help, labelNames?): Counter; gauge(name, help, labelNames?, collect?: () => number | Promise<number> | Array<{ labels: Record<string,string>; value: number }> | Promise<...>): Gauge; histogram(name, help, labelNames?, buckets?): Histogram; render(): Promise<string> }`; `Counter.inc(labels?, by = 1)`, `Gauge.set(labels?, value)`, `Histogram.observe(labels?, seconds)`; `DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]`; `metricsRoute(registry, token: string | undefined): (req: Request) => Promise<Response>` (404 when token unset, 401 on a wrong/missing `authorization: Bearer <token>`, compared in constant time, else 200 with the exposition).

- [ ] **Step 1: Tests** — counters with and without labels render `name{a="x"} 3`; `# HELP` / `# TYPE` lines once per metric; label values escape `\`, `"` and newline; histogram renders cumulative `_bucket{le="…"}` lines including `le="+Inf"`, `_sum`, `_count`; a gauge with `collect` is evaluated on `render()` (and a throwing collector renders nothing for that metric rather than failing the scrape); `metricsRoute` 404 / 401 / 200 and the content type `text/plain; version=0.0.4; charset=utf-8`.
- [ ] **Step 2: Run** `cd packages/service-kit && bun test src/metrics.test.ts` → FAIL.
- [ ] **Step 3: Implement** (no dependency; label sets keyed by a stable JSON of sorted label entries).
- [ ] **Step 4: Run** `bun test` and `bun run typecheck` in `packages/service-kit` → PASS.
- [ ] **Step 5: Commit** `feat(service-kit): a small Prometheus registry and a token-gated metrics route`.

---

### Task 3: apps/api — structured logs, request ids, access log

**Files:** Modify `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/src/worker.ts`, `apps/api/src/env.ts` (`LOG_LEVEL`, `LOG_FORMAT` pass-through — read by `createLogger`'s env), `apps/api/package.json` (`@repo/log: workspace:*`); Create `apps/api/src/request-context.ts`, `apps/api/src/request-context.test.ts`.

**Interfaces:**
- Consumes: `createLogger`, `newRequestId`, `validRequestId`, `REQUEST_ID_HEADER` (Task 1); `withRequestContext` (`@repo/log/context`).
- Produces: `apiLogger` built once per process (`createLogger({ service: "api" })` / `"worker"`); `legacyLog(logger): (message: string, error: unknown) => void` — `error == null ? logger.info(message) : logger.error(message, { error })` — passed wherever `log` was (so every existing call site keeps working); `withRequest(handler, opts: { trusted: (req) => boolean; logger; routeOf: (req) => string; record?: (route, method, status, seconds) => void })` wrapping a `(req, server) => Response` handler: resolves the id (`validRequestId(req.headers.get("x-request-id"))` when `trusted(req)`, else `newRequestId()`), runs the handler inside `withRequestContext`, sets the `x-request-id` response header (cloning the Response if its headers are immutable), logs one `info` access line `{ method, route, status, ms, clientId? }` and calls `record` (Task 5 uses it).
- `trusted(req)` = the request carries `authorization: Bearer <API_SERVICE_TOKEN>` (reuse the guard's comparison helper; do not re-implement token comparison).
- `routeOf(req)`: `/rpc/<procedure path>` and `/openapi/<template>` — for `/rpc/*` use the path after `/rpc/` (procedure paths are bounded); for `/openapi/*` map to `"openapi"` plus the first segment (`/openapi/admin/users/123` → `openapi:admin`) — never raw ids; `/events/workspaces/:workspaceId` → `events`; `/billing/webhook` → `billing.webhook`; anything else `"other"`.
- Wrap `/rpc/*`, `/openapi/*`, `/events/...` and `/billing/webhook` (outermost, so the guard's own 401/429 answers are logged with an id too). `/health`, `/ready`, `/metrics` stay unwrapped. The `error()` handler logs through the logger (the request id is still in context there when Bun calls it from inside a handler — if not, log without).

- [ ] **Step 1: Tests** (`request-context.test.ts`, against `start()` from `test-server.ts` with a capturing `log`/`write`): a protected call without `x-request-id` gets a generated id echoed in the response; with the bearer and a valid `x-request-id: test-req-0001` the same id is echoed; with an invalid one (`"x"`) a new id is generated; a request without the bearer (401) still gets a generated id and never echoes a supplied one; one access line per request with `route`, `status`, `ms` and the id, and none for `/health`; the access line never contains the query string. Check `test-server.ts` for how tests inject a logger; add a `logWrite` option to `ServerOptions` if needed (tests must capture lines without spying on console).
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement.** `index.ts` and `worker.ts`: replace their `console.*` lines (startup, `cannotStart`, warnings) with the process logger (`cannotStart` still exits 1). Keep message texts unchanged where tests or docs quote them (grep the repo for each message before changing it).
- [ ] **Step 4: Run** `cd apps/api && bun test` (full api suite, SQLite) and `bun run typecheck` → PASS.
- [ ] **Step 5: Commit** `feat(api): structured logs, a request id per request and an access log`.

---

### Task 4: Request ids on jobs

**Files:** Create `apps/api/src/migrations/0022_jobs_request_id.ts`; Modify `apps/api/src/migrations/index.ts`, `apps/api/src/queries/jobs.ts` (insert/claim carry `request_id`), `apps/api/src/jobs/enqueue.ts` (store `currentRequestId() ?? null`), `apps/api/src/jobs/worker.ts` (run each job inside `withRequestContext({ requestId: row.request_id ?? newRequestId() })`, logger child with `{ job: row.name, jobId: row.id }`), `apps/api/src/migrate.test.ts` (migration list), tests in `apps/api/src/jobs/*.test.ts`.

- [ ] **Step 1: Tests:** an enqueue inside `withRequestContext({ requestId: "req-abcdefgh" })` stores it; outside a request stores null; the worker runs a job with a stored id inside that context (the job's `run` reads `currentRequestId()`); a job with none gets a fresh valid id; the schedule's enqueues store null. Run on SQLite (and Postgres with `TEST_DATABASE_URL` locally if available).
- [ ] **Step 2–4:** FAIL → implement (migration: `ALTER TABLE jobs ADD COLUMN request_id TEXT`, both dialects) → PASS (`bun test` in apps/api).
- [ ] **Step 5: Commit** `feat(api): jobs carry the request id that enqueued them`.

---

### Task 5: `/metrics` on the api and the worker

**Files:** Create `apps/api/src/metrics.ts`, `apps/api/src/metrics.test.ts`; Modify `apps/api/src/server.ts` (registry, `record` hook from Task 3, `/metrics` route), `apps/api/src/worker.ts` (its own registry + route), `apps/api/src/jobs/worker.ts` (outcome hooks), `apps/api/src/env.ts` (`METRICS_TOKEN: optionalString.pipe(z.string().min(24).optional())`), `packages/service-kit/src/protect.ts` only if a refusal hook is needed (prefer counting in the api's wrapper by status 429).

**Interfaces:** `createApiMetrics({ db, streams, build })` → `{ registry, record(route, method, status, seconds), limiterRefusal(limiter) }`; `createWorkerMetrics({ db })` → `{ registry, jobOutcome(name, outcome, seconds), schedulerLag(seconds) }`. Metric names, labels and buckets exactly as the spec's Metrics section. `build_info{version,commit}`: version from `apps/api/package.json`, commit from `GIT_COMMIT` env or `"unknown"`. `status_class` = `"2xx"` … `"5xx"`.

- [ ] **Step 1: Tests:** `/metrics` 404 with `METRICS_TOKEN` unset; 401 with a wrong token; 200 with the right one, containing `http_requests_total`, `http_request_duration_seconds_bucket`, `process_resident_memory_bytes`, `build_info`; after one `notes.list` call the counter for that procedure and `2xx` is 1; a REST call to `/openapi/admin/users/123` is counted under `openapi:admin`, never the raw id; `/metrics` itself is not counted or access-logged; the worker's `/metrics` shows `jobs_queue{status="queued"}` matching the queue and `job_runs_total{name="…",outcome="succeeded"}` after `drain()`; a job that throws counts `retried`.
- [ ] **Step 2–4:** FAIL → implement → PASS (`bun test`, `bun run typecheck` in apps/api).
- [ ] **Step 5: Commit** `feat(api): Prometheus metrics for the api and the job worker`.

---

### Task 6: apps/ai — logs and request ids

**Files:** Modify `apps/ai/src/log.ts` (keep the `Logger` type and the `ai.usage` event, backed by `@repo/log`), `apps/ai/src/server.ts` (request id + access log for `/chat`, `/rpc/*`, `/openapi/*`, same rules as the api: accept `x-request-id` only after the service-token guard), `apps/ai/package.json`; tests in `apps/ai/src/server.test.ts`.

- [ ] **Step 1: Tests:** response echoes a generated id; a trusted caller's valid id is kept; the `ai.usage` line carries `requestId`; access line per request. 
- [ ] **Step 2–4:** FAIL → implement (reuse a shared `withRequest` if you can move Task 3's helper into `@repo/service-kit` without dragging api specifics — preferred, then the api imports it from there too) → PASS (`bun test`, typecheck in apps/ai and apps/api).
- [ ] **Step 5: Commit** `feat(ai): structured logs and request ids`.

---

### Task 7: The Next side — proxy, clients, server logs

**Files:** Modify `packages/ui/src/lib/security-proxy.ts` (+ its test), `packages/session/src/client.ts` (`requestId?: string` option → `x-request-id` header), `packages/session/src/index.ts` (createAuth's clients and `anonymousApi` read `(await headers()).get("x-request-id")`; the `*FromRequest` helpers read `req.headers`), `packages/session/src/{files,events}.ts`, `packages/telemetry/src/server.ts` (telemetry + analytics routes forward the incoming id), `apps/help/src/lib/api.ts`, `apps/jobs/src/lib/api.ts`, `apps/www/src/lib/actions.ts`, `apps/app/src/lib/chat-proxy.ts` (forward to ai); add `@repo/log` where server code logs (replace `console.error("[session] …")`-style lines in `packages/session`, `packages/telemetry/src/server.ts` and the app server actions with `createLogger({ service: "<app or package>" })` — keep messages).

- [ ] **Step 1: Tests:** the proxy keeps a valid incoming id, replaces an invalid one, sets it on the forwarded request headers and the response; `createApiClient({ requestId })` sends `x-request-id` (assert through an injected `fetch`); a `*FromRequest` helper forwards the request's id; the telemetry route forwards it; help/jobs/www clients' header builders include it (extend their existing header tests).
- [ ] **Step 2–4:** FAIL → implement → PASS: `bun test` + `typecheck` in packages/ui, session, telemetry and apps help, jobs, www, app, auth, account.
- [ ] **Step 5: Commit** `feat(session): carry the request id from every Next app to the api`.

---

### Task 8: End-to-end check and docs

**Files:** Create `apps/e2e/tests/request-id.spec.ts`; Create `docs/guides/operations.md` (logs, request ids, metrics, scrape config, five example alerts — B2 will add backups and runbooks); Modify CLAUDE.md (an **Operations** paragraph under Authentication's topics or a single point: `@repo/log`, request ids, `/metrics`; env rows `LOG_LEVEL`, `LOG_FORMAT`, `METRICS_TOKEN`, `GIT_COMMIT`; the packages list gains `packages/log`; the typecheck/test lists in **Quality gates**), `apps/api/README.md`, `apps/ai/README.md`, `packages/session/README.md`, `.env.example` files, `docs/ROADMAP.md` (tick Phase 9 A "(merged as #88)"; B1 stays unticked).

- [ ] **Step 1:** `request-id.spec.ts` checks what a browser can see: every page response of `www /`, `auth /login` and `app /notes` (signed in) carries an `x-request-id` matching `/^[A-Za-z0-9_-]{22}$/`, and two loads of the same page get different ids.
- [ ] **Step 2:** the docs. Get numbers (test counts) from the controller.
- [ ] **Step 3:** typecheck e2e, `bunx biome ci .`, commit `docs: logs, request ids and metrics`.
