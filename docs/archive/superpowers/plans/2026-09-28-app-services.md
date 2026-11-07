# apps/app ↔ apps/api + apps/ai Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `apps/app` gets a notes page backed by `apps/api` and a chat page backed by `apps/ai`, as
the reference example for calling both services from a Next app.

**Architecture:** Notes are server-first: a server component and a server action call `apps/api`
with the typed oRPC `ApiClient`, reading `API_URL` at runtime. Chat goes browser → an `apps/app`
route handler (`/api/chat`) → `apps/ai` `/chat`; the route holds the service token and sits
behind a fail-closed `requireUser()` seam. Pure logic (env loading, the auth seam, form
validation, the chat proxy) lives in `src/lib/` and is unit-tested with `bun test`.

**Tech Stack:** Next.js 16 (App Router, React 19 `useActionState`), oRPC 1.15 (`@orpc/client`),
AI SDK 7 (`ai`, `@ai-sdk/react` 4), Zod 4, Bun 1.3 test runner, Docker Compose.

**Spec:** `docs/superpowers/specs/2026-09-28-app-services-design.md`

## Global Constraints

- `apps/app` imports only `@repo/api-contract` and `@repo/ai-contract` — never `apps/api` or `apps/ai`.
- Shared deps use `catalog:`; `server-only` is local to `apps/app` with a literal range (one workspace).
- `@types/bun` is declared in `apps/app` via `catalog:` (it backs `bun:test` imports in the app's own files).
- Code style: Biome — double quotes, no semicolons, 2-space indent, 100-char lines. Run `bunx biome check --write <files>` on every file you touch before committing.
- Only `NODE_ENV=production` is strict; development and test get the dev defaults.
- Dev defaults: `API_URL=http://api.localhost:3007`, `AI_SERVICE_URL=http://ai.localhost:3008`, `AI_SERVICE_TOKEN=DEV_TOKEN` (`"dev-only-insecure-token"`).
- The AI service token and upstream error details never reach the browser.
- Commits: Conventional Commits, ending with `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- `bun run ci` must stay green at the end.

## Review Focus

1. **`next build` with no API running** must succeed — the notes page must not prerender (Task 5, Step 7).
2. **Production builds must keep server error logs** — `compiler.removeConsole` strips every `console.*` unless `error`/`warn` are excluded (Task 2, Step 3; verified in Task 6, Step 5).
3. **The chat proxy must not forward `content-encoding` / `content-length`** from upstream (fetch already decoded the body, so they would corrupt or truncate the stream) while keeping `content-type` and `x-vercel-ai-ui-message-stream` (Task 3 test).
4. **A whitespace-only title or an over-long body** is rejected with a readable message and the typed values are kept (Task 5 `parseNoteForm` tests).
5. **A hung API** (a container still starting) must not hold the notes page open indefinitely — calls time out after 5 s and show the inline error (Task 5 `api.ts`; verified in Task 6, Step 3).

---

## File map

| File | Task | Responsibility |
|---|---|---|
| `packages/ai-contract/src/dev.ts` | 1 | `DEV_TOKEN` constant |
| `apps/ai/src/env.ts` | 1 | imports `DEV_TOKEN` from the contract |
| `apps/app/package.json`, `next.config.mjs`, `.gitignore`, `.env.example` | 2 | deps, `transpilePackages`, logging, env template, `test` script |
| `package.json` (root), `scripts/ci-plan.test.ts` | 2 | `@repo/app` joins `test:services` |
| `apps/app/src/lib/env.ts` (+ test) | 2 | `loadEnv(keys, source)`, `MissingEnvError` |
| `apps/app/src/lib/auth.ts` (+ test) | 2 | `requireUser(req, nodeEnv)` seam |
| `apps/app/src/lib/chat-proxy.ts` (+ test) | 3 | `createChatProxy(deps)` → route handler |
| `apps/app/src/app/api/chat/route.ts` | 3 | wires the proxy |
| `apps/app/src/views/chat-view.tsx`, `src/app/chat/page.tsx` | 4 | chat UI |
| `apps/app/src/views/home-view.tsx` | 4 | links to `/notes` and `/chat` |
| `apps/app/src/lib/note-form.ts` (+ test) | 5 | `parseNoteForm`, `NoteFormState` |
| `apps/app/src/lib/api.ts` | 5 | server-only `api()` client, `describeApiError` |
| `apps/app/src/app/notes/actions.ts`, `page.tsx`, `src/views/notes-view.tsx`, `src/components/note-form.tsx` | 5 | notes UI |
| `docker-compose.yml`, `docker-compose.dev.yml`, `apps/api/README.md`, `apps/ai/README.md`, `CLAUDE.md`, `.github/workflows/ci.yml` | 6 | networking + docs, real-run verification |

---

### Task 1: Move `DEV_TOKEN` into `@repo/ai-contract`

**Files:**
- Create: `packages/ai-contract/src/dev.ts`
- Modify: `packages/ai-contract/src/index.ts` (add an export line)
- Modify: `apps/ai/src/env.ts:1-3`

**Interfaces:**
- Produces: `import { DEV_TOKEN } from "@repo/ai-contract"` — `const DEV_TOKEN: "dev-only-insecure-token"`. `apps/ai/src/env.ts` keeps re-exporting `DEV_TOKEN`, so `apps/ai/src/index.ts` and `config.test.ts` are unchanged.

- [ ] **Step 1: Create the constant**

`packages/ai-contract/src/dev.ts`:

```ts
/**
 * The AI service's public development token. apps/ai accepts it only outside production, and
 * callers default to it in development so `bun dev` needs no setup. Never use it in production.
 */
export const DEV_TOKEN = "dev-only-insecure-token"
```

- [ ] **Step 2: Export it**

In `packages/ai-contract/src/index.ts`, next to the other `export *` lines:

```ts
export * from "./chat"
export * from "./dev"
export * from "./summarize"
```

- [ ] **Step 3: Use it in apps/ai**

In `apps/ai/src/env.ts`, replace `export const DEV_TOKEN = "dev-only-insecure-token"` with:

```ts
import { DEV_TOKEN } from "@repo/ai-contract"
import { z } from "zod"

export { DEV_TOKEN }
```

(`import { z } from "zod"` is already the first line — keep a single copy of it.)

- [ ] **Step 4: Verify nothing changed for apps/ai**

Run: `bunx biome check --write packages/ai-contract apps/ai/src/env.ts && bun --filter @repo/ai test && bun --filter @repo/ai --filter @repo/ai-contract typecheck`
Expected: 66 pass, 0 fail; both typechecks exit 0.

- [ ] **Step 5: Commit**

```bash
git add packages/ai-contract/src/dev.ts packages/ai-contract/src/index.ts apps/ai/src/env.ts
git commit -m "refactor(ai-contract): export DEV_TOKEN for callers of apps/ai"
```

---

### Task 2: apps/app setup, `loadEnv` and the `requireUser` seam

**Files:**
- Modify: `apps/app/package.json`, `apps/app/next.config.mjs`, `apps/app/.gitignore`
- Create: `apps/app/.env.example`
- Modify: `package.json` (root) `test:services`; `scripts/ci-plan.test.ts`
- Create: `apps/app/src/lib/env.ts`, `apps/app/src/lib/env.test.ts`
- Create: `apps/app/src/lib/auth.ts`, `apps/app/src/lib/auth.test.ts`

**Interfaces:**
- Consumes: `DEV_TOKEN` from `@repo/ai-contract` (Task 1).
- Produces:
  - `type AppEnv = { API_URL: string; AI_SERVICE_URL: string; AI_SERVICE_TOKEN: string }`
  - `class MissingEnvError extends Error { readonly variable: keyof AppEnv }` — message `"<VAR> is not set"`
  - `loadEnv<K extends keyof AppEnv>(keys: readonly K[], source?: Record<string, string | undefined>): Pick<AppEnv, K>`
  - `type User = { id: string }`
  - `requireUser(req: Request, nodeEnv?: string): Promise<User | null>`

- [ ] **Step 1: Dependencies and scripts**

In `apps/app/package.json`:
- add to `"scripts"`: `"test": "bun test",`
- add to `"dependencies"` (keep alphabetical order):

```json
"@ai-sdk/react": "catalog:",
"@orpc/client": "catalog:",
"@repo/ai-contract": "workspace:*",
"@repo/api-contract": "workspace:*",
"ai": "catalog:",
"server-only": "^0.0.1",
"zod": "catalog:",
```

- add to `"devDependencies"`: `"@types/bun": "catalog:",`

In the root `package.json`, change `test:services` to:

```json
"test:services": "bun run --filter @repo/api --filter @repo/ai --filter @repo/app test",
```

Run: `bun install`
Expected: exits 0; `bun.lock` changes.

- [ ] **Step 2: Update the CI planner's expectations**

`@repo/app` now depends on both contracts and is in the test gate. In `scripts/ci-plan.test.ts`:

```ts
  test("a contract change reaches the service that implements it", () => {
    const p = plan(["packages/ai-contract/src/index.ts"], ctx)
    expect(p.affected).toEqual(["@repo/ai", "@repo/app", "@repo/ai-contract"])
    expect(p.tests).toEqual(["@repo/ai", "@repo/app"])
    expect(p.docker.map((r) => r.app)).toEqual(["ai"])
  })
```

In the `packages/ui` test replace `expect(p.tests).toEqual([])` with `expect(p.tests).toEqual(["@repo/app"])`.
In the last test replace the `testGate` line with `expect(ctx.testGate).toEqual(["@repo/api", "@repo/ai", "@repo/app"])`.

Run: `bun test scripts`
Expected: 18 pass, 0 fail.

- [ ] **Step 3: Next config**

In `apps/app/next.config.mjs`:

```js
  transpilePackages: ["@repo/ui", "@repo/api-contract", "@repo/ai-contract"],
```

and replace the `compiler` block with:

```js
  // Compiler optimizations. Keep console.error/warn: route handlers and server actions log
  // failures that never reach the browser, and stripping them would leave no trace.
  compiler: {
    removeConsole: process.env.NODE_ENV === "production" ? { exclude: ["error", "warn"] } : false,
  },
```

- [ ] **Step 4: Env template**

In `apps/app/.gitignore`, directly under the `.env*` line, add:

```
!.env.example
```

Create `apps/app/.env.example`:

```bash
# apps/app → the backend services. Every value is optional in development (`bun dev`), which
# falls back to the defaults below; production (`next build` / `next start`) requires all three.

# apps/api — defaults to http://api.localhost:3007. Docker Compose: http://api:3007
API_URL=

# apps/ai — defaults to http://ai.localhost:3008. Docker Compose: http://ai:3008
AI_SERVICE_URL=

# The same value apps/ai reads. Defaults to its public development token outside production.
# Server-side only: never prefix it with NEXT_PUBLIC_.
AI_SERVICE_TOKEN=
```

- [ ] **Step 5: Write the failing env tests**

`apps/app/src/lib/env.test.ts`:

```ts
import { expect, test } from "bun:test"
import { DEV_TOKEN } from "@repo/ai-contract"
import { loadEnv, MissingEnvError } from "./env"

const ALL = ["API_URL", "AI_SERVICE_URL", "AI_SERVICE_TOKEN"] as const
const PRODUCTION = {
  NODE_ENV: "production",
  API_URL: "http://api:3007",
  AI_SERVICE_URL: "http://ai:3008",
  AI_SERVICE_TOKEN: "secret",
}

test("development falls back to the local dev services", () => {
  expect(loadEnv(ALL, { NODE_ENV: "development" })).toEqual({
    API_URL: "http://api.localhost:3007",
    AI_SERVICE_URL: "http://ai.localhost:3008",
    AI_SERVICE_TOKEN: DEV_TOKEN,
  })
})

test("test mode also gets the defaults", () => {
  expect(loadEnv(["API_URL"], { NODE_ENV: "test" }).API_URL).toBe("http://api.localhost:3007")
})

test("set values win; URLs lose a trailing slash, the token is kept verbatim", () => {
  const env = loadEnv(ALL, { ...PRODUCTION, API_URL: "http://api:3007/", AI_SERVICE_TOKEN: "t/" })
  expect(env).toEqual({
    API_URL: "http://api:3007",
    AI_SERVICE_URL: "http://ai:3008",
    AI_SERVICE_TOKEN: "t/",
  })
})

for (const key of ALL) {
  test(`production requires ${key}`, () => {
    const source = { ...PRODUCTION, [key]: undefined }
    expect(() => loadEnv(ALL, source)).toThrow(`${key} is not set`)
  })
}

test("a blank value counts as missing", () => {
  expect(() => loadEnv(["API_URL"], { NODE_ENV: "production", API_URL: "  " })).toThrow(
    MissingEnvError
  )
})

test("only the requested keys are required", () => {
  expect(loadEnv(["API_URL"], { NODE_ENV: "production", API_URL: "http://api:3007" })).toEqual({
    API_URL: "http://api:3007",
  })
})
```

- [ ] **Step 6: Run it to verify it fails**

Run: `bun --filter @repo/app test`
Expected: FAIL — `Cannot find module './env'`.

- [ ] **Step 7: Implement `env.ts`**

`apps/app/src/lib/env.ts`:

```ts
import { DEV_TOKEN } from "@repo/ai-contract"

export type AppEnv = {
  API_URL: string
  AI_SERVICE_URL: string
  AI_SERVICE_TOKEN: string
}

const DEV_DEFAULTS: AppEnv = {
  API_URL: "http://api.localhost:3007",
  AI_SERVICE_URL: "http://ai.localhost:3008",
  AI_SERVICE_TOKEN: DEV_TOKEN,
}

/** A required variable is missing in production. The message names it. */
export class MissingEnvError extends Error {
  constructor(readonly variable: keyof AppEnv) {
    super(`${variable} is not set`)
    this.name = "MissingEnvError"
  }
}

/**
 * Service URLs and the AI token, read when a request needs them rather than at import, because
 * `next build` imports these modules with none of them set. Outside production each falls back
 * to its dev default; production requires the keys asked for, and only those.
 */
export function loadEnv<K extends keyof AppEnv>(
  keys: readonly K[],
  source: Record<string, string | undefined> = process.env
): Pick<AppEnv, K> {
  const production = source.NODE_ENV === "production"
  const result: Partial<Record<keyof AppEnv, string>> = {}
  for (const key of keys) {
    const value = source[key]?.trim() || (production ? undefined : DEV_DEFAULTS[key])
    if (!value) throw new MissingEnvError(key)
    result[key] = key.endsWith("_URL") ? value.replace(/\/+$/, "") : value
  }
  return result as Pick<AppEnv, K>
}
```

- [ ] **Step 8: Write the failing auth tests**

`apps/app/src/lib/auth.test.ts`:

```ts
import { expect, test } from "bun:test"
import { requireUser } from "./auth"

const req = new Request("http://app.test/api/chat")

test("outside production there is a fixed dev user", async () => {
  for (const nodeEnv of ["development", "test", undefined]) {
    expect(await requireUser(req, nodeEnv)).toEqual({ id: "dev-user" })
  }
})

test("production has no user until real auth replaces the seam", async () => {
  expect(await requireUser(req, "production")).toBeNull()
})
```

- [ ] **Step 9: Implement `auth.ts`**

`apps/app/src/lib/auth.ts`:

```ts
export type User = { id: string }

/**
 * The auth seam: replace the body with a real session lookup when auth exists. Until then there
 * is a fixed user outside production and nobody in production, so a deploy of this app can never
 * become an open proxy to the AI service.
 */
export async function requireUser(
  _req: Request,
  nodeEnv: string | undefined = process.env.NODE_ENV
): Promise<User | null> {
  return nodeEnv === "production" ? null : { id: "dev-user" }
}
```

- [ ] **Step 10: Run the tests and the typecheck**

Run: `bunx biome check --write apps/app package.json scripts && bun --filter @repo/app test && bun --filter @repo/app typecheck`
Expected: 10 pass, 0 fail; typecheck exits 0.

If the typecheck reports conflicts between `@types/bun` and the DOM/Node types (duplicate `fetch`,
`Request` or `Response` declarations), remove `"@types/bun"` from `apps/app/package.json`, run
`bun install`, and add `"src/**/*.test.ts"` to the `exclude` array in `apps/app/tsconfig.json`
(the tests still run under `bun test`; only `tsc` skips them). Re-run the typecheck.

- [ ] **Step 11: Commit**

```bash
git add apps/app package.json bun.lock scripts/ci-plan.test.ts
git commit -m "feat(app): env loading and a fail-closed auth seam for the service calls"
```

---

### Task 3: Chat proxy route

**Files:**
- Create: `apps/app/src/lib/chat-proxy.ts`, `apps/app/src/lib/chat-proxy.test.ts`
- Create: `apps/app/src/app/api/chat/route.ts`

**Interfaces:**
- Consumes: `User`, `requireUser` (Task 2); `AppEnv`, `MissingEnvError`, `loadEnv` (Task 2).
- Produces: `createChatProxy(deps: ChatProxyDeps): (req: Request) => Promise<Response>` where
  `ChatProxyDeps = { requireUser: (req: Request) => Promise<User | null>; env: () => Pick<AppEnv, "AI_SERVICE_URL" | "AI_SERVICE_TOKEN">; log?: (message: string, error: unknown) => void }`.
  Error responses are JSON `{ message: string }`; the 401 message is `"Sign-in isn't set up yet"`.

- [ ] **Step 1: Write the failing tests**

`apps/app/src/lib/chat-proxy.test.ts`:

```ts
import { afterEach, expect, test } from "bun:test"
import { type ChatProxyDeps, createChatProxy } from "./chat-proxy"
import { MissingEnvError } from "./env"

type Seen = { headers: Headers; body: string }
const servers: Array<{ stop: (force?: boolean) => unknown }> = []
afterEach(() => {
  for (const server of servers.splice(0)) server.stop(true)
})

/** A stand-in for apps/ai: records what it receives and answers with `respond`. */
function fakeAi(respond: (req: Request) => Response) {
  const seen: Seen[] = []
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(req) {
      seen.push({ headers: req.headers, body: await req.clone().text() })
      return respond(req)
    },
  })
  servers.push(server)
  return { url: server.url.origin, seen }
}

