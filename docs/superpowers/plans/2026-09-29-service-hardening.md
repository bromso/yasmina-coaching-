# Service hardening (Phase 3a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Both Bun services share one safety kit (`@repo/service-kit`): `apps/api` gets a token
guard, rate limit, body cap and generic error handler; both get one error shape, graceful shutdown
and a readiness route; `notes.list` is paginated.

**Architecture:** A new workspace `packages/service-kit` holds the guard, rate limiter, `protect`
wrapper, error-response helper, token resolution and lifecycle (shutdown + readiness). `apps/ai`'s
private copies move into it; `apps/api` adopts it; `apps/app` sends the API token from its
server-only client. Errors everywhere are `ORPCError(...).toJSON()`.

**Tech Stack:** Bun 1.3 (`Bun.serve`, `bun test`), oRPC 1.15, Zod 4, Next.js 16 (App Router).

**Spec:** `docs/superpowers/specs/2026-09-29-service-hardening-design.md`

## Global Constraints

- Error bodies: `{ defined, code, status, message }` built with `new ORPCError(code, …).toJSON()` from `@orpc/server`.
- Message texts kept: `"Unauthorized"` (401, with `www-authenticate: Bearer`), `"Origin not allowed"` (403), `"Too many requests"` (429, with `retry-after`), `"Not found"` (404), `"Internal error"` (500).
- `DEV_API_TOKEN = "dev-only-insecure-api-token"`, exported from `@repo/api-contract`.
- `apps/api` defaults: `API_RATE_LIMIT` 300, `API_RATE_WINDOW_SECONDS` 60, `API_MAX_BODY_BYTES` 262144; `API_ALLOWED_ORIGINS` empty.
- Rate-limit key: `client:<header value trimmed, ≤128 chars>` else `ip:<address>`; header `x-api-client-id` (api) / `x-ai-client-id` (ai).
- `NODE_ENV` defaults to `production` in both services; only development/test get dev tokens and localhost origins.
- Shutdown: drain 8 000 ms (inside Docker's 10 s stop window); `graceMs` default 0.
- `@repo/service-kit` is imported only by `apps/api` and `apps/ai`; the services never import each other; `apps/app` imports only contract packages.
- Deps via `catalog:`; Biome style (double quotes, no semicolons, 2-space, 100 cols) — run `bunx biome check --write <files>` before every commit.
- Commits: Conventional Commits ending with a blank line and `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- The user runs an old `apps/api` dev server on port 3007 (PID 18073); never kill it and never start a second api server on 3007 — tests use port 0.

## Review Focus

1. **A wrong or missing token reaching `apps/app`** must read as "Unauthorized", not "Couldn't reach the API" — the typed client parses the guard's body into an `ORPCError` (verified: `UNAUTHORIZED`/401). Pinned by Task 3's RPC-client 401 test.
2. **A second SIGTERM (or SIGTERM then SIGINT)** must not run cleanup twice or throw on a closed database — Task 2's idempotence test.
3. **`?cursor=abc`, `?cursor=-3`, `?cursor=1.5` or an array** in the notes URL must fall back to the first page, not crash the page — Task 4's `parseCursor` tests.
4. **A request still streaming at shutdown** (a long `/chat` reply) must be cut off after `drainMs`, not hold the process forever — Task 2's cut-off test.
5. **`limit=0`, `limit=101`, `cursor=0`, non-numeric query values on `GET /openapi/notes`** must be a 400 in the shared shape, not a 500 — Task 4's REST bounds test.

## Plan-level rulings (refinements of the spec, recorded here)

- **`graceMs`:** `server.stop()` refuses new connections immediately (verified), so a `/ready` probe
  cannot observe "503 while draining" unless the listener stays up briefly. `createLifecycle` takes
  `graceMs` (default 0): readiness flips first, then after `graceMs` draining starts. Deployments
  behind a load balancer raise it; the README says so.
- **Drain 8 s, not 10 s:** Docker sends SIGKILL 10 s after SIGTERM by default.
- **`createServer` accepts `drainMs`/`graceMs`** so tests can drive shutdown quickly.

---

### Task 1: `@repo/service-kit` — errors, token, guard, rate limit, protect

**Files:**
- Create: `packages/service-kit/package.json`, `packages/service-kit/tsconfig.json`
- Create: `packages/service-kit/src/{index,errors,env,guard,rate-limit,protect}.ts`
- Create: `packages/service-kit/src/{errors,env,guard,rate-limit,protect}.test.ts`
- Modify: `package.json` (root: `typecheck`, `test:services` scripts), `scripts/ci-plan.test.ts`

**Interfaces:**
- Produces:
  - `errorResponse(code: string, options?: { status?: number; message?: string; headers?: HeadersInit }): Response`
  - `type NodeEnv = "development" | "production" | "test"`; `isDevLike(nodeEnv: NodeEnv): boolean`
  - `resolveServiceToken(o: { given: string | undefined; devToken: string; nodeEnv: NodeEnv; name: string }): string`
  - `createGuard(o: { token: string; allowedOrigins: string[]; allowLocalhostOrigins: boolean }): (req: Request) => Response | null`
  - `interface RateLimiter { hit(key: string): RateLimitResult | Promise<RateLimitResult> }`, `type RateLimitResult`, `createMemoryRateLimiter({ limit, windowMs, now? })` (with `size()`)
  - `type ClientAddress = { requestIP(req: Request): { address: string } | null }`
  - `clientKey(header: string): (req: Request, server: ClientAddress) => string`
  - `createProtect(o: { guard; rateLimiter: RateLimiter; keyFor }): (handler: (req: Request) => Response | Promise<Response>) => (req: Request, server: ClientAddress) => Promise<Response>`

- [ ] **Step 1: Package scaffold**

`packages/service-kit/package.json`:

```json
{
  "name": "@repo/service-kit",
  "version": "0.1.0",
  "description": "Guard, rate limit, error shape and lifecycle shared by the Bun services",
  "type": "module",
  "private": true,
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "bun test"
  },
  "dependencies": {
    "@orpc/server": "catalog:"
  },
  "devDependencies": {
    "@orpc/client": "catalog:",
    "@repo/typescript-config": "workspace:*",
    "@types/bun": "catalog:"
  }
}
```

`packages/service-kit/tsconfig.json`:

```json
{
  "extends": "@repo/typescript-config/bun.json",
  "compilerOptions": {
    "types": ["bun"]
  },
  "include": ["src"]
}
```

Root `package.json` scripts — add `--filter @repo/service-kit` to both:

```json
"typecheck": "bun run --filter @repo/app --filter @repo/www --filter @repo/api --filter @repo/api-contract --filter @repo/ai --filter @repo/ai-contract --filter @repo/service-kit typecheck",
"test:services": "bun run --filter @repo/api --filter @repo/ai --filter @repo/app --filter @repo/service-kit test",
```

Run: `bun install` — Expected: exits 0, `bun.lock` gains the workspace.

- [ ] **Step 2: Write the failing tests**

`packages/service-kit/src/errors.test.ts`:

```ts
import { expect, test } from "bun:test"
import { isORPCErrorJson } from "@orpc/client"
import { errorResponse } from "./errors"

test("the body is oRPC's error JSON, which oRPC clients recognize", async () => {
  const res = errorResponse("UNAUTHORIZED", { message: "Unauthorized" })
  expect(res.status).toBe(401)
  const body = await res.json()
  expect(body).toEqual({ defined: false, code: "UNAUTHORIZED", status: 401, message: "Unauthorized" })
  expect(isORPCErrorJson(body)).toBe(true)
})

test("common codes carry their conventional status", () => {
  expect(errorResponse("FORBIDDEN").status).toBe(403)
  expect(errorResponse("NOT_FOUND").status).toBe(404)
  expect(errorResponse("TOO_MANY_REQUESTS").status).toBe(429)
  expect(errorResponse("INTERNAL_SERVER_ERROR").status).toBe(500)
  expect(errorResponse("SERVICE_UNAVAILABLE").status).toBe(503)
})

