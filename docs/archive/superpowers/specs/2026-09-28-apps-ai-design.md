# apps/ai — AI service boilerplate

**Status:** approved design, pending implementation plan
**Date:** 2026-09-28

## Intent

`apps/ai` is a **backend AI service** (Bun, like `apps/api`) that gives anyone who downloads this
boilerplate a safe, tested starting point for whatever AI feature they build. It demonstrates the
patterns almost every AI feature needs — streaming chat, a model-callable tool, structured output —
each small and clearly marked as an example to replace. It is not a product and ships no UI.

**Success criteria**

- A Next app can stream a chat response with the stock AI SDK `useChat` and call a typed
  structured endpoint, without importing anything from `apps/ai`.
- `bun dev` works immediately after download with no API key (keyless mock mode).
- A deployed instance is not an open, billable LLM proxy (guard, rate limit, cost limits).
- The full test suite runs with no API key and no network; `bun run ci` stays green.
- Swapping providers is configuration plus one line, not a rewrite.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Library | Vercel AI SDK (`ai` v7) | Provider-agnostic — builders may not use Claude. `fetch`-native, runs on `Bun.serve`. |
| Default provider/model | Anthropic, `anthropic:claude-opus-5` | Only Anthropic ships; others are `bun add` + one line. |
| Chat transport | AI SDK UI message stream on plain `POST /chat` | Works with stock `useChat` + `DefaultChatTransport` — what builders copy from the docs. |
| Everything else | oRPC contract in `packages/ai-contract` | Same typed-contract + OpenAPI pattern as `apps/api`. |
| Coupling | `apps/ai` and `apps/api` never import each other | Either can be deleted independently. |
| Rejected | All-oRPC chat (needs custom `useChat` transport); Mastra (opinionated, heavier, less Bun-native) | |

## Layout

```
packages/ai-contract/        @repo/ai-contract
  src/index.ts               oRPC contract (structured endpoints) + AiClient type
  src/chat.ts                ChatMessage = UIMessage typed with the tools' input/output

apps/ai/                     @repo/ai — ai.localhost:3008 → ai.brand.com
  .env.example               every variable, safe default, one-line comment
  src/index.ts               entrypoint
  src/env.ts                 Zod-validated Bun.env (host, port, model, token, origins, limits)
  src/models.ts              createProviderRegistry: anthropic + mock
  src/prompts/system.md      system prompt, imported as text
  src/guard.ts               token + origin check
  src/rate-limit.ts          RateLimiter interface + in-memory implementation
  src/tools/                 one file per tool; get-current-time.ts is the example
  src/chat.ts                POST /chat handler
  src/router.ts              implements ai-contract
  src/server.ts              createServer({ model, …, port }) → Bun.serve routes table
  src/*.test.ts              bun test, MockLanguageModelV4
```

`createServer` receives the language model as a parameter: the registry model in production, a
mock in tests. This is what keeps CI keyless and makes providers swappable.

## Routes

| Route | Guarded | What |
|---|---|---|
| `/health` | no | Static `Response` |
| `POST /chat` | yes | AI SDK UI message stream |
| `/rpc/*` | yes | Typed oRPC for structured endpoints |
| `/openapi`, `/openapi/spec.json` | no | Scalar docs and the generated spec |
| `/openapi/*` (all other paths) | yes | Same procedures as REST |

## Configuration

- `AI_MODEL="provider:model"`, default `anthropic:claude-opus-5`, resolved through
  `createProviderRegistry`.
- Providers read their own standard key (`ANTHROPIC_API_KEY`, …); Bun loads `.env*`. Keys never
  appear in the contract package.
- **No key for the selected provider:** in `development`, start on `mock:echo` with a loud warning;
  in `production`, exit at startup with a clear error.
- `mock:echo` streams back the last user message, built on the SDK's own `MockLanguageModelV4`, so
  dev mode and tests exercise the same code path as a real provider.
- `AI_SERVICE_TOKEN` — bearer token (`Authorization: Bearer …`). Development default
  `dev-only-insecure-token`; production has no default and startup fails without it.
- `AI_ALLOWED_ORIGINS` — comma-separated exact origins. Development default: any
  `http://localhost:<port>` or `http://<name>.localhost:<port>`; production default: empty, i.e.
  browsers are rejected and only server-to-server calls (no `Origin` header) are accepted.
  Requests without an `Origin` header are always allowed when the token is valid.
