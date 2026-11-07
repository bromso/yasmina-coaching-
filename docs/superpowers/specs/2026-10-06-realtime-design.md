# Realtime — design

Sub-project D of the feature-parity work (A two-factor → B file storage → C background jobs →
D realtime → E product analytics → F content → G i18n). Approved in chat section by section on
2026-10-06.

## Intent

A signed-in page can receive live updates from `apps/api` without breaking the repo's rules:
browsers never call `apps/api`, the production CSP stays `connect-src 'self'`, and the starter runs
keyless on one node and scales on Postgres. It ships one working example: **live notes and
presence** on `apps/app`'s `/notes` — a note created or deleted by anyone in the workspace appears
or disappears for everyone, and a "Here now" row shows who else has the page open.

Decided with the owner:

- Example: **live notes + presence** (no notification bell).
- Transport: **Server-Sent Events relayed through each app's own origin** (no WebSocket, no
  polling).

## 1. The bus and the api stream

**Publisher seam** — `apps/api/src/realtime/`:

```ts
interface Broadcaster {
  kind: "memory" | "postgres"
  publish(channel: string, event: RealtimeEvent): Promise<void>
  subscribe(channel: string, onEvent: (event: RealtimeEvent) => void): () => void // unsubscribe
  close(): Promise<void>
}
```

Picked at boot from the database dialect, overridable with `REALTIME_BUS=memory|postgres`:

- **`memory`** (SQLite) — in-process fan-out. Correct for one api process, which is the SQLite
  deployment shape.
- **`postgres`** — `publish` runs `NOTIFY realtime, '<json>'`; one shared
  `sql.listen("realtime", …)` (Bun 1.4.2, re-subscribes after reconnect) fans out locally, so every
  replica's subscribers hear every replica's writes. Payloads carry ids and kinds and the small
  note summary, never more than fits the 8000-byte `NOTIFY` limit; a larger payload is refused at
  publish (thrown, logged through `recordFailure`, never sent).

**Channels and events** — channel `workspace:<id>`. Events are a typed union in
`@repo/api-contract` (`RealtimeEventSchema`, `realtime.ts`):

| Event | Data |
|---|---|
| `note.created` | `{ note: Note }` (the same `Note` shape `notes.list` returns) |
| `note.deleted` | `{ id: number }` |
| `presence` | `{ replicaId: string; members: { userId: number; name: string; avatarUrl: string \| null }[] }` |
| `resync` | `{}` — the client should re-fetch |

**Publishing** — `notes.create` and `notes.delete` publish after their write commits. A publish
requested inside a `db.transaction` is deferred until after commit (a small `afterCommit` helper),
so subscribers never see an event for a rolled-back write. A failed publish is logged through
`recordFailure` and never fails the request.

**Stream endpoint** — `GET /events/workspaces/:workspaceId` on `Bun.serve`, outside oRPC (it is not
built for long-lived streams):

- behind the existing bearer guard and rate limiter's client-id rules, plus `x-session-token`; the
  caller must be a member of the workspace — a non-member, an unknown workspace and a missing
  session answer 404 / 401 exactly like the scoped procedures (no existence oracle). An
  impersonation session may subscribe (read-only, like reading notes).
- `Content-Type: text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`;
  `retry: 3000` first; each event has an `id:` (monotonic per process); a `: ping` comment every
  25 s.
- on connect (and on every reconnect — `Last-Event-ID` is accepted but nothing is replayed) the
  stream sends the current `presence` snapshot and a `resync` event, so a reconnecting client
  re-fetches instead of the server keeping an event log.
- limits: at most 5 open streams per session (the 6th answers 429), `REALTIME_MAX_STREAMS` (default
  1000) per process (503 beyond it).
- membership and session are re-checked every 60 s; a stream whose session expired or whose member
  was removed is closed.
- the api's shutdown closes every open stream first (`onShutdown`), so the HTTP drain does not wait
  on them.

## 2. Presence, the Next relay, the client

**Presence** (api) — each open stream registers `(workspaceId, userId, connectionId)` in an
in-process map; the first connection of a user in a workspace is a join, the last close a leave
(several tabs are one person). On every change the replica publishes a full `presence` snapshot
for that workspace with its `replicaId` (a random id per process). Snapshots are re-published every
25 s with the ping. Subscribers (the client) merge the latest snapshot per `replicaId` and drop a
replica not heard from for 60 s. Presence lists name and avatar only — never email — and only
members of that workspace receive it.

**Next relay** — `createEventsRoute()` in `@repo/session/events` (exported as `./events`), used by a
two-line `apps/app/src/app/api/events/route.ts`:

- `getUserFromRequest(req)` → 401 without a session; the workspace from
  `resolveWorkspaceFromRequest(req)` (as `/api/chat` does) → 404 when there is none
- opens the api stream with the service token, the session token and a per-browser client id
  (`events:<ip hash>`, like `files:`), and returns its body unchanged as `text/event-stream` with
  `Cache-Control: no-store` and `X-Accel-Buffering: no`
- the browser's disconnect (`req.signal`) aborts the upstream request; an upstream failure before
  the stream starts answers 502
- the private service worker already treats `/api/*` as network-only

**Client** (`apps/app`) — `useWorkspaceEvents()` over `EventSource("/api/events")`:

- `note.created` / `note.deleted` update the notes list in place; events for a change this tab
  already applied (its own create or delete) are ignored by note id
- `resync` → `router.refresh()`
- `presence` → a "Here now" avatar stack above the list (`useImageFallback`, initials fallback,
  names in `title`, an accessible "3 people here" label; the viewer counted)
- a small "Reconnecting…" indicator after 5 s without a connection
- without JavaScript the page is exactly today's: server-rendered, no live updates
- the event handling is a pure reducer (`applyRealtimeEvent(state, event)`) so it is unit-tested

## 3. Testing, operations, docs

**Testing**

- bus contract, run against `memory` and (with `TEST_DATABASE_URL`) `postgres`: publish/subscribe,
  unsubscribe, an over-limit payload refused, two `postgres` broadcasters on one database hear each
  other
- stream endpoint: 401 / 404; `note.created` arrives after `notes.create`; nothing for a
  rolled-back transaction; ping at the interval (injected clock); the 6th stream per session → 429;
  closed when membership is removed or the session expires; shutdown closes open streams
- presence: two connections of one user count once; join and leave publish snapshots; the client
  merge keeps one snapshot per replica and drops a stale replica after 60 s
- relay: headers, 401 without a session, abort propagates upstream, upstream error → 502
- client reducer: apply, ignore own events, resync, presence merge; the avatar stack via
  `renderToStaticMarkup`
- e2e: two browser contexts, two members of one workspace on `/notes`: A creates a note → it appears
  for B without a reload; both show "2 people here"; B closes → A shows 1

**Operations** — reverse proxies must not buffer `text/event-stream` (the deploying guide gets an
nginx / Caddy note); idle-timeouts above 25 s; the dedicated jobs worker serves no streams. Env:
`REALTIME_BUS` (optional override), `REALTIME_MAX_STREAMS` (default 1000).

**Docs** — CLAUDE.md (a **Realtime.** paragraph, env rows), `apps/api/README.md` (endpoint, bus,
presence), `apps/app/README.md`, `packages/session/README.md` (`createEventsRoute`), a new
`docs/guides/realtime.md` (adding an event type, publishing after commit, subscribing from a page,
scaling with Postgres, proxies), the deploying guide, ROADMAP (tick D).

## Out of scope

Client-to-server messages over the stream; typing indicators and cursors; per-user notification
channels; an event log or replay; realtime in `account` and `auth`; WebSockets.
