# apps/app — calling apps/api and apps/ai

**Status:** approved design, pending implementation plan
**Date:** 2026-09-28

## Intent

No Next app calls `apps/api` or `apps/ai` yet; their READMEs describe how, but nothing proves it.
This adds the **reference example** a builder copies: a notes page on the typed `ApiClient` and a
chat page on the stock AI SDK `useChat`, in `apps/app`. It is small and clearly an example, not a
feature, and it exercises the whole chain — contract packages, `transpilePackages`, server-side
calls, a streaming route handler, and container-to-container networking.

**Success criteria**

- `bun dev`: create and list notes; chat with the keyless `mock:echo` model, including the
  `getCurrentTime` tool output.
- `docker compose up --build app api ai`: notes work across containers by service name; chat
  answers the designed 401.
- Typed end to end with no codegen; `apps/app` imports only the contract packages, never
  `apps/api` or `apps/ai`.
- `bun run ci` stays green; CI runs the new tests when `apps/app` changes.
- The AI service token never reaches the browser, and a production deploy of `apps/app` is not an
  open proxy to the model.

## Decisions

| Decision | Choice | Why |
|---|---|---|
| Notes data path | Server components + a server action call `api` directly | `API_URL` is read at runtime, so one image works in dev, Docker and production. No CORS, no proxy, no API client in the browser. |
| Not `rewrites()` | Rejected | Next resolves rewrites at build time into the build output, so `API_URL` would become a Docker build argument and the image would be tied to one network. The api README is corrected accordingly. |
| Not a browser client + proxy route | Rejected | More code (proxy route, client fetching, loading states) for the same two operations. |
| Chat path | Browser → `apps/app` `/api/chat` route → `ai` `/chat` | The token must stay server-side; `ai` has no CORS. |
| Chat access without auth | Fail-closed `requireUser()` seam | Dev user in development, `null` (→ 401) in production. Real auth replaces one function. |
| Shared dev token | `DEV_TOKEN` moves to `@repo/ai-contract` | `apps/app` needs the same default and may not import `apps/ai`; the constant describes the contract between the two. |

## Components (`apps/app`)

| File | Responsibility |
|---|---|
| `src/lib/env.ts` | Reads `API_URL`, `AI_SERVICE_URL`, `AI_SERVICE_TOKEN` lazily (on first use, not at import). Development defaults: `http://api.localhost:3007`, `http://ai.localhost:3008`, `DEV_TOKEN`. Production: each is required; a missing one throws an error naming it. Only `NODE_ENV=production` is strict — development and test (`bun test`) get the defaults. Next sets `NODE_ENV` itself (`next dev` → development, `next build`/`start` → production). Exposes `loadEnv(source)` so tests pass their own values. |
| `src/lib/api.ts` | `import "server-only"`; exports a typed `ApiClient` (`createORPCClient(new RPCLink({ url: \`${API_URL}/rpc\` }))`). |
| `src/lib/auth.ts` | `requireUser(req): Promise<{ id: string } \| null>` — `{ id: "dev-user" }` outside production, `null` in production. The seam real auth replaces. |
| `src/app/notes/page.tsx` → `src/views/notes-view.tsx` | Server component. Calls `await connection()` first so `next build` never prerenders it (CI builds with no API running), then `api.notes.list()`. Renders the list and the create form. |
| `src/app/notes/actions.ts` | Server action `createNote(prev, formData)`: validates with the contract's `notes.create` input schema, calls `api.notes.create`, `revalidatePath("/notes")`. Returns `{ ok: true }` or `{ ok: false, message }`. |
| `src/app/api/chat/route.ts` | `POST`: `requireUser` → 401 if null; forwards the body to `${AI_SERVICE_URL}/chat` with `authorization: Bearer <token>`, `x-ai-client-id: user.id`, and `req.signal`; returns the upstream stream untouched. |
| `src/app/chat/page.tsx` → `src/views/chat-view.tsx` | Client component: `useChat<ChatMessage>({ transport: new DefaultChatTransport({ api: "/api/chat" }) })`; renders text parts and the `getCurrentTime` tool part. |
| `src/views/home-view.tsx` | Adds links to `/notes` and `/chat`. |
| `.env.example` | The three variables, with the dev defaults and Docker values. |