const logs: unknown[] = []
function proxy(url: string, overrides: Partial<ChatProxyDeps> = {}) {
  return createChatProxy({
    requireUser: async () => ({ id: "user-1" }),
    env: () => ({ AI_SERVICE_URL: url, AI_SERVICE_TOKEN: "secret-token" }),
    log: (_message, error) => logs.push(error),
    ...overrides,
  })
}

const BODY = JSON.stringify({ messages: [{ id: "1", role: "user", parts: [] }] })
const chatRequest = (signal?: AbortSignal) =>
  new Request("http://app.test/api/chat", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: BODY,
    signal,
  })

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs
  while (!condition()) {
    if (Date.now() > deadline) throw new Error("condition not met in time")
    await Bun.sleep(10)
  }
}

test("forwards the token, the user id and the body, and streams the reply back", async () => {
  const sse = 'data: {"type":"start"}\n\ndata: [DONE]\n\n'
  const ai = fakeAi(
    () =>
      new Response(sse, {
        headers: { "content-type": "text/event-stream", "x-vercel-ai-ui-message-stream": "v1" },
      })
  )
  const res = await proxy(ai.url)(chatRequest())

  expect(ai.seen[0]?.headers.get("authorization")).toBe("Bearer secret-token")
  expect(ai.seen[0]?.headers.get("x-ai-client-id")).toBe("user-1")
  expect(ai.seen[0]?.body).toBe(BODY)
  expect(res.status).toBe(200)
  expect(res.headers.get("content-type")).toBe("text/event-stream")
  expect(res.headers.get("x-vercel-ai-ui-message-stream")).toBe("v1")
  expect(await res.text()).toBe(sse)
})

