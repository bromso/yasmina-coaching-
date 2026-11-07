# @repo/ai

AI service on `Bun.serve` + the [AI SDK](https://ai-sdk.dev) + [oRPC](https://orpc.dev).
Dev: `ai.brand.localhost:3008` → prod: `ai.brand.com`. A starting point — the chat prompt, the
`getCurrentTime` tool and `summarize` are examples to replace.

```bash
bun --filter @repo/ai dev       # bun --hot; works with no API key (mock:echo)
bun --filter @repo/ai test      # mock models — no key, no network
bun --filter @repo/ai build     # dist/index.js (run with `start`)
bun --filter @repo/ai compile   # dist/ai — single self-contained binary
```

Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY` to use a real model.

`NODE_ENV` defaults to `production` — Bun never sets it, so an unconfigured binary fails closed.
`bun dev` sets `NODE_ENV=development`, which enables the public dev token and localhost origins.
A deploy must set `AI_SERVICE_TOKEN` (at least 32 characters, not the public dev token) and the
provider key (`ANTHROPIC_API_KEY`), or it refuses to start.

## Routes

| Path | Guarded | What |
|---|---|---|
| `/health` | no | Static `Response` |
| `POST /chat` | yes | AI SDK UI message stream — works with stock `useChat` |
| `/rpc/*` | yes | Typed oRPC (`summarize`) |
| `/openapi/*` | yes | The same procedures as REST |
| `/openapi`, `/openapi/spec.json` | no | Scalar docs, generated spec |

Guarded routes need `Authorization: Bearer $AI_SERVICE_TOKEN`, pass an origin check, and are rate
limited per client. The client is the `x-ai-client-id` header when the caller sends one (trimmed,
first 128 characters) — your backend sets it to the authenticated user's id, since every request it
proxies arrives from the same IP — and the client IP otherwise. Requests are size-checked before any model call; the tool loop, output
tokens and request body are capped; a client disconnect cancels the provider call.

## Calling it from a Next app

The token must stay on the server, so the browser talks to your app, and your app talks to this
service. Add `ai`, `@ai-sdk/react`, `@orpc/client` (`catalog:`) and `@repo/ai-contract`
(`workspace:*`) to the app, and `@repo/ai-contract` to its `transpilePackages`.

```ts
// app/api/chat/route.ts — forwards the stream, adds the token server-side
export async function POST(req: Request) {
  const user = await requireUser(req) // your auth — reject anonymous callers
  return fetch(`${process.env.AI_SERVICE_URL}/chat`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}`,
      "content-type": "application/json",
      "x-ai-client-id": user.id,
    },
    body: await req.text(),
    signal: req.signal,
  })
}
```

`apps/app/src/lib/chat-proxy.ts` is the working version, with `requireUser()` in
`apps/app/src/lib/auth.ts` as the seam real auth replaces (a dev user outside production, nobody
in production).

This route is now the trust boundary: anyone who can call it spends your model budget, so
authenticate and rate-limit per user there.

```tsx
// any client component — the stock AI SDK hook, typed tool parts
import { useChat } from "@ai-sdk/react"
import type { ChatMessage } from "@repo/ai-contract"
import { DefaultChatTransport } from "ai"

const { messages, sendMessage } = useChat<ChatMessage>({
  transport: new DefaultChatTransport({ api: "/api/chat" }),
})
```

Structured endpoints, from server code:

```ts
import { createORPCClient } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import type { AiClient } from "@repo/ai-contract"

const ai: AiClient = createORPCClient(
  new RPCLink({
    url: `${process.env.AI_SERVICE_URL}/rpc`,
    headers: { authorization: `Bearer ${process.env.AI_SERVICE_TOKEN}` },
  }),
)
const { title, keyPoints } = await ai.summarize({ text })
```

## Deploying

- `NODE_ENV` defaults to `production`; only `bun dev` sets `development`.
- Required: `AI_SERVICE_TOKEN` (at least 32 characters — `openssl rand -hex 32`; the public dev
  token is refused) and the provider key for `AI_MODEL` (`ANTHROPIC_API_KEY` by
  default). Without them the service exits at startup.
- Set `HOST=0.0.0.0` in a container or VM — the default `ai.brand.localhost` binds loopback only.
- The service has no CORS, so browsers cannot call it directly: call it from your backend.

## Telemetry

Optional `API_URL` / `API_SERVICE_TOKEN` (unset → no reporting, one log line at boot) point a
`createTelemetryClient({ app: "ai" })` (`@repo/telemetry/server`) at `apps/api`'s
`telemetry.ingest`. Only **request failures** are reported — an unexpected 5xx, the `/chat` or
`/rpc` handlers' `error()` fallback, `summarize`'s `GENERATION_FAILED`, a chat stream that ends in
failure — never a recovered stream error the client already saw. Each report is a single reduced
event, `"<log key>: <ErrorName>"` (`toAiErrorEvent` in `src/server.ts`), with no stack and never the
provider's own message: a provider error can carry secrets or model output, and the full text still
reaches the service's own log via `log.error`. Reporting is fire-and-forget off the response path —
a telemetry failure never changes what the caller gets back. See `apps/api/README.md`'s
**Telemetry** section and `docs/guides/sentry.md` for where these events end up.

## Logs and request ids

Structured JSON logging through `@repo/log` (`packages/log/README.md`, service `"ai"`):
`createAiLogger` (`src/log.ts`) backs `usage` (one line per model call: route, model, token
counts, duration, outcome) and `error` onto it. `LOG_LEVEL` / `LOG_FORMAT` override the usual
defaults (see `packages/log/README.md`); sensitive fields are redacted the same way everywhere
else in the stack. Every request shares `@repo/service-kit`'s `withRequest` wrapper with
`apps/api`: an incoming `x-request-id` is accepted only once the caller has passed the bearer
guard, else a fresh 22-character id is generated; either way it wraps the whole handler
(`@repo/log/context`'s `AsyncLocalStorage` context), is echoed as the `x-request-id` response
header, and is on every `usage`/`error` line the request causes. This service exposes no
`/metrics` (only `apps/api` and its dedicated worker do). See `docs/guides/operations.md`.

`withRequest`'s `REQUEST_TIMEOUT_MS` deadline only bounds the time to a `Response` — it does not
abort the provider call under way. `summarize`'s `abortSignal` is oRPC's own request `signal`
(the client disconnecting), not the deadline, so a model call still running past the deadline
keeps running, and its tokens are still billed once it finishes, for a result the caller already
got a 503 for. A long `summarize` against a real provider (large input, a high
`AI_MAX_OUTPUT_TOKENS`) can approach the default 30 s deadline; raise `REQUEST_TIMEOUT_MS` for
structured endpoints with long outputs rather than relying on the deadline to cut the call short.

## Extending it

- **Another provider** — `bun add @ai-sdk/<name>` through the catalog, register it in
  `src/models.ts`, add its key variable to `providerKeys`, set `AI_MODEL=<name>:<model>`.
- **Another tool** — add its schema to `chatTools` in `packages/ai-contract/src/chat.ts`, implement
  it in `src/tools/`, add it to `src/tools/index.ts` (the typecheck fails until you do).
- **Another structured endpoint** — add a procedure to the contract, implement it in
  `src/router.ts` with `generateText({ output: Output.object({ schema }) })`.
- **More than one instance** — implement `RateLimiter` over `Bun.redis`.

## Next steps (not included)

Chat history persistence and resumable streams · RAG / embeddings (sqlite-vec or pgvector) · MCP
client tools · OpenTelemetry (`experimental_telemetry`) · evals · real user auth.