**Dependencies** (`apps/app`): `@orpc/client`, `ai`, `@ai-sdk/react`, `zod` (`catalog:`);
`@repo/api-contract`, `@repo/ai-contract` (`workspace:*`); `server-only` (local literal range —
one workspace). Both contract packages join `transpilePackages`.

**Other files:** `packages/ai-contract` exports `DEV_TOKEN`, and `apps/ai/src/env.ts` imports it.
`apps/api/README.md` replaces the `rewrites()` advice with the server-side pattern and its reason.
Root `test:services` gains `--filter @repo/app`.

## Configuration and data flow

| Where | `API_URL` | `AI_SERVICE_URL` | `AI_SERVICE_TOKEN` |
|---|---|---|---|
| `bun dev` on the host | default `http://api.localhost:3007` | default `http://ai.localhost:3008` | default `DEV_TOKEN` |
| `docker-compose.dev.yml` (one container) | `http://localhost:3007` (`*.localhost` does not resolve in Linux containers) | `http://localhost:3008` | default |
| `docker-compose.yml` | `http://api:3007` (service name) | `http://ai:3008` | `${AI_SERVICE_TOKEN}` from the root `.env`, the value `ai` reads |

`docker-compose.yml`'s `app` service gains that `environment` block and `depends_on` `api` and
`ai` with `condition: service_healthy` (both images define a `HEALTHCHECK`).

- **Notes:** browser → `apps/app` `/notes` (server component → `api` over RPC) → HTML. The form
  posts to the server action → `api` → `revalidatePath`.
- **Chat:** browser → `apps/app` `/api/chat` → `requireUser` → `ai` `/chat` with the token →
  streamed back. The upstream request has no `Origin` header, so `ai` treats it as
  server-to-server.

Under the production-like compose stack, chat answers 401 by design; notes work (`api` has no
auth yet). Missing production variables fail on the first notes or chat request with a message
naming the variable, not at container start, so `/api/health` stays green.

## Error handling

**Notes**
- `api` unreachable, or a variable missing: an inline error panel naming the configured URL or the
  missing variable — not a thrown error that blanks the page.
- Create: the action returns `{ ok: false, message }`; the form shows it and keeps the typed
  values. Validation runs server-side with the contract schema (title 1–200, body ≤ 10k); the form
  also sets `required` / `maxLength`. An oRPC `BAD_REQUEST` takes the same message path.

**Chat route**

| Situation | Response |
|---|---|
| No user | `401 { message }` |
| Variable missing | `503 { message }`, logged |
| `ai` answers 400 / 401 / 403 / 429 | passed through unchanged, `Retry-After` included |
| `ai` unreachable | `502 { message: "AI service unavailable" }`; details logged server-side only |
| Browser disconnects | `req.signal` is forwarded, so the model call is cancelled and `ai` logs `aborted` |

The token and upstream error text never reach the browser.

**Chat page:** `useChat`'s `error` shows a short message with a Retry button; a 401 shows
"Sign-in isn't set up yet" so the fail-closed state reads as intended, not broken.

## Testing

**`bun test` in `apps/app`**
- `api/chat/route.ts` against a fake `ai` upstream (`Bun.serve`, port 0) over real HTTP: token and
  `x-ai-client-id` forwarded; the SSE body streams through unchanged; no user → 401 and upstream
  is never called; upstream 429 passes through with `Retry-After`; upstream unreachable → 502 with
  no upstream detail in the body; an aborted request aborts the upstream one.
- `lib/env.ts`: development defaults; each variable required in production.
- `lib/auth.ts`: dev user outside production, `null` in production.

The server action and pages are not unit-tested — `server-only` and server components need Next's
runtime. Typecheck and `next build` cover them, and the real run below exercises them.

**Real run before reporting done**
1. `bun dev` (app, api, ai), in a browser: create a note, see it listed, reload; chat with
   `mock:echo`; ask for the time and see the tool output.
2. Stop `api`: the notes page shows the inline error.
3. `docker compose up --build app api ai`: notes work across containers; chat returns 401.

## Out of scope

- Real authentication (the `requireUser` seam is where it plugs in).
- Auth on `apps/api` itself.
- Calling `api` or `ai` from the browser directly, or from the other six Next apps.
- The `summarize` procedure in the UI.