test("drops encoding and length headers that no longer describe the body", async () => {
  const ai = fakeAi(() => new Response("ok", { headers: { "content-encoding": "identity" } }))
  const res = await proxy(ai.url)(chatRequest())
  expect(res.headers.get("content-encoding")).toBeNull()
  expect(res.headers.get("content-length")).toBeNull()
  expect(await res.text()).toBe("ok")
})

test("no user is 401 and the AI service is never called", async () => {
  const ai = fakeAi(() => new Response("unreachable"))
  const res = await proxy(ai.url, { requireUser: async () => null })(chatRequest())
  expect(res.status).toBe(401)
  expect(await res.json()).toEqual({ message: "Sign-in isn't set up yet" })
  expect(ai.seen).toHaveLength(0)
})

test("the AI service's own errors pass through, Retry-After included", async () => {
  const ai = fakeAi(() =>
    Response.json({ message: "Too many requests" }, { status: 429, headers: { "retry-after": "7" } })
  )
  const res = await proxy(ai.url)(chatRequest())
  expect(res.status).toBe(429)
  expect(res.headers.get("retry-after")).toBe("7")
  expect(await res.json()).toEqual({ message: "Too many requests" })
})

test("an unreachable AI service is a generic 502; the details stay in the log", async () => {
  const gone = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() })
  const url = gone.url.origin
  gone.stop(true)
  logs.length = 0

  const res = await proxy(url)(chatRequest())
  expect(res.status).toBe(502)
  const text = await res.text()
  expect(JSON.parse(text)).toEqual({ message: "AI service unavailable" })
  expect(text).not.toContain("127.0.0.1")
  expect(logs).toHaveLength(1)
})