test("an explicit status and extra headers win", async () => {
  const res = errorResponse("TOO_MANY_REQUESTS", {
    message: "Too many requests",
    headers: { "retry-after": "7" },
  })
  expect(res.headers.get("retry-after")).toBe("7")
  expect(res.headers.get("content-type")).toContain("application/json")
  expect(errorResponse("TEAPOT", { status: 418 }).status).toBe(418)
})
```

`packages/service-kit/src/env.test.ts`:

```ts
import { expect, test } from "bun:test"
import { isDevLike, resolveServiceToken } from "./env"

const base = { devToken: "dev-token", name: "API_SERVICE_TOKEN" }

test("development and test are dev-like; production is not", () => {
  expect(isDevLike("development")).toBe(true)
  expect(isDevLike("test")).toBe(true)
  expect(isDevLike("production")).toBe(false)
})

test("a given token always wins", () => {
  expect(resolveServiceToken({ ...base, given: "real", nodeEnv: "production" })).toBe("real")
  expect(resolveServiceToken({ ...base, given: "real", nodeEnv: "development" })).toBe("real")
})

test("development and test fall back to the dev token", () => {
  expect(resolveServiceToken({ ...base, given: undefined, nodeEnv: "development" })).toBe("dev-token")
  expect(resolveServiceToken({ ...base, given: undefined, nodeEnv: "test" })).toBe("dev-token")
})

test("production without a token refuses, naming the variable", () => {
  expect(() => resolveServiceToken({ ...base, given: undefined, nodeEnv: "production" })).toThrow(
    "API_SERVICE_TOKEN is required in production"
  )
})
```

`packages/service-kit/src/guard.test.ts` — move `apps/ai/src/guard.test.ts` here unchanged except
the import stays `./guard`, and add at the end:

```ts
describe("error shape", () => {
  test("a denied token answers in oRPC's error shape with a Bearer challenge", async () => {
    const res = guard(request({}))
    expect(res?.headers.get("www-authenticate")).toBe("Bearer")
    expect(await res?.json()).toEqual({
      defined: false,
      code: "UNAUTHORIZED",
      status: 401,
      message: "Unauthorized",
    })
  })

  test("a denied origin answers FORBIDDEN", async () => {
    const res = guard(request({ ...auth, origin: "https://evil.example" }))
    expect(await res?.json()).toMatchObject({ code: "FORBIDDEN", message: "Origin not allowed" })
  })
})
```

`packages/service-kit/src/rate-limit.test.ts` — move `apps/ai/src/rate-limit.test.ts` here
unchanged.

`packages/service-kit/src/protect.test.ts`:

```ts
import { expect, test } from "bun:test"
import { clientKey, createProtect } from "./protect"
import type { RateLimiter } from "./rate-limit"

const server = { requestIP: () => ({ address: "10.0.0.1" }) }
const req = (headers: Record<string, string> = {}) =>
  new Request("http://svc.test/rpc/x", { method: "POST", headers })
const ok = () => new Response("handled")

test("clientKey prefers the named header, trimmed and capped, else the IP", () => {
  const key = clientKey("x-api-client-id")
  expect(key(req({ "x-api-client-id": " user-1 " }), server)).toBe("client:user-1")
  expect(key(req({ "x-api-client-id": "   " }), server)).toBe("ip:10.0.0.1")
  expect(key(req({ "x-api-client-id": "x".repeat(500) }), server)).toBe(`client:${"x".repeat(128)}`)
  expect(key(req(), { requestIP: () => null })).toBe("ip:unknown")
})

test("a denied request never reaches the limiter or the handler", async () => {
  const seen: string[] = []
  const limiter: RateLimiter = { hit: (k) => (seen.push(k), { allowed: true }) }
  const protect = createProtect({
    guard: () => new Response("denied", { status: 401 }),
    rateLimiter: limiter,
    keyFor: () => "k",
  })
  const res = await protect(() => {
    throw new Error("handler must not run")
  })(req(), server)
  expect(res.status).toBe(401)
  expect(seen).toEqual([])
})

test("over the limit is TOO_MANY_REQUESTS with Retry-After, and the handler does not run", async () => {
  const protect = createProtect({
    guard: () => null,
    rateLimiter: { hit: () => ({ allowed: false, retryAfterSeconds: 7 }) },
    keyFor: () => "k",
  })
  const res = await protect(() => {
    throw new Error("handler must not run")
  })(req(), server)
  expect(res.status).toBe(429)
  expect(res.headers.get("retry-after")).toBe("7")
  expect(await res.json()).toMatchObject({ code: "TOO_MANY_REQUESTS", message: "Too many requests" })
})