- Limits, with defaults: `AI_MAX_MESSAGES=50`, `AI_MAX_MESSAGE_BYTES=32768`,
  `AI_MAX_OUTPUT_TOKENS=4096`, `AI_MAX_STEPS=5`, `AI_RATE_LIMIT=30` requests per
  `AI_RATE_WINDOW_SECONDS=60` per client.
- Anthropic: system prompt marked cacheable (`providerOptions.anthropic.cacheControl`); effort via
  `providerOptions.anthropic.effort`. Server-side refusal fallback: enabled if the provider passes
  it through — verified during planning, and reported either way.

## Request flow — `POST /chat`

1. **Guard** — missing/wrong token → 401; origin present and not allowed → 403.
2. **Rate limit** — over budget → 429 with `Retry-After`. Client key: client IP from Bun's
   `server.requestIP(req)`.
3. **Validate** — JSON body; message count and per-message size limits; `validateUIMessages`
   against the tool set → 400. The model is never called for an invalid request.
4. **`streamText`** — injected model, system prompt, `convertToModelMessages(messages)`, tools,
   `stopWhen: isStepCount(AI_MAX_STEPS)`, `maxOutputTokens`, `abortSignal: req.signal`,
   `onFinish` → usage log.
5. **Respond** — `createUIMessageStreamResponse(toUIMessageStream(...))`. Stream `onError` sends
   the client a generic message; the real error is logged server-side only.

**Example tool** — `getCurrentTime({ timeZone })`: `Intl` only, no network, deterministic enough to
test. Shows the whole pattern: Zod input, description, `execute`, typed tool part for the client.

## Structured endpoint — `summarize`

- Input `{ text: string(1..20000) }`; output `{ title, summary, keyPoints: string[] (≤5) }`;
  declared error `GENERATION_FAILED`.
- `generateText({ model, output: Output.object({ schema }) })` using the contract's own output
  schema — defined once, it both constrains the model and types the response.
- Invalid input → oRPC 400 before any model call. Schema-invalid model output or provider error →
  `GENERATION_FAILED` (502); details logged server-side only.
- Guard and rate limit run in the `Bun.serve` route layer before `/chat`, `/rpc/*` and the REST
  procedures under `/openapi/*` — one enforcement point; handlers never see an unauthenticated
  request. Only `/health`, `/openapi` (docs) and `/openapi/spec.json` are open.

## Observability

One structured log line per model call:
`{ route, model, inputTokens, outputTokens, cachedInputTokens, steps, ms }`.

## Testing

All over real HTTP against `createServer({ model: mock, port: 0 })`; no keys, no network.

- **Guard:** no token / wrong token → 401; disallowed origin → 403; `/health`, `/openapi` open.
- **Rate limit:** N+1th request → 429 + `Retry-After`; limiter unit-tested with an injected clock.
- **Limits:** too many / oversized / malformed → 400, asserting the mock model was not called.
- **Chat:** mock text streams as UI parts; a mock tool call runs `getCurrentTime` and its result
  appears in the stream; client abort cancels the model stream; mid-stream provider error → generic
  client message, details only in the log.
- **Summarize:** typed client gets the parsed object; invalid mock JSON → `GENERATION_FAILED`;
  empty/oversized text → 400 without a model call.
- **Config:** missing key → dev falls back to `mock:echo` with a warning; production exits.
- **Tool:** valid and invalid time zones.
- Suite also run on CI's Bun 1.3.14.

## Dependencies and gates

- **Catalog (new):** `ai`, `@ai-sdk/anthropic`, `@ai-sdk/react` — a lockstep family, catalogued as
  a set (`@ai-sdk/react` now, so Next apps get the matching version).
- `packages/ai-contract`: `@orpc/contract`, `zod`, `ai` (for `UIMessage`).
- `apps/ai`: all via `catalog:` / `workspace:*`; `@types/bun` via `catalog:`.
- Root `typecheck` adds `apps/ai` and `packages/ai-contract`. `test:api` becomes `test:services`
  running both suites; `ci`, `validate` and the CI workflow step use it.
- `CLAUDE.md` and `apps/ai/README.md` document the app, configuration, and the next steps below.

## Out of scope (README "next steps")

Chat history persistence / resumable streams · RAG / embeddings (sqlite-vec or pgvector) · MCP
client tools · OpenTelemetry tracing · evals · real user auth (deferred repo-wide).

## Verify during planning

Against the installed `ai` v7 package, not docs: `instructions` vs `system`;
`validateUIMessages` name and signature; `toUIMessageStream` / `createUIMessageStreamResponse`
shapes; `MockLanguageModelV4` chunk format for tool calls; whether `@ai-sdk/anthropic` supports the
server-side refusal fallback.