test("missing configuration is 503", async () => {
  const res = await proxy("http://unused", {
    env: () => {
      throw new MissingEnvError("AI_SERVICE_TOKEN")
    },
  })(chatRequest())
  expect(res.status).toBe(503)
  expect(await res.json()).toEqual({ message: "Chat is not configured" })
})

test("a browser disconnect cancels the call to the AI service", async () => {
  let upstreamAborted = false
  const ai = fakeAi((req) => {
    req.signal.addEventListener("abort", () => {
      upstreamAborted = true
    })
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("data: thinking\n\n"))
        },
      }),
      { headers: { "content-type": "text/event-stream" } }
    )
  })
  const controller = new AbortController()
  const res = await proxy(ai.url)(chatRequest(controller.signal))
  await res.body?.getReader().read()
  controller.abort()
  await waitFor(() => upstreamAborted)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/app test`
Expected: FAIL — `Cannot find module './chat-proxy'`.

- [ ] **Step 3: Implement the proxy**

`apps/app/src/lib/chat-proxy.ts`:

```ts
import type { User } from "./auth"
import { type AppEnv, MissingEnvError } from "./env"

export type ChatProxyDeps = {
  requireUser: (req: Request) => Promise<User | null>
  env: () => Pick<AppEnv, "AI_SERVICE_URL" | "AI_SERVICE_TOKEN">
  log?: (message: string, error: unknown) => void
}

// fetch has already decoded the upstream body, so these would describe bytes the browser never
// receives; hop-by-hop headers never belong on a proxied response.
const DROPPED_HEADERS = ["content-encoding", "content-length", "transfer-encoding", "connection"]

const json = (status: number, message: string) => Response.json({ message }, { status })

/**
 * The trust boundary between the browser and apps/ai: it authenticates the caller, adds the
 * service token (which never leaves the server) and keys the AI service's rate limit per user.
 */