test("allowed requests reach the handler, keyed by keyFor", async () => {
  const seen: string[] = []
  const protect = createProtect({
    guard: () => null,
    rateLimiter: { hit: async (k) => (seen.push(k), { allowed: true }) },
    keyFor: clientKey("x-api-client-id"),
  })
  const res = await protect(ok)(req({ "x-api-client-id": "u1" }), server)
  expect(await res.text()).toBe("handled")
  expect(seen).toEqual(["client:u1"])
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun --filter @repo/service-kit test`
Expected: FAIL — `Cannot find module './errors'` (and the others).

- [ ] **Step 4: Implement**

`packages/service-kit/src/errors.ts`:

```ts
import { ORPCError } from "@orpc/server"

export type ErrorResponseOptions = { status?: number; message?: string; headers?: HeadersInit }

/**
 * An error response in the shape oRPC gives contract errors — `{ defined, code, status, message }`
 * — so a client handles every error from these services one way, and oRPC's own clients turn it
 * into an ORPCError.
 */
export function errorResponse(code: string, options: ErrorResponseOptions = {}): Response {
  const error = new ORPCError(code, { status: options.status, message: options.message })
  return Response.json(error.toJSON(), { status: error.status, headers: options.headers })
}
```

`packages/service-kit/src/env.ts`:

```ts
export type NodeEnv = "development" | "production" | "test"

/** Development and test are the only modes with insecure conveniences (dev tokens, localhost). */
export const isDevLike = (nodeEnv: NodeEnv) => nodeEnv === "development" || nodeEnv === "test"

/**
 * The bearer token a service requires. A given token always wins; development and test fall back
 * to the public dev token; production refuses to start without one (fail closed).
 */
export function resolveServiceToken({
  given,
  devToken,
  nodeEnv,
  name,
}: {
  given: string | undefined
  devToken: string
  nodeEnv: NodeEnv
  name: string
}): string {
  if (given) return given
  if (isDevLike(nodeEnv)) return devToken
  throw new Error(`${name} is required in production`)
}
```

`packages/service-kit/src/guard.ts` — move `apps/ai/src/guard.ts`, replacing its two
`Response.json(...)` denials:

```ts
import { timingSafeEqual } from "node:crypto"
import { errorResponse } from "./errors"

export type GuardOptions = {
  token: string
  allowedOrigins: string[]
  /** Development only: also allow http://localhost:<port> and http://<name>.localhost:<port>. */
  allowLocalhostOrigins: boolean
}

const LOCALHOST_ORIGIN = /^http:\/\/([a-z0-9-]+\.)*localhost(:\d+)?$/

/**
 * Token + origin check for every protected route. Not user auth: it keeps a deployed service from
 * being open to anyone. Returns a response to send, or null when the request may proceed. The
 * token belongs on the server — call the service from your backend, never with the token in
 * browser code.
 */
export function createGuard({ token, allowedOrigins, allowLocalhostOrigins }: GuardOptions) {
  const expected = Buffer.from(token)
  const originAllowed = (origin: string) =>
    allowedOrigins.includes(origin) || (allowLocalhostOrigins && LOCALHOST_ORIGIN.test(origin))

  return (req: Request): Response | null => {
    const match = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") ?? "")
    const given = Buffer.from(match?.[1] ?? "")
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) {
      return errorResponse("UNAUTHORIZED", {
        message: "Unauthorized",
        headers: { "www-authenticate": "Bearer" },
      })
    }

    // No Origin header means a server-to-server call; any present origin must be allowed.
    const origin = req.headers.get("origin")
    if (origin !== null && !originAllowed(origin)) {
      return errorResponse("FORBIDDEN", { message: "Origin not allowed" })
    }

    return null
  }
}
```

`packages/service-kit/src/rate-limit.ts` — move `apps/ai/src/rate-limit.ts` unchanged.

`packages/service-kit/src/protect.ts`:

```ts
import { errorResponse } from "./errors"
import type { RateLimiter } from "./rate-limit"

export type ClientAddress = { requestIP(req: Request): { address: string } | null }
export type Handler = (req: Request) => Response | Promise<Response>
export type ProtectedHandler = (req: Request, server: ClientAddress) => Promise<Response>

const MAX_CLIENT_ID_LENGTH = 128

/**
 * Rate-limit key. Only used after the guard, so the caller holds the token — a trusted backend.
 * Behind that backend every request shares one IP, so it may name the end user in `header`; the
 * prefixes keep a client id from ever colliding with an IP key.
 */
export function clientKey(header: string) {
  return (req: Request, server: ClientAddress): string => {
    const clientId = req.headers.get(header)?.trim().slice(0, MAX_CLIENT_ID_LENGTH)
    if (clientId) return `client:${clientId}`
    return `ip:${server.requestIP(req)?.address ?? "unknown"}`
  }
}

/** Guard, then rate limit, then the handler: every protected route goes through here. */
export function createProtect({
  guard,
  rateLimiter,
  keyFor,
}: {
  guard: (req: Request) => Response | null
  rateLimiter: RateLimiter
  keyFor: (req: Request, server: ClientAddress) => string
}) {
  return (handler: Handler): ProtectedHandler =>
    async (req, server) => {
      const denied = guard(req)
      if (denied) return denied
      const verdict = await rateLimiter.hit(keyFor(req, server))
      if (!verdict.allowed) {
        return errorResponse("TOO_MANY_REQUESTS", {
          message: "Too many requests",
          headers: { "retry-after": String(verdict.retryAfterSeconds) },
        })
      }
      return handler(req)
    }
}
```

`packages/service-kit/src/index.ts`:

```ts
export * from "./env"
export * from "./errors"
export * from "./guard"
export * from "./protect"
export * from "./rate-limit"
```

- [ ] **Step 5: Planner expectations**

In `scripts/ci-plan.test.ts` change the `testGate` assertion to
`expect(ctx.testGate).toEqual(["@repo/api", "@repo/ai", "@repo/app", "@repo/service-kit"])`, and add
inside `describe("workspaces", …)`:

```ts
  test("a service-kit change reaches both services and their images", () => {
    const p = plan(["packages/service-kit/src/guard.ts"], ctx)
    expect(p.affected).toEqual(["@repo/ai", "@repo/api", "@repo/service-kit"])
    expect(p.tests).toEqual(["@repo/api", "@repo/ai", "@repo/service-kit"])
    expect(p.docker.map((r) => r.app).sort()).toEqual(["ai", "api"])
  })
```

- [ ] **Step 6: Run everything**

Run: `bunx biome check --write packages/service-kit scripts package.json && bun --filter @repo/service-kit test && bun --filter @repo/service-kit typecheck && bun test scripts`
Expected: service-kit — errors 3, env 4, guard 12, rate-limit 5, protect 4 = 28 pass; typecheck exit 0; scripts 22 pass.

(`apps/ai` still has its own copies until Task 5 — both pass independently.)

- [ ] **Step 7: Commit**

```bash
git add packages/service-kit package.json bun.lock scripts/ci-plan.test.ts
git commit -m "feat(service-kit): shared guard, rate limit, protect and error shape for the Bun services"
```

---

### Task 2: `@repo/service-kit` — lifecycle and readiness

**Files:**
- Create: `packages/service-kit/src/lifecycle.ts`, `packages/service-kit/src/lifecycle.test.ts`
- Modify: `packages/service-kit/src/index.ts`

**Interfaces:**
- Consumes: `errorResponse` (Task 1).
- Produces:
  - `type Stoppable = { stop(closeActiveConnections?: boolean): Promise<void> }`
  - `type Lifecycle = { ready(): boolean; shutdown(server: Stoppable): Promise<void>; installSignalHandlers(server: Stoppable): void }`
  - `createLifecycle(o: { drainMs: number; graceMs?: number; cleanup?: () => void | Promise<void>; log?: (message: string) => void }): Lifecycle`
  - `readyRoute(lifecycle: Pick<Lifecycle, "ready">, check?: () => unknown): () => Promise<Response>`

- [ ] **Step 1: Write the failing tests**

`packages/service-kit/src/lifecycle.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test"
import { createLifecycle, readyRoute } from "./lifecycle"

const servers: Array<{ stop(force?: boolean): Promise<void> }> = []
afterEach(async () => {
  for (const s of servers.splice(0)) await s.stop(true)
})

/** A real server whose /slow request stays open until `release()` is called. */
function slowServer() {
  let release = () => {}
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/slow"
        ? new Promise<Response>((resolve) => {
            release = () => resolve(new Response("finished"))
          })
        : new Response("fast"),
  })
  servers.push(server)
  return { server, release: () => release() }
}

test("readiness flips first, and cleanup runs once after draining", async () => {
  let cleanups = 0
  const { server } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 1_000, cleanup: () => void cleanups++, log: () => {} })
  expect(lifecycle.ready()).toBe(true)
  const done = lifecycle.shutdown(server)
  expect(lifecycle.ready()).toBe(false)
  await done
  expect(cleanups).toBe(1)
})

test("an in-flight request finishes inside drainMs", async () => {
  const { server, release } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 2_000, log: () => {} })
  const inflight = fetch(new URL("/slow", server.url)).then((r) => r.text())
  await Bun.sleep(50)
  const done = lifecycle.shutdown(server)
  release()
  expect(await inflight).toBe("finished")
  await done
})

test("a request still running after drainMs is cut off", async () => {
  const { server } = slowServer()
  const messages: string[] = []
  const lifecycle = createLifecycle({ drainMs: 100, log: (m) => messages.push(m) })
  const inflight = fetch(new URL("/slow", server.url)).then(
    () => "answered",
    () => "cut off"
  )
  await Bun.sleep(50)
  const started = performance.now()
  await lifecycle.shutdown(server)
  expect(performance.now() - started).toBeLessThan(1_000)
  expect(await inflight).toBe("cut off")
  expect(messages.join(" ")).toContain("cut off")
})

test("a second shutdown is the same shutdown: cleanup still runs once", async () => {
  let cleanups = 0
  const { server } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 500, cleanup: () => void cleanups++, log: () => {} })
  await Promise.all([lifecycle.shutdown(server), lifecycle.shutdown(server)])
  await lifecycle.shutdown(server)
  expect(cleanups).toBe(1)
})

test("graceMs keeps the listener up so a probe sees 503 before draining", async () => {
  const lifecycle = createLifecycle({ drainMs: 500, graceMs: 300, log: () => {} })
  const ready = readyRoute(lifecycle)
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: { "/ready": ready },
    fetch: () => new Response("x"),
  })
  servers.push(server)
  expect((await fetch(new URL("/ready", server.url))).status).toBe(200)
  const done = lifecycle.shutdown(server)
  const during = await fetch(new URL("/ready", server.url))
  expect(during.status).toBe(503)
  expect(await during.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Shutting down" })
  await done
})

test("readyRoute answers 503 when its check fails", async () => {
  const lifecycle = createLifecycle({ drainMs: 100, log: () => {} })
  const ok = await readyRoute(lifecycle, () => undefined)()
  expect(ok.status).toBe(200)
  const failing = await readyRoute(lifecycle, async () => {
    throw new Error("db down")
  })()
  expect(failing.status).toBe(503)
  expect(await failing.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Not ready" })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/service-kit test`
Expected: FAIL — `Cannot find module './lifecycle'`.

- [ ] **Step 3: Implement**

`packages/service-kit/src/lifecycle.ts`:

```ts
import { errorResponse } from "./errors"

export type Stoppable = { stop(closeActiveConnections?: boolean): Promise<void> }

export type Lifecycle = {
  /** False from the moment shutdown starts; `/ready` answers 503 from then on. */
  ready(): boolean
  /** Idempotent: every call returns the same shutdown. */
  shutdown(server: Stoppable): Promise<void>
  /** SIGTERM / SIGINT → shutdown → exit 0. */
  installSignalHandlers(server: Stoppable): void
}

/**
 * Graceful shutdown. Readiness flips first; after `graceMs` (raise it behind a load balancer that
 * polls /ready, so it stops routing here) the server stops accepting connections and in-flight
 * requests get `drainMs` to finish before they are cut off; then `cleanup` runs once.
 */
export function createLifecycle({
  drainMs,
  graceMs = 0,
  cleanup = () => {},
  log = (message: string) => console.info(message),
}: {
  drainMs: number
  graceMs?: number
  cleanup?: () => void | Promise<void>
  log?: (message: string) => void
}): Lifecycle {
  let draining = false
  let done: Promise<void> | undefined

  const shutdown = (server: Stoppable) => {
    done ??= (async () => {
      draining = true
      if (graceMs > 0) await Bun.sleep(graceMs)
      const drained = await Promise.race([
        server.stop().then(() => true),
        Bun.sleep(drainMs).then(() => false),
      ])
      if (!drained) await server.stop(true)
      await cleanup()
      log(
        drained
          ? "shut down after in-flight requests finished"
          : `shut down; cut off requests still running after ${drainMs} ms`
      )
    })()
    return done
  }

  return {
    ready: () => !draining,
    shutdown,
    installSignalHandlers(server) {
      for (const signal of ["SIGTERM", "SIGINT"] as const) {
        process.once(signal, () => {
          void shutdown(server).then(() => process.exit(0))
        })
      }
    },
  }
}

/** A `/ready` handler: 503 while shutting down or when `check` throws, else 200 "OK". */
export function readyRoute(lifecycle: Pick<Lifecycle, "ready">, check?: () => unknown) {
  return async (): Promise<Response> => {
    if (!lifecycle.ready()) {
      return errorResponse("SERVICE_UNAVAILABLE", { message: "Shutting down" })
    }
    try {
      await check?.()
    } catch {
      return errorResponse("SERVICE_UNAVAILABLE", { message: "Not ready" })
    }
    return new Response("OK")
  }
}
```

Add `export * from "./lifecycle"` to `packages/service-kit/src/index.ts` (keep the exports sorted).

- [ ] **Step 4: Run the tests**

Run: `bunx biome check --write packages/service-kit && bun --filter @repo/service-kit test && bun --filter @repo/service-kit typecheck`
Expected: 34 pass, 0 fail; typecheck exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/service-kit
git commit -m "feat(service-kit): graceful shutdown and a readiness route"
```

---

### Task 3: `apps/api` behind the guard; `apps/app` sends the token

**Files:**
- Modify: `packages/api-contract/src/index.ts` (export `DEV_API_TOKEN`); create `packages/api-contract/src/dev.ts`
- Modify: `apps/api/package.json` (add `@repo/service-kit`), `apps/api/src/env.ts`, `apps/api/src/server.ts`, `apps/api/src/index.ts`, `apps/api/src/db.ts` (add `ping`)
- Create: `apps/api/src/env.test.ts`; Modify: `apps/api/src/server.test.ts`
- Modify: `apps/app/src/lib/env.ts`, `apps/app/src/lib/env.test.ts`, `apps/app/src/lib/api.ts`

**Interfaces:**
- Consumes: everything exported by `@repo/service-kit` (Tasks 1–2).
- Produces:
  - `DEV_API_TOKEN` from `@repo/api-contract`
  - `apps/api` `loadEnv(source: Record<string, string | undefined>): Env` with `API_SERVICE_TOKEN: string`, `API_ALLOWED_ORIGINS: string[]`, `API_RATE_LIMIT`, `API_RATE_WINDOW_SECONDS`, `API_MAX_BODY_BYTES` (numbers)
  - `createServer(options: ServerOptions): Promise<{ server; lifecycle: Lifecycle; stop(): Promise<void> }>` where `ServerOptions = { hostname; port; databaseUrl; development?; token: string; allowedOrigins: string[]; allowLocalhostOrigins: boolean; rateLimiter: RateLimiter; maxBodyBytes: number; drainMs?: number; graceMs?: number; log?: (message: string, error: unknown) => void }`
  - `db.ping(): Promise<void>`
  - `apps/app` `AppEnv` gains `API_SERVICE_TOKEN`

- [ ] **Step 1: Contract constant**

`packages/api-contract/src/dev.ts`:

```ts
/**
 * apps/api's public development token. The service accepts it only outside production, and
 * callers default to it in development so `bun dev` needs no setup. Never use it in production.
 */
export const DEV_API_TOKEN = "dev-only-insecure-api-token"
```

In `packages/api-contract/src/index.ts`, next to `export * from "./note"`, add `export * from "./dev"`.
Add `"@repo/service-kit": "workspace:*"` to `apps/api/package.json` `dependencies`, then `bun install`.

- [ ] **Step 2: Write the failing tests**

`apps/api/src/env.test.ts`:

```ts
import { expect, test } from "bun:test"
import { DEV_API_TOKEN } from "@repo/api-contract"
import { loadEnv } from "./env"

test("NODE_ENV defaults to production, which requires a token", () => {
  expect(() => loadEnv({})).toThrow("API_SERVICE_TOKEN is required in production")
})

test("development defaults", () => {
  expect(loadEnv({ NODE_ENV: "development" })).toMatchObject({
    HOST: "api.localhost",
    PORT: 3007,
    DATABASE_URL: "sqlite://.data/api.db",
    API_SERVICE_TOKEN: DEV_API_TOKEN,
    API_ALLOWED_ORIGINS: [],
    API_RATE_LIMIT: 300,
    API_RATE_WINDOW_SECONDS: 60,
    API_MAX_BODY_BYTES: 262_144,
  })
})

test("a blank token counts as missing", () => {
  expect(() => loadEnv({ NODE_ENV: "production", API_SERVICE_TOKEN: "" })).toThrow(
    "API_SERVICE_TOKEN is required in production"
  )
})

test("API_ALLOWED_ORIGINS is a trimmed comma-separated list", () => {
  const env = loadEnv({
    NODE_ENV: "production",
    API_SERVICE_TOKEN: "t",
    API_ALLOWED_ORIGINS: " https://a.example , https://b.example,",
  })
  expect(env.API_ALLOWED_ORIGINS).toEqual(["https://a.example", "https://b.example"])
})
```

Replace the top of `apps/api/src/server.test.ts` (imports through the `url` helper) with:

```ts
import { afterAll, beforeAll, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient, Note } from "@repo/api-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { createServer } from "./server"

const TOKEN = "test-token"
const auth = { authorization: `Bearer ${TOKEN}` }

// A real Bun.serve on an ephemeral port with an in-memory database: every test goes over HTTP.
let app: Awaited<ReturnType<typeof createServer>>
let client: ApiClient

function start(overrides: Partial<Parameters<typeof createServer>[0]> = {}) {
  return createServer({
    hostname: "127.0.0.1",
    port: 0,
    databaseUrl: "sqlite://:memory:",
    token: TOKEN,
    allowedOrigins: ["https://app.example.com"],
    allowLocalhostOrigins: false,
    rateLimiter: createMemoryRateLimiter({ limit: 1_000, windowMs: 60_000 }),
    maxBodyBytes: 262_144,
    drainMs: 500,
    log: () => {},
    ...overrides,
  })
}

beforeAll(async () => {
  app = await start()
  client = createORPCClient(new RPCLink({ url: new URL("/rpc", app.server.url).href, headers: auth }))
})

afterAll(() => app.stop())

const url = (path: string) => new URL(path, app.server.url)
```

In the rest of the file:
- `"unknown paths are JSON 404s"` asserts
  `expect(await res.json()).toEqual({ defined: false, code: "NOT_FOUND", status: 404, message: "Not found" })`.
- The REST tests send `headers: { ...auth, "content-type": "application/json" }` on the POST and
  `{ headers: auth }` on the GET.

Append:

```ts
describe("protection", () => {
  test("RPC without the token is UNAUTHORIZED, surfaced by the typed client", async () => {
    const anonymous: ApiClient = createORPCClient(
      new RPCLink({ url: new URL("/rpc", app.server.url).href })
    )
    const { error } = await safe(anonymous.notes.find({ id: 1 }))
    expect(error).toMatchObject({ code: "UNAUTHORIZED", status: 401 })
  })

  test("REST with a wrong token is 401 in the shared shape", async () => {
    const res = await fetch(url("/openapi/notes"), { headers: { authorization: "Bearer nope" } })
    expect(res.status).toBe(401)
    expect(res.headers.get("www-authenticate")).toBe("Bearer")
    expect(await res.json()).toMatchObject({ code: "UNAUTHORIZED", message: "Unauthorized" })
  })

  test("a foreign Origin is FORBIDDEN", async () => {
    const res = await fetch(url("/openapi/notes"), {
      headers: { ...auth, origin: "https://evil.example" },
    })
    expect(res.status).toBe(403)
  })

  test("docs and spec stay open", async () => {
    expect((await fetch(url("/openapi"))).status).toBe(200)
    expect((await fetch(url("/openapi/spec.json"))).status).toBe(200)
  })

  test("over the limit is 429 with Retry-After", async () => {
    const limited = await start({
      rateLimiter: createMemoryRateLimiter({ limit: 1, windowMs: 60_000 }),
    })
    try {
      const get = () =>
        fetch(new URL("/openapi/notes/1", limited.server.url), { headers: auth })
      await (await get()).text()
      const res = await get()
      expect(res.status).toBe(429)
      expect(Number(res.headers.get("retry-after"))).toBeGreaterThan(0)
      expect(await res.json()).toMatchObject({ code: "TOO_MANY_REQUESTS" })
    } finally {
      await limited.stop()
    }
  })

  test("a body over the cap is refused before any handler runs", async () => {
    const small = await start({ maxBodyBytes: 1_024 })
    try {
      const res = await fetch(new URL("/openapi/notes", small.server.url), {
        method: "POST",
        headers: { ...auth, "content-type": "application/json" },
        body: JSON.stringify({ title: "big", body: "x".repeat(5_000) }),
      })
      expect(res.status).toBe(413)
    } finally {
      await small.stop()
    }
  })

  test("x-api-client-id keys the rate limit per client", async () => {
    const keys: string[] = []
    const keyed = await start({ rateLimiter: { hit: (k) => (keys.push(k), { allowed: true }) } })
    try {
      await (
        await fetch(new URL("/openapi/notes/1", keyed.server.url), {
          headers: { ...auth, "x-api-client-id": "user-7" },
        })
      ).text()
      expect(keys).toEqual(["client:user-7"])
    } finally {
      await keyed.stop()
    }
  })
})

describe("lifecycle", () => {
  test("/ready answers OK, then 503 once shutdown starts", async () => {
    const own = await start({ graceMs: 300 })
    const ready = () => fetch(new URL("/ready", own.server.url))
    expect(await (await ready()).text()).toBe("OK")
    const done = own.lifecycle.shutdown(own.server)
    const during = await ready()
    expect(during.status).toBe(503)
    expect(await during.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE" })
    await done
  })
})
```

- [ ] **Step 3: Run them to verify they fail**

Run: `bun --filter @repo/api test`
Expected: FAIL — `loadEnv` not exported / `createServer` does not accept `token`.

- [ ] **Step 4: Implement `apps/api`**

`apps/api/src/env.ts`:

```ts
import { DEV_API_TOKEN } from "@repo/api-contract"
import { resolveServiceToken } from "@repo/service-kit"
import { z } from "zod"

// Blank values in .env files arrive as "" — treat them as unset.
const optionalString = z
  .string()
  .optional()
  .transform((value) => value || undefined)

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

const EnvSchema = z.object({
  // Bun never sets NODE_ENV, so an unset value must fail closed: `bun dev` opts into development.
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  HOST: z.string().default("api.localhost"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3007),
  // Bun.sql reads the adapter from the URL: sqlite:// is the tested one (see the README).
  DATABASE_URL: z.string().default("sqlite://.data/api.db"),
  API_SERVICE_TOKEN: optionalString,
  API_ALLOWED_ORIGINS: csv,
  API_RATE_LIMIT: z.coerce.number().int().positive().default(300),
  API_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  API_MAX_BODY_BYTES: z.coerce.number().int().positive().default(262_144),
})

export type Env = Omit<z.infer<typeof EnvSchema>, "API_SERVICE_TOKEN"> & {
  API_SERVICE_TOKEN: string
}

/** Parses and validates configuration. Bun loads .env files into Bun.env on its own. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const env = EnvSchema.parse(source)
  const token = resolveServiceToken({
    given: env.API_SERVICE_TOKEN,
    devToken: DEV_API_TOKEN,
    nodeEnv: env.NODE_ENV,
    name: "API_SERVICE_TOKEN",
  })
  return { ...env, API_SERVICE_TOKEN: token }
}
```

In `apps/api/src/db.ts`, add beside `close`:

```ts
    /** Readiness probe: throws when the database does not answer. */
    async ping() {
      await sql`SELECT 1`
    },
```

`apps/api/src/server.ts`:

```ts
import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ORPCError, onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import {
  clientKey,
  createGuard,
  createLifecycle,
  createProtect,
  errorResponse,
  type RateLimiter,
  readyRoute,
} from "@repo/service-kit"
import { createDb } from "./db"
import { type Context, router } from "./router"

export type ServerOptions = {
  hostname: string
  port: number
  databaseUrl: string
  development?: boolean
  token: string
  allowedOrigins: string[]
  allowLocalhostOrigins: boolean
  rateLimiter: RateLimiter
  maxBodyBytes: number
  /** How long in-flight requests get to finish on shutdown (Docker kills after 10 s). */
  drainMs?: number
  /** How long /ready answers 503 before the listener closes (raise behind a load balancer). */
  graceMs?: number
  log?: (message: string, error: unknown) => void
}

const notFound = () => errorResponse("NOT_FOUND", { message: "Not found" })

export async function createServer(options: ServerOptions) {
  const log = options.log ?? ((message, error) => console.error(`[api] ${message}`, error))
  const db = createDb(options.databaseUrl)
  await db.migrate()

  // Client errors (NOT_FOUND, BAD_REQUEST, …) are part of the contract; log only real failures.
  const logUnexpected = (error: unknown) => {
    if (!(error instanceof ORPCError) || error.status >= 500) log("rpc failed", error)
  }

  // Typed RPC transport for first-party clients (@orpc/client + the contract).
  const rpc = new RPCHandler(router, { interceptors: [onError(logUnexpected)] })

  // The same router as plain REST, plus a generated OpenAPI spec and Scalar docs at /openapi.
  const openapi = new OpenAPIHandler(router, {
    interceptors: [onError(logUnexpected)],
    plugins: [
      new OpenAPIReferencePlugin({
        docsProvider: "scalar",
        docsTitle: "API reference",
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: { info: { title: "API", version: "0.1.0" } },
      }),
    ],
  })

  const handle = async (
    handler: RPCHandler<Context> | OpenAPIHandler<Context>,
    prefix: `/${string}`,
    req: Request
  ) => {
    const { matched, response } = await handler.handle(req, { prefix, context: { db } })
    return matched ? response : notFound()
  }

  const protect = createProtect({
    guard: createGuard(options),
    rateLimiter: options.rateLimiter,
    keyFor: clientKey("x-api-client-id"),
  })

  const lifecycle = createLifecycle({
    drainMs: options.drainMs ?? 8_000,
    graceMs: options.graceMs,
    cleanup: () => db.close(),
  })

  const server = Bun.serve({
    hostname: options.hostname,
    port: options.port,
    development: options.development,
    // Bun rejects larger bodies with 413 before any parsing.
    maxRequestBodySize: options.maxBodyBytes,
    routes: {
      // Liveness: a static response Bun dispatches without running JS.
      "/health": new Response("OK"),
      // Readiness: the database answers and the server is not shutting down.
      "/ready": readyRoute(lifecycle, () => db.ping()),
      "/rpc/*": protect((req) => handle(rpc, "/rpc", req)),
      // Docs and spec are open; every REST procedure under /openapi/* is protected.
      "/openapi": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/spec.json": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/*": protect((req) => handle(openapi, "/openapi", req)),
    },
    fetch: notFound,
    // Anything that throws past the handlers: log it, never show Bun's error page or a stack.
    error(error) {
      log("unhandled", error)
      return errorResponse("INTERNAL_SERVER_ERROR", { message: "Internal error" })
    },
  })

  return { server, lifecycle, stop: () => lifecycle.shutdown(server) }
}
```

`apps/api/src/index.ts`:

```ts
import { DEV_API_TOKEN } from "@repo/api-contract"
import { createMemoryRateLimiter, isDevLike } from "@repo/service-kit"
import { loadEnv } from "./env"
import { createServer } from "./server"

let env: ReturnType<typeof loadEnv>
try {
  env = loadEnv(Bun.env)
} catch (error) {
  console.error(`[api] cannot start: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const { server, lifecycle } = await createServer({
  hostname: env.HOST,
  port: env.PORT,
  databaseUrl: env.DATABASE_URL,
  development: env.NODE_ENV === "development",
  token: env.API_SERVICE_TOKEN,
  allowedOrigins: env.API_ALLOWED_ORIGINS,
  allowLocalhostOrigins: isDevLike(env.NODE_ENV),
  rateLimiter: createMemoryRateLimiter({
    limit: env.API_RATE_LIMIT,
    windowMs: env.API_RATE_WINDOW_SECONDS * 1000,
  }),
  maxBodyBytes: env.API_MAX_BODY_BYTES,
})
lifecycle.installSignalHandlers(server)

if (env.API_SERVICE_TOKEN === DEV_API_TOKEN) {
  console.warn(
    `⚠ Using the public development token "${DEV_API_TOKEN}" — anyone can call this service. ` +
      "Set API_SERVICE_TOKEN before exposing it."
  )
}

console.info(`API ready on ${server.url} — docs at ${new URL("/openapi", server.url)}`)
```

- [ ] **Step 5: `apps/app` sends the token**

`apps/app/src/lib/env.ts`: add `API_SERVICE_TOKEN: string` to `AppEnv`, `API_SERVICE_TOKEN: DEV_API_TOKEN`
to `DEV_DEFAULTS`, and `import { DEV_API_TOKEN } from "@repo/api-contract"`; update the docstring to
"Service URLs and tokens".

`apps/app/src/lib/env.test.ts`: add `"API_SERVICE_TOKEN"` to `ALL`, `API_SERVICE_TOKEN: "api-secret"`
to `PRODUCTION`, `API_SERVICE_TOKEN: DEV_API_TOKEN` to the development expectation (import it from
`@repo/api-contract`), and `API_SERVICE_TOKEN: "api-secret"` to the "set values win" expectation.

`apps/app/src/lib/api.ts`, inside `api()`:

```ts
  if (!client) {
    const { API_URL, API_SERVICE_TOKEN } = loadEnv(["API_URL", "API_SERVICE_TOKEN"])
    client = createORPCClient<ApiClient>(
      new RPCLink({
        url: `${API_URL}/rpc`,
        // Server-only module: the token never reaches the browser.
        headers: { authorization: `Bearer ${API_SERVICE_TOKEN}` },
        fetch: (request, init) =>
          fetch(request, {
            ...init,
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
          }),
      })
    )
  }
  return client
```

(replacing the `client ??= …` expression; the docstring becomes "created on first use so
`next build` never needs API_URL or API_SERVICE_TOKEN").

- [ ] **Step 6: Run the tests**

Run: `bunx biome check --write apps/api apps/app/src packages/api-contract && bun --filter @repo/api test && bun --filter @repo/app test && bun --filter @repo/api --filter @repo/api-contract --filter @repo/app typecheck`
Expected: api 19 pass (env 4, server: existing 7 + protection 7 + lifecycle 1); app 36 pass (one more env test: `production requires API_SERVICE_TOKEN`); typechecks exit 0.

- [ ] **Step 7: Commit**

```bash
git add packages/api-contract apps/api apps/app/src/lib bun.lock
git commit -m "feat(api): service token, rate limit, body cap, readiness and graceful shutdown"
```

---

### Task 4: Paginated `notes.list`

**Files:**
- Modify: `packages/api-contract/src/note.ts`, `packages/api-contract/src/index.ts`
- Modify: `apps/api/src/db.ts`, `apps/api/src/router.ts`, `apps/api/src/server.test.ts`
- Create: `apps/app/src/lib/pagination.ts`, `apps/app/src/lib/pagination.test.ts`
- Modify: `apps/app/src/app/notes/page.tsx`, `apps/app/src/views/notes-view.tsx`

**Interfaces:**
- Consumes: Task 3's authenticated client and test harness.
- Produces: `ListNotesSchema`, `NotePageSchema`, `type NotePage = { items: Note[]; nextCursor: number | null }`, `DEFAULT_PAGE_SIZE = 20`; `db.notes.list({ cursor?: number; limit: number }): Promise<NotePage>`; `parseCursor(value: string | string[] | undefined): number | undefined`.

- [ ] **Step 1: Write the failing tests**

`apps/app/src/lib/pagination.test.ts`:

```ts
import { expect, test } from "bun:test"
import { parseCursor } from "./pagination"

test("a positive integer is a cursor", () => {
  expect(parseCursor("42")).toBe(42)
})

test("anything else means the first page", () => {
  for (const value of [undefined, "", "abc", "0", "-3", "1.5", "1e3x", ["4", "5"]]) {
    expect(parseCursor(value)).toBeUndefined()
  }
})
```

Append to `apps/api/src/server.test.ts`:

```ts
describe("pagination", () => {
  test("pages newest first with a cursor until nextCursor is null", async () => {
    const paged = await start()
    try {
      const c: ApiClient = createORPCClient(
        new RPCLink({ url: new URL("/rpc", paged.server.url).href, headers: auth })
      )
      for (let i = 1; i <= 5; i++) await c.notes.create({ title: `n${i}` })

      const first = await c.notes.list({ limit: 2 })
      expect(first.items.map((n) => n.title)).toEqual(["n5", "n4"])
      expect(first.nextCursor).toBe(first.items[1]?.id ?? null)

      const second = await c.notes.list({ limit: 2, cursor: first.nextCursor ?? undefined })
      expect(second.items.map((n) => n.title)).toEqual(["n3", "n2"])

      const last = await c.notes.list({ limit: 2, cursor: second.nextCursor ?? undefined })
      expect(last.items.map((n) => n.title)).toEqual(["n1"])
      expect(last.nextCursor).toBeNull()

      const beyond = await c.notes.list({ cursor: 1 })
      expect(beyond).toEqual({ items: [], nextCursor: null })

      expect((await c.notes.list()).items).toHaveLength(5)
    } finally {
      await paged.stop()
    }
  })

  test("REST query bounds are a 400 in the shared shape", async () => {
    for (const query of ["limit=0", "limit=101", "cursor=0", "cursor=abc", "limit=2.5"]) {
      const res = await fetch(url(`/openapi/notes?${query}`), { headers: auth })
      expect(res.status).toBe(400)
      expect(await res.json()).toMatchObject({ code: "BAD_REQUEST" })
    }
    const ok = await fetch(url("/openapi/notes?limit=1"), { headers: auth })
    expect(ok.status).toBe(200)
    expect(await ok.json()).toMatchObject({ items: expect.any(Array) })
  })
})
```

And in the existing `"creates, finds and lists notes"` test replace
`expect(await client.notes.list()).toContainEqual(created)` with
`expect((await client.notes.list()).items).toContainEqual(created)`.

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/api test && bun --filter @repo/app test`
Expected: FAIL — `items` undefined on the list result; `Cannot find module './pagination'`.

- [ ] **Step 3: Implement**

Append to `packages/api-contract/src/note.ts`:

```ts
export const DEFAULT_PAGE_SIZE = 20

// Query-string friendly: REST sends strings, so both fields coerce; either may be omitted.
export const ListNotesSchema = z
  .object({
    cursor: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
  })
  .optional()

export const NotePageSchema = z.object({
  items: z.array(NoteSchema),
  nextCursor: z.number().int().positive().nullable(),
})

export type ListNotes = z.input<typeof ListNotesSchema>
export type NotePage = z.infer<typeof NotePageSchema>
```

In `packages/api-contract/src/index.ts`, import `ListNotesSchema` and `NotePageSchema` alongside the
existing schemas and change `list`:

```ts
    list: oc
      .route({ method: "GET", path: "/notes", summary: "List notes, newest first" })
      .input(ListNotesSchema)
      .output(NotePageSchema),
```

In `apps/api/src/db.ts`, import `type NotePage` from `@repo/api-contract` and replace `list`:

```ts
      /** Keyset pagination on id: one row past `limit` tells whether another page exists. */
      async list({ cursor, limit }: { cursor?: number; limit: number }): Promise<NotePage> {
        const rows: NoteRow[] =
          cursor === undefined
            ? await sql`SELECT * FROM notes ORDER BY id DESC LIMIT ${limit + 1}`
            : await sql`SELECT * FROM notes WHERE id < ${cursor} ORDER BY id DESC LIMIT ${limit + 1}`
        const items = rows.slice(0, limit).map(toNote)
        const nextCursor = rows.length > limit ? (items.at(-1)?.id ?? null) : null
        return { items, nextCursor }
      },
```

In `apps/api/src/router.ts`, import `DEFAULT_PAGE_SIZE` from `@repo/api-contract` and:

```ts
    list: api.notes.list.handler(({ input, context }) =>
      context.db.notes.list({ cursor: input?.cursor, limit: input?.limit ?? DEFAULT_PAGE_SIZE })
    ),
```

`apps/app/src/lib/pagination.ts`:

```ts
/** `?cursor=` from the URL: a positive integer, or undefined (the first page) for anything else. */
export function parseCursor(value: string | string[] | undefined): number | undefined {
  if (typeof value !== "string" || !/^\d+$/.test(value)) return undefined
  const cursor = Number(value)
  return cursor > 0 ? cursor : undefined
}
```

`apps/app/src/app/notes/page.tsx`:

```tsx
import type { Metadata } from "next"
import { connection } from "next/server"
import { api, describeApiError } from "@/lib/api"
import { parseCursor } from "@/lib/pagination"
import { NotesView } from "@/views/notes-view"

export const metadata: Metadata = { title: "Notes" }

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // Live data on every request — and it keeps `next build`, which has no API to call, from
  // trying to prerender this page.
  await connection()
  const cursor = parseCursor((await searchParams).cursor)
  try {
    return <NotesView page={await api().notes.list({ cursor })} cursor={cursor} />
  } catch (error) {
    console.error("[app] notes.list failed", error)
    return <NotesView error={describeApiError(error)} />
  }
}
```

`apps/app/src/views/notes-view.tsx`: change the props and add the pager (the `NoteList` body is
unchanged):

```tsx
import type { Note, NotePage } from "@repo/api-contract"
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import Link from "next/link"
import { NoteForm } from "@/components/note-form"

type NotesViewProps = { page: NotePage; cursor?: number } | { error: string }

// … NoteList unchanged …

/** Plain links: paging works without client JavaScript. */
function Pager({ page, cursor }: { page: NotePage; cursor?: number }) {
  if (cursor === undefined && page.nextCursor === null) return null
  return (
    <nav aria-label="Notes pages" className="flex justify-between gap-4">
      {cursor !== undefined ? (
        <Button asChild variant="outline">
          <Link href="/notes">Newest</Link>
        </Button>
      ) : (
        <span />
      )}
      {page.nextCursor !== null && (
        <Button asChild variant="outline">
          <Link href={`/notes?cursor=${page.nextCursor}`}>Older notes</Link>
        </Button>
      )}
    </nav>
  )
}
```

and in `NotesView`, replace `<NoteList notes={props.notes} />` with:

```tsx
        <>
          <NoteList notes={props.page.items} />
          <Pager page={props.page} cursor={props.cursor} />
        </>
```

- [ ] **Step 4: Run the tests and the build**

Run: `bunx biome check --write packages/api-contract apps/api apps/app/src && bun --filter @repo/api test && bun --filter @repo/app test && bun --filter @repo/api --filter @repo/api-contract --filter @repo/app typecheck && bun --filter @repo/app build`
Expected: api 21 pass; app 38 pass; typechecks exit 0; the build lists `ƒ /notes`.

- [ ] **Step 5: Commit**

```bash
git add packages/api-contract apps/api apps/app/src
git commit -m "feat(api): paginate notes.list with a keyset cursor; the notes page pages through it"
```

---

### Task 5: `apps/ai` on the kit

**Files:**
- Delete: `apps/ai/src/guard.ts`, `apps/ai/src/guard.test.ts`, `apps/ai/src/rate-limit.ts`, `apps/ai/src/rate-limit.test.ts`
- Modify: `apps/ai/package.json` (add `@repo/service-kit`), `apps/ai/src/env.ts`, `apps/ai/src/server.ts`, `apps/ai/src/index.ts`, `apps/ai/src/chat.ts`
- Modify: `apps/ai/src/server.test.ts`, `apps/ai/src/summarize.test.ts` (imports)

**Interfaces:**
- Consumes: `@repo/service-kit` (Tasks 1–2).
- Produces: `createServer(options)` now also accepts `drainMs?` / `graceMs?` and returns `{ server, lifecycle, stop }`.

- [ ] **Step 1: Write the failing tests**

In `apps/ai/src/server.test.ts`, change `import { createMemoryRateLimiter } from "./rate-limit"` to
`import { createMemoryRateLimiter } from "@repo/service-kit"` (same in `summarize.test.ts`), then:

- `"an unhandled failure is a generic 500…"`: assert
  `expect(JSON.parse(raw)).toEqual({ defined: false, code: "INTERNAL_SERVER_ERROR", status: 500, message: "Internal error" })`.
- `"unknown paths are JSON 404s"`: assert
  `expect(await res.json()).toEqual({ defined: false, code: "NOT_FOUND", status: 404, message: "Not found" })`.
- In the `chat request validation` loop, after `expect(res.status).toBe(400)`, add
  `expect(await res.json()).toMatchObject({ defined: false, code: "BAD_REQUEST", status: 400 })`.

Append:

```ts
describe("lifecycle", () => {
  test("/ready answers OK, then 503 once shutdown starts", async () => {
    const app = createServer({
      hostname: "127.0.0.1",
      port: 0,
      model: textModel("hi"),
      modelId: "mock:test",
      token: TOKEN,
      allowedOrigins: [],
      allowLocalhostOrigins: false,
      limits,
      rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
      log: { usage: () => {}, error: () => {} },
      drainMs: 500,
      graceMs: 300,
    })
    const ready = () => fetch(new URL("/ready", app.server.url))
    expect(await (await ready()).text()).toBe("OK")
    const done = app.lifecycle.shutdown(app.server)
    expect((await ready()).status).toBe(503)
    await done
  })
})

test("a denied token answers in the shared error shape", async () => {
  const { url } = start(textModel("hi"))
  const res = await fetch(url("/chat"), { method: "POST", body: "{}" })
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({
    defined: false,
    code: "UNAUTHORIZED",
    status: 401,
    message: "Unauthorized",
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/ai test`
Expected: FAIL — the 404/500/400 bodies lack `code`; `/ready` is a 404; `createServer` has no `lifecycle`.

- [ ] **Step 3: Implement**

Add `"@repo/service-kit": "workspace:*"` to `apps/ai/package.json` `dependencies`; `bun install`.
Delete `apps/ai/src/guard.ts`, `guard.test.ts`, `rate-limit.ts`, `rate-limit.test.ts`.

`apps/ai/src/env.ts`: delete the local `isDevLike`; import `isDevLike, resolveServiceToken` from
`@repo/service-kit`; re-export `isDevLike` (`export { DEV_TOKEN, isDevLike }`); `loadEnv` becomes:

```ts
export function loadEnv(source: Record<string, string | undefined>): Env {
  const env = EnvSchema.parse(source)
  const token = resolveServiceToken({
    given: env.AI_SERVICE_TOKEN,
    devToken: DEV_TOKEN,
    nodeEnv: env.NODE_ENV,
    name: "AI_SERVICE_TOKEN",
  })
  return { ...env, AI_SERVICE_TOKEN: token }
}
```

`apps/ai/src/chat.ts`: `import { errorResponse } from "@repo/service-kit"` and

```ts
const badRequest = (message: string) => errorResponse("BAD_REQUEST", { message })
```

`apps/ai/src/server.ts`:
- imports: drop `./guard` and `./rate-limit`; add
  `import { clientKey, createGuard, createLifecycle, createProtect, errorResponse, type RateLimiter, readyRoute } from "@repo/service-kit"`.
- `ServerOptions` gains `drainMs?: number` and `graceMs?: number` (same doc comments as `apps/api`).
- Delete `ClientAddress`, `MAX_CLIENT_ID_LENGTH`, `rateLimitKey` and the local `protect`; replace with:

```ts
  const protect = createProtect({
    guard: createGuard(options),
    rateLimiter: options.rateLimiter,
    keyFor: clientKey("x-ai-client-id"),
  })
  const lifecycle = createLifecycle({ drainMs: options.drainMs ?? 8_000, graceMs: options.graceMs })
```

- `notFound` becomes `() => errorResponse("NOT_FOUND", { message: "Not found" })`.
- routes gain `"/ready": readyRoute(lifecycle),` after `/health`.
- `error(error)` returns `errorResponse("INTERNAL_SERVER_ERROR", { message: "Internal error" })`.
- return `{ server, lifecycle, stop: () => lifecycle.shutdown(server) }`.

`apps/ai/src/index.ts`: import `createMemoryRateLimiter` from `@repo/service-kit` (drop
`./rate-limit`), take `{ server, lifecycle }` from `createServer`, and add
`lifecycle.installSignalHandlers(server)` right after it.

- [ ] **Step 4: Run the tests**

Run: `bunx biome check --write apps/ai && bun --filter @repo/ai test && bun --filter @repo/ai typecheck && bun --filter @repo/app test`
Expected: ai — 70 − 15 moved (guard 10, rate-limit 5) + 2 new = 57 pass, 0 fail; typecheck exit 0;
app 38 pass (its chat proxy reads `message`, still present).

- [ ] **Step 5: Commit**

```bash
git add apps/ai bun.lock
git commit -m "refactor(ai): use service-kit — one error shape, readiness and graceful shutdown"
```

---

### Task 6: Docker, configuration, docs, and the real run

**Files:**
- Modify: `docker/bun-service.Dockerfile`, `docker-compose.yml`, `.env.example`
- Modify: `apps/api/.env.example`, `apps/app/.env.example`, `apps/api/README.md`, `README.md`, `CLAUDE.md`, `docs/ROADMAP.md`

- [ ] **Step 1: Docker and Compose**

`docker/bun-service.Dockerfile`: in the `HEALTHCHECK` command replace `/health` with `/ready`, and
above it add `# /ready, not /health: healthy means "the database answers", so Compose's service_healthy waits for it.`

`docker-compose.yml`:
- `api`: `restart: on-failure:3` (was `unless-stopped`) with the comment
  `# Fails closed: without API_SERVICE_TOKEN the container exits at startup.`, and
  `API_SERVICE_TOKEN: ${API_SERVICE_TOKEN:-}` in its `environment`.
- `app`: add `API_SERVICE_TOKEN: ${API_SERVICE_TOKEN:-}` to its `environment`.

`.env.example` (root), before the `apps/ai` block:

```bash
# ----- apps/api (service :3007) -----
# Bearer token callers (apps/app) must send. Required: without it the api container exits at
# startup. apps/app reads the same value.
API_SERVICE_TOKEN=
```

Run: `docker compose config -q` — Expected: exit 0.

- [ ] **Step 2: Env templates and docs**

`apps/api/.env.example` — add after `DATABASE_URL`:

```bash
# Bearer token callers must send. Development/test default: dev-only-insecure-api-token.
# Required in production — the service refuses to start without it.
# API_SERVICE_TOKEN=

# Comma-separated exact origins allowed, for callers that send an Origin header.
# API_ALLOWED_ORIGINS=

# Requests per window per client (x-api-client-id, else IP), and the window length.
# API_RATE_LIMIT=300
# API_RATE_WINDOW_SECONDS=60

# Largest request body accepted; Bun answers 413 above it before any parsing.
# API_MAX_BODY_BYTES=262144
```

`apps/app/.env.example` — add after `API_URL`:

```bash
# apps/api's bearer token (the value apps/api reads). Defaults to its public development token
# outside production. Server-side only: never prefix it with NEXT_PUBLIC_.
API_SERVICE_TOKEN=
```

`apps/api/README.md`: routes table gains `/ready` (database answers; 503 while shutting down) and
marks `/rpc/*` and REST procedures as protected (bearer token, rate limit, 256 KiB body cap); add a
short **Errors** paragraph (every error body is `{ defined, code, status, message }`, the shape oRPC
clients parse) and a **Shutdown** paragraph (SIGTERM drains in-flight requests for up to 8 s;
`graceMs` exists for deployments behind a load balancer that polls `/ready`). Update the
"Calling it from a Next app" section to show the `authorization` header on `RPCLink`.

`README.md` Docker section: "The `api` and `ai` containers need `API_SERVICE_TOKEN` and
`AI_SERVICE_TOKEN` (and `ANTHROPIC_API_KEY`, unless `AI_MODEL=mock:echo`) in a root `.env` — copy
`.env.example`."

`CLAUDE.md`: in **Packages** add
`- \`packages/service-kit\` — guard, rate limiter, error shape, graceful shutdown and readiness shared by \`apps/api\` and \`apps/ai\` (Bun-only; the Next apps never import it)`;
in the Quality gates sentence listing the typecheck set add `service-kit`, and in the
`test:services` parenthesis add `packages/service-kit`; in **Adding an API endpoint** step 3 add
"(tests send the bearer token — see the `auth` helper in `server.test.ts`)".

`docs/ROADMAP.md`: under Phase 3 tick
"`apps/api`: request guard, rate limit, body-size cap and a generic `error()` handler, like `apps/ai`",
"Graceful shutdown (SIGTERM) and a readiness check that touches the database / provider"
(append "— the ai readiness check deliberately does not call the provider"), and
"`notes.list` pagination; one error shape across both services".

- [ ] **Step 3: Real run — `bun dev`**

The user's own `apps/api` dev server (PID 18073, started before this work, `bun --hot` without
`NODE_ENV`) will hot-reload these changes and exit at startup: it runs in production mode and now
needs `API_SERVICE_TOKEN`. That is the fail-closed behavior working; do not restart it. Confirm with
`lsof -ti :3007` whether the port is free, and report what happened to PID 18073.

With port 3007 free, run in the background: `bun --filter @repo/api --filter @repo/ai --filter @repo/app dev`.
Then:
1. `curl -s http://api.localhost:3007/ready` → `OK`. <!-- gitleaks:allow -->
2. `curl -s -o /dev/null -w '%{http_code}' http://api.localhost:3007/openapi/notes` → `401`.
3. `curl -s http://api.localhost:3007/openapi/notes -H 'authorization: Bearer dev-only-insecure-api-token'` → JSON with `items` and `nextCursor`.
4. In a browser (chrome-devtools MCP) at `http://app.localhost:3001/notes`: the page loads; add
   notes until more than 20 exist (or run the create curl in a loop), confirm "Older notes" appears,
   follow it, then "Newest" brings the first page back; `?cursor=abc` shows the first page.
5. `kill -TERM <api dev pid>` — the api log shows "shut down after in-flight requests finished".

Stop every process you started.

- [ ] **Step 4: Real run — Docker Compose**

Run: `API_SERVICE_TOKEN=local-api AI_SERVICE_TOKEN=local-ai AI_MODEL=mock:echo docker compose -f docker-compose.yml -f <scratch override resetting api's published ports> up -d --build app api ai`
(host :3007 may still be taken — the override is `services: { api: { ports: !reset [] } }`, kept
outside the repo). Wait for all three `healthy` (api/ai now via `/ready`). Then:
1. `curl -s http://localhost:3001/notes | grep -c "Notes are unavailable"` → `0`.
2. `docker compose stop api` → `docker compose logs api` ends with the drained-shutdown line.
3. Without `API_SERVICE_TOKEN`: `docker compose up -d api` → the container exits with
   `API_SERVICE_TOKEN is required in production` (restart `on-failure:3`).
Then `docker compose down` (no `-v`).

- [ ] **Step 5: Full gate**

Run: `bun run ci`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add docker docker-compose.yml .env.example apps/api/.env.example apps/app/.env.example apps/api/README.md README.md CLAUDE.md docs/ROADMAP.md
git commit -m "feat(docker): api needs its token and reports readiness; document the service kit"
```