export function createChatProxy({ requireUser, env, log = console.error }: ChatProxyDeps) {
  return async (req: Request): Promise<Response> => {
    const user = await requireUser(req)
    if (!user) return json(401, "Sign-in isn't set up yet")

    let config: ReturnType<ChatProxyDeps["env"]>
    try {
      config = env()
    } catch (error) {
      if (!(error instanceof MissingEnvError)) throw error
      log("chat proxy is not configured", error)
      return json(503, "Chat is not configured")
    }

    let upstream: Response
    try {
      upstream = await fetch(`${config.AI_SERVICE_URL}/chat`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.AI_SERVICE_TOKEN}`,
          "content-type": "application/json",
          "x-ai-client-id": user.id,
        },
        body: await req.text(),
        // Bun and Next abort req.signal when the browser disconnects; passing it on cancels the
        // model call instead of paying for a reply nobody reads.
        signal: req.signal,
      })
    } catch (error) {
      if (req.signal.aborted) return new Response(null, { status: 499 })
      log("AI service unreachable", error)
      return json(502, "AI service unavailable")
    }

    const headers = new Headers(upstream.headers)
    for (const name of DROPPED_HEADERS) headers.delete(name)
    return new Response(upstream.body, { status: upstream.status, headers })
  }
}
```

- [ ] **Step 4: Wire the route**

`apps/app/src/app/api/chat/route.ts`:

```ts
import { requireUser } from "@/lib/auth"
import { createChatProxy } from "@/lib/chat-proxy"
import { loadEnv } from "@/lib/env"

export const POST = createChatProxy({
  requireUser,
  env: () => loadEnv(["AI_SERVICE_URL", "AI_SERVICE_TOKEN"]),
})
```

- [ ] **Step 5: Run the tests and the typecheck**

Run: `bunx biome check --write apps/app/src && bun --filter @repo/app test && bun --filter @repo/app typecheck`
Expected: 17 pass, 0 fail; typecheck exits 0.

- [ ] **Step 6: Commit**

```bash
git add apps/app/src/lib/chat-proxy.ts apps/app/src/lib/chat-proxy.test.ts apps/app/src/app/api/chat/route.ts
git commit -m "feat(app): /api/chat proxies to apps/ai with the service token"
```

---

### Task 4: Chat page and home links

**Files:**
- Create: `apps/app/src/views/chat-view.tsx`, `apps/app/src/app/chat/page.tsx`
- Modify: `apps/app/src/views/home-view.tsx`

**Interfaces:**
- Consumes: `POST /api/chat` (Task 3); `ChatMessage` from `@repo/ai-contract`; the 401 body `{ message: "Sign-in isn't set up yet" }`.
- Produces: `ChatView` (client component), route `/chat`; home links to `/notes` and `/chat`.

- [ ] **Step 1: Chat view**

`apps/app/src/views/chat-view.tsx`:

```tsx
"use client"

import { useChat } from "@ai-sdk/react"
import type { ChatMessage } from "@repo/ai-contract"
import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { APICallError, DefaultChatTransport } from "ai"
import { type FormEvent, useState } from "react"

const transport = new DefaultChatTransport<ChatMessage>({ api: "/api/chat" })

/** /api/chat answers errors as `{ message }`; show that message rather than the raw body. */
function errorMessage(error: Error): string {
  if (APICallError.isInstance(error) && error.responseBody) {
    try {
      const body = JSON.parse(error.responseBody) as { message?: unknown }
      if (typeof body.message === "string") return body.message
    } catch {
      // Not JSON: fall through to the generic message.
    }
  }
  return "Something went wrong. Try again."
}

export function ChatView() {
  const { messages, sendMessage, status, error, regenerate } = useChat<ChatMessage>({ transport })
  const [input, setInput] = useState("")
  const busy = status === "submitted" || status === "streaming"

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    sendMessage({ text })
    setInput("")
  }

  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-6 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Chat</h1>
        <p className="text-muted-foreground">
          Streams from apps/ai through this app&apos;s /api/chat route, which holds the service
          token. Without an ANTHROPIC_API_KEY the dev service echoes you back — ask for the time to
          see a tool call.
        </p>
      </header>

      <ol className="grid gap-3" aria-live="polite">
        {messages.map((message) => (
          <li
            key={message.id}
            className={
              message.role === "user"
                ? "justify-self-end rounded-lg bg-primary px-4 py-2 text-primary-foreground"
                : "justify-self-start rounded-lg bg-muted px-4 py-2"
            }
          >
            {message.parts.map((part, index) => {
              // biome-ignore lint/suspicious/noArrayIndexKey: parts are append-only within a message
              const key = `${message.id}-${index}`
              if (part.type === "text") {
                return (
                  <p key={key} className="whitespace-pre-wrap">
                    {part.text}
                  </p>
                )
              }
              if (part.type === "tool-getCurrentTime") {
                return (
                  <p key={key} className="text-sm text-muted-foreground">
                    {part.state === "output-available"
                      ? `It's ${part.output.formatted} (${part.output.timeZone})`
                      : part.state === "output-error"
                        ? "Couldn't get the time"
                        : "Checking the time…"}
                  </p>
                )
              }
              return null
            })}
          </li>
        ))}
      </ol>

      {error && (
        <Alert variant="destructive">
          <AlertDescription className="flex items-center justify-between gap-4">
            {errorMessage(error)}
            <Button type="button" size="sm" variant="outline" onClick={() => regenerate()}>
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <form onSubmit={onSubmit} className="flex gap-2">
        <Input
          aria-label="Message"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Say something, or ask for the time"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          Send
        </Button>
      </form>
    </main>
  )
}
```

If Biome reports `suppressions/unused` on the `biome-ignore` line (the key is a variable, which the
rule may not trace), delete that comment line.

- [ ] **Step 2: Chat page**

`apps/app/src/app/chat/page.tsx`:

```tsx
import type { Metadata } from "next"
import { ChatView } from "@/views/chat-view"

export const metadata: Metadata = { title: "Chat" }

export default function Page() {
  return <ChatView />
}
```

- [ ] **Step 3: Home links**

Replace `apps/app/src/views/home-view.tsx` with:

```tsx
import { Hero } from "@repo/ui/blocks/hero"
import { Button } from "@repo/ui/components/button"
import Link from "next/link"

export function HomeView() {
  return (
    <main id="main">
      <Hero
        eyebrow="App shell"
        title="Welcome to the application"
        description="Two example pages call the backend services: notes from apps/api, chat from apps/ai. Replace them as the product takes shape."
        actions={
          <>
            <Button asChild>
              <Link href="/notes">Notes</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/chat">Chat</Link>
            </Button>
          </>
        }
      />
    </main>
  )
}
```

- [ ] **Step 4: Typecheck and lint**

Run: `bunx biome check --write apps/app/src && bun --filter @repo/app typecheck && bunx biome ci apps/app`
Expected: all exit 0 (the typecheck proves `tool-getCurrentTime`'s `output` fields against the contract).

- [ ] **Step 5: Commit**

```bash
git add apps/app/src/views/chat-view.tsx apps/app/src/app/chat/page.tsx apps/app/src/views/home-view.tsx
git commit -m "feat(app): chat page on the stock useChat"
```

---

### Task 5: Notes page

**Files:**
- Create: `apps/app/src/lib/note-form.ts`, `apps/app/src/lib/note-form.test.ts`
- Create: `apps/app/src/lib/api.ts`
- Create: `apps/app/src/app/notes/actions.ts`, `apps/app/src/app/notes/page.tsx`
- Create: `apps/app/src/views/notes-view.tsx`, `apps/app/src/components/note-form.tsx`

**Interfaces:**
- Consumes: `loadEnv`, `MissingEnvError` (Task 2); `ApiClient`, `CreateNoteSchema`, `CreateNote`, `Note` from `@repo/api-contract`.
- Produces:
  - `type NoteFormValues = { title: string; body: string }`
  - `type NoteFormState = { ok: true } | { ok: false; message: string; values: NoteFormValues }`
  - `parseNoteForm(formData: FormData): { ok: true; note: CreateNote } | { ok: false; message: string; values: NoteFormValues }`
  - `api(): ApiClient` (server-only), `describeApiError(error: unknown): string`
  - `createNote(prev: NoteFormState, formData: FormData): Promise<NoteFormState>` (server action)

- [ ] **Step 1: Write the failing form tests**

`apps/app/src/lib/note-form.test.ts`:

```ts
import { expect, test } from "bun:test"
import { parseNoteForm } from "./note-form"

const form = (fields: Record<string, string>) => {
  const data = new FormData()
  for (const [key, value] of Object.entries(fields)) data.set(key, value)
  return data
}

test("a valid note is trimmed and accepted", () => {
  expect(parseNoteForm(form({ title: "  Groceries ", body: "Milk" }))).toEqual({
    ok: true,
    note: { title: "Groceries", body: "Milk" },
  })
})

test("a missing body is an empty body", () => {
  expect(parseNoteForm(form({ title: "Title only" }))).toEqual({
    ok: true,
    note: { title: "Title only", body: "" },
  })
})

test("a whitespace-only title is rejected and the typed values are kept", () => {
  expect(parseNoteForm(form({ title: "   ", body: "Keep me" }))).toEqual({
    ok: false,
    message: "Title is required",
    values: { title: "", body: "Keep me" },
  })
})

test("an over-long title names the limit", () => {
  const result = parseNoteForm(form({ title: "x".repeat(201) }))
  expect(result).toMatchObject({ ok: false, message: "Title must be at most 200 characters" })
})

test("an over-long body names the limit and keeps the body", () => {
  const body = "y".repeat(10_001)
  const result = parseNoteForm(form({ title: "Ok", body }))
  expect(result).toEqual({
    ok: false,
    message: "Body must be at most 10000 characters",
    values: { title: "Ok", body },
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `bun --filter @repo/app test`
Expected: FAIL — `Cannot find module './note-form'`.

- [ ] **Step 3: Implement `note-form.ts`**

`apps/app/src/lib/note-form.ts`:

```ts
import { type CreateNote, CreateNoteSchema } from "@repo/api-contract"
import type { z } from "zod"

export type NoteFormValues = { title: string; body: string }

/** What the create-note server action returns to the form. */
export type NoteFormState = { ok: true } | { ok: false; message: string; values: NoteFormValues }

type Issue = z.ZodError["issues"][number]

function messageFor(issue: Issue | undefined): string {
  const field = issue?.path[0] === "body" ? "Body" : "Title"
  if (issue?.code === "too_small") return `${field} is required`
  if (issue?.code === "too_big") return `${field} must be at most ${issue.maximum} characters`
  return `${field} is invalid`
}

/** Validates the form with the contract's own schema, so the rules live in one place. */
export function parseNoteForm(
  formData: FormData
): { ok: true; note: CreateNote } | { ok: false; message: string; values: NoteFormValues } {
  const values = {
    title: String(formData.get("title") ?? "").trim(),
    body: String(formData.get("body") ?? ""),
  }
  const parsed = CreateNoteSchema.safeParse(values)
  if (parsed.success) return { ok: true, note: parsed.data }
  return { ok: false, message: messageFor(parsed.error.issues[0]), values }
}
```

- [ ] **Step 4: Run the tests**

Run: `bunx biome check --write apps/app/src/lib && bun --filter @repo/app test`
Expected: 22 pass, 0 fail.

- [ ] **Step 5: The server-only API client**

`apps/app/src/lib/api.ts`:

```ts
import "server-only"
import { createORPCClient, ORPCError } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { ApiClient } from "@repo/api-contract"
import { loadEnv, MissingEnvError } from "./env"

// A hung API (a container still starting) would otherwise hold the page open indefinitely.
const TIMEOUT_MS = 5_000

let client: ApiClient | undefined

/** The typed apps/api client, created on first use so `next build` never needs API_URL. */
export function api(): ApiClient {
  client ??= createORPCClient(
    new RPCLink({
      url: `${loadEnv(["API_URL"]).API_URL}/rpc`,
      fetch: (request, init) =>
        fetch(request, {
          ...init,
          signal: AbortSignal.any([request.signal, AbortSignal.timeout(TIMEOUT_MS)]),
        }),
    })
  )
  return client
}

/** A message safe to show on the page: contract errors as-is, anything else as "unreachable". */
export function describeApiError(error: unknown): string {
  if (error instanceof MissingEnvError) return error.message
  if (error instanceof ORPCError) return error.message
  return `Couldn't reach the API at ${loadEnv(["API_URL"]).API_URL}`
}
```

- [ ] **Step 6: Server action, form, view and page**

`apps/app/src/app/notes/actions.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { api, describeApiError } from "@/lib/api"
import { type NoteFormState, parseNoteForm } from "@/lib/note-form"

export async function createNote(_prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  const parsed = parseNoteForm(formData)
  if (!parsed.ok) return parsed
  try {
    await api().notes.create(parsed.note)
  } catch (error) {
    console.error("[app] notes.create failed", error)
    return {
      ok: false,
      message: describeApiError(error),
      values: { title: parsed.note.title, body: parsed.note.body ?? "" },
    }
  }
  revalidatePath("/notes")
  return { ok: true }
}
```

`apps/app/src/components/note-form.tsx`:

```tsx
"use client"

import { Alert, AlertDescription } from "@repo/ui/components/alert"
import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import { Textarea } from "@repo/ui/components/textarea"
import { useActionState } from "react"
import { createNote } from "@/app/notes/actions"
import type { NoteFormState } from "@/lib/note-form"

const initialState: NoteFormState = { ok: true }

export function NoteForm() {
  const [state, action, pending] = useActionState(createNote, initialState)
  // React resets the form after every action; defaultValue brings the typed values back on error.
  const values = state.ok ? undefined : state.values

  return (
    <form action={action} className="grid gap-4">
      <div className="grid gap-2">
        <Label htmlFor="title">Title</Label>
        <Input id="title" name="title" required maxLength={200} defaultValue={values?.title} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="body">Body</Label>
        <Textarea id="body" name="body" rows={4} maxLength={10_000} defaultValue={values?.body} />
      </div>
      {!state.ok && (
        <Alert variant="destructive">
          <AlertDescription>{state.message}</AlertDescription>
        </Alert>
      )}
      <Button type="submit" disabled={pending} className="justify-self-start">
        {pending ? "Saving…" : "Add note"}
      </Button>
    </form>
  )
}
```

`apps/app/src/views/notes-view.tsx`:

```tsx
import type { Note } from "@repo/api-contract"
import { Alert, AlertDescription, AlertTitle } from "@repo/ui/components/alert"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@repo/ui/components/card"
import { NoteForm } from "@/components/note-form"

type NotesViewProps = { notes: Note[] } | { error: string }

function NoteList({ notes }: { notes: Note[] }) {
  if (notes.length === 0) return <p className="text-muted-foreground">No notes yet.</p>
  return (
    <ul className="grid gap-3">
      {notes.map((note) => (
        <li key={note.id}>
          <Card>
            <CardHeader>
              <CardTitle>{note.title}</CardTitle>
              <CardDescription>
                <time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString("en")}</time>
              </CardDescription>
            </CardHeader>
            {note.body && (
              <CardContent>
                <p className="whitespace-pre-wrap">{note.body}</p>
              </CardContent>
            )}
          </Card>
        </li>
      ))}
    </ul>
  )
}

export function NotesView(props: NotesViewProps) {
  return (
    <main id="main" className="mx-auto grid w-full max-w-2xl gap-8 px-6 py-16">
      <header className="grid gap-2">
        <h1 className="text-3xl font-semibold tracking-tight">Notes</h1>
        <p className="text-muted-foreground">
          Rendered on the server from apps/api over typed RPC; adding a note runs a server action.
        </p>
      </header>
      <NoteForm />
      {"error" in props ? (
        <Alert variant="destructive">
          <AlertTitle>Notes are unavailable</AlertTitle>
          <AlertDescription>{props.error}</AlertDescription>
        </Alert>
      ) : (
        <NoteList notes={props.notes} />
      )}
    </main>
  )
}
```

`apps/app/src/app/notes/page.tsx`:

```tsx
import type { Metadata } from "next"
import { connection } from "next/server"
import { api, describeApiError } from "@/lib/api"
import { NotesView } from "@/views/notes-view"

export const metadata: Metadata = { title: "Notes" }

export default async function Page() {
  // Live data on every request — and it keeps `next build`, which has no API to call, from
  // trying to prerender this page.
  await connection()
  try {
    return <NotesView notes={await api().notes.list()} />
  } catch (error) {
    console.error("[app] notes.list failed", error)
    return <NotesView error={describeApiError(error)} />
  }
}
```

- [ ] **Step 7: Typecheck, lint, and build with no API running**

Make sure nothing listens on port 3007 (`lsof -ti :3007` prints nothing; stop `bun dev` if it does).

Run: `bunx biome check --write apps/app/src && bun --filter @repo/app typecheck && bunx biome ci apps/app && bun --filter @repo/app build`
Expected: all exit 0; the build output lists `ƒ /notes` (dynamic) and never logs `notes.list failed`.

- [ ] **Step 8: Commit**

```bash
git add apps/app/src/lib/note-form.ts apps/app/src/lib/note-form.test.ts apps/app/src/lib/api.ts apps/app/src/app/notes apps/app/src/views/notes-view.tsx apps/app/src/components/note-form.tsx
git commit -m "feat(app): notes page on the typed apps/api client"
```

---

### Task 6: Docker networking, docs, and the real run

**Files:**
- Modify: `docker-compose.yml` (the `app` service), `docker-compose.dev.yml` (the `dev` service `environment`)
- Modify: `apps/api/README.md:33-48`, `apps/ai/README.md` (the Next route example), `CLAUDE.md`, `.github/workflows/ci.yml:91`

**Interfaces:**
- Consumes: everything above.
- Produces: `app` reaches `api` / `ai` by service name in Compose.

- [ ] **Step 1: Compose**

In `docker-compose.yml`, the `app` service becomes:

```yaml
  app:
    <<: *next-app
    build: { context: ., dockerfile: docker/next.Dockerfile, args: { APP: app, PORT: 3001 } }
    ports: ["3001:3001"]
    # Service names resolve on Compose's default network. Chat answers 401 in production until
    # real auth replaces requireUser(), so app waits only for api: ai exits at startup without
    # AI_SERVICE_TOKEN, and that must not keep the notes page down.
    environment:
      API_URL: http://api:3007
      AI_SERVICE_URL: http://ai:3008
      AI_SERVICE_TOKEN: ${AI_SERVICE_TOKEN:-}
    depends_on:
      api:
        condition: service_healthy
```

If the `next-app` anchor already defines `environment`, merge these keys into a copy of it rather
than replacing it (check with `grep -n "next-app" -A8 docker-compose.yml`).

In `docker-compose.dev.yml`, add to the `dev` service's `environment` list:

```yaml
      # *.localhost does not resolve inside Linux containers; every app shares this one.
      - API_URL=http://localhost:3007
      - AI_SERVICE_URL=http://localhost:3008
```

Run: `docker compose config -q && docker compose -f docker-compose.dev.yml config -q`
Expected: both exit 0.

- [ ] **Step 2: Real run under `bun dev`**

Run, in the background: `bun --filter @repo/api --filter @repo/ai --filter @repo/app dev`
Wait until `http://app.localhost:3001/api/health`, `http://api.localhost:3007/health` and
`http://ai.localhost:3008/health` all answer 200.

In a real browser (the chrome-devtools MCP tools), at `http://app.localhost:3001`:
1. The home page shows **Notes** and **Chat** links.
2. `/notes`: add a note titled `Hello from app`; it appears in the list; reload — still there.
3. Submit a title of three spaces: `Title is required` appears and the body is kept.
4. `/chat`: send `hi`; the reply streams in as `Echo: hi` (keyless `mock:echo`).
5. Send `what time is it in Europe/Stockholm?` — with `mock:echo` there is no tool call; this step
   only checks the page renders any tool part without error. (A real model is needed to see
   `It's … (Europe/Stockholm)`; skip if no `ANTHROPIC_API_KEY`.)

Expected: every step as described; the browser console shows no errors.

- [ ] **Step 3: API down, and API hung**

Stop the `api` dev server only (`kill $(lsof -ti :3007)`), reload `/notes`.
Expected: the page renders with **Notes are unavailable** / `Couldn't reach the API at http://api.localhost:3007`.

Then start a listener that accepts connections and never answers: `bun -e 'Bun.listen({hostname:"127.0.0.1",port:3007,socket:{data(){}}})' &`
and reload `/notes`.
Expected: the same error panel appears after about 5 seconds, not a page that never loads. Stop
the listener and all dev servers afterwards.

- [ ] **Step 4: Real run under Docker Compose**

Run: `AI_SERVICE_TOKEN=local-test AI_MODEL=mock:echo docker compose up -d --build app api ai`
Wait for `docker compose ps` to show all three `healthy`.

1. `curl -s http://localhost:3001/notes | grep -c "Notes"` → at least `1`, and no `Notes are unavailable`.
2. Create a note through the page in the browser at `http://localhost:3001/notes`; it appears.
3. `curl -s -X POST http://localhost:3001/api/chat -H 'content-type: application/json' -d '{"messages":[]}' -w '\n%{http_code}\n'`
   → `{"message":"Sign-in isn't set up yet"}` and `401`.

Then: `docker compose down`
Expected: as listed.

- [ ] **Step 5: Production logs survive the build**

Run: `grep -rl "AI service unreachable" apps/app/.next/server | head -1`
Expected: one file path — the log call survived `removeConsole`. (Before Task 2's config change
this printed nothing, because the whole `console.error` call, string included, was removed.)

- [ ] **Step 6: Docs**

Replace the paragraph after the code block in `apps/api/README.md`'s **Calling it from a Next app**
section (lines 45-48) with:

```markdown
Add `@orpc/client` and `@repo/api-contract` to the app (`catalog:` / `workspace:*`),
`@repo/api-contract` to its `transpilePackages`, and call the API **from the server** — server
components and server actions — with `API_URL` read at request time. `apps/app/src/lib/api.ts` and
`apps/app/src/app/notes/` are the working example. Avoid `rewrites()` for this: Next resolves
rewrites at build time, so the API's address would be baked into the build (a Docker build
argument) instead of read from the environment when the container starts.
```

In `apps/ai/README.md`, directly after the example `app/api/chat/route.ts` block, add:

```markdown
`apps/app/src/lib/chat-proxy.ts` is the working version, with `requireUser()` in
`apps/app/src/lib/auth.ts` as the seam real auth replaces (a dev user outside production, nobody
in production).
```

In `CLAUDE.md`'s **Quality gates** section, the sentence listing the five checks names the
service tests as "(`bun run test:services`, apps/api and apps/ai)" (the text wraps across two
lines). Change that parenthesis to "(`bun run test:services`: apps/api, apps/ai, and apps/app's
route and helper tests)". In the **Frontend Architecture** section, after "calls through the typed
contract in `packages/api-contract`.", add: "`apps/app`'s `/notes` and `/chat` pages are the
working example of calling `apps/api` and `apps/ai`."

In `.github/workflows/ci.yml` line 91, change the comment to:
`# bun test for apps/api, apps/ai and apps/app: the services against real Bun.serve instances on ephemeral ports,`

- [ ] **Step 7: Full gate**

Run: `bun run ci`
Expected: exit 0 — Biome clean, all typechecks, 7 + 66 + 22 tests pass, full build.

- [ ] **Step 8: Commit**

```bash
git add docker-compose.yml docker-compose.dev.yml apps/api/README.md apps/ai/README.md CLAUDE.md .github/workflows/ci.yml
git commit -m "feat(app): reach api and ai over Compose, and document the working example"
```
