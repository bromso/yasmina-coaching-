# Realtime

A signed-in page can receive live updates from `apps/api` over Server-Sent Events, relayed through
the app's own origin: browsers never call `apps/api`, and the production CSP stays
`connect-src 'self'`. It runs keyless on one node (an in-process bus on SQLite) and scales on
Postgres (`NOTIFY` / `LISTEN`). The working example is `apps/app`'s `/notes`: a note created or
deleted by anyone in the workspace appears or disappears for everyone with the page open, and a
"Here now" row shows who that is. The how and why are in CLAUDE.md (**Realtime**),
`apps/api/README.md` (**Realtime**), `apps/app/README.md` and `packages/session/README.md`; this
guide is about adding your own events, subscribing from another page, and running it in production.
It also covers the per-user notification stream (**Notifications** below).

## The pieces

| Piece | Where |
|---|---|
| Event types (`RealtimeEventSchema`, `workspaceChannel`, `NOTIFY_PAYLOAD_LIMIT`) | `packages/api-contract/src/realtime.ts`, also exported as `@repo/api-contract/realtime` |
| The bus (`Broadcaster`: `memory` / `postgres`) | `apps/api/src/realtime/{broadcaster,memory,postgres,create-broadcaster}.ts` |
| Publishing after a write (`publishAfterCommit`) | `apps/api/src/realtime/after-commit.ts` |
| The stream endpoint and presence | `apps/api/src/realtime/{stream,presence}.ts`, wired in `src/server.ts` |
| The relay (`createEventsRoute`) | `packages/session/src/events.ts` (`@repo/session/events`) |
| The app's route | `apps/app/src/app/api/events/route.ts` |
| The client (reducer, component) | `apps/app/src/lib/realtime.ts`, `apps/app/src/components/live-notes.tsx` and `here-now.tsx` |

## Where the values go

| Running | File |
|---|---|
| `bun dev` / `bun --filter @repo/api dev` | `apps/api/.env` (copy `apps/api/.env.example`) |
| `docker compose up` | `docker-compose.yml` does not pass them, so the defaults apply; add them to the `api` service's `environment` to change them |
| Production | the api service's environment |

| Var | Default | What |
|---|---|---|
| `REALTIME_BUS` | from `DATABASE_URL`: `postgres` for Postgres, `memory` for SQLite | override the bus either way |
| `REALTIME_MAX_STREAMS` | `1000` | open streams one api process holds; the next connection answers `503` |

## Adding an event type

Three places, in this order.

1. **The contract.** Add a member to the discriminated union in
   `packages/api-contract/src/realtime.ts`. Keep the file importing only `./note` (or another small
   schema file), never the contract's index: the browser reaches it through the
   `@repo/api-contract/realtime` subpath, and the full contract must not land in the client bundle.
   Keep the payload small — ids, a kind, a short summary. Every payload is refused at
   `NOTIFY_PAYLOAD_LIMIT` (8000 bytes, `{ channel, event }` serialized) on both buses, so a payload
   that only fits on SQLite never ships.

   ```ts
   z.object({ type: z.literal("note.renamed"), id: z.number().int().positive(), title: z.string() }),
   ```

2. **The publish.** In the procedure, once the write is durable:

   ```ts
   await context.db.notes.rename(key, input.title)
   publishAfterCommit(context, workspaceChannel(context.workspace.id), {
     type: "note.renamed",
     id: input.id,
     title: input.title,
   })
   ```

3. **The reducer.** Add the case to `applyRealtimeEvent` in `apps/app/src/lib/realtime.ts` (the
   `switch` is exhaustive, so the typecheck fails until you do) and a test in `realtime.test.ts`.
   Make it idempotent: the tab that made the change gets its own event too, after its server action
   has already revalidated the page.

Old clients ignore an event they cannot parse (`RealtimeEventSchema.safeParse` fails, the message is
dropped), and so does an older api replica on the Postgres bus (it logs the payload and drops it),
so a rolling deploy that adds a type is safe. Removing or reshaping a type is not: ship
the client that no longer needs it first.

## Publishing after commit

`publishAfterCommit(ctx, channel, event)` is fire-and-forget: it returns at once and never throws, so
a bus failure never fails the request. A failure is logged and recorded through `recordFailure`
(a telemetry `server` row). One refusal is expected rather than a failure: a `note.created` too
large for the payload limit (a body may be 10 000 characters) publishes a `resync` on the channel
instead, so clients re-fetch and still see the note. A new event that can outgrow the limit should
get the same treatment (in `after-commit.ts`) or carry only the id.

Call it only after the write committed. `notes.create` and `notes.delete` write without a
transaction, so they call it after the write returns. Inside `db.transaction(...)`, call it after
the transaction resolves, never inside the callback: a later rollback would leave subscribers
holding an event for a write that never happened.

```ts
const note = await context.db.transaction(async (tx) => {
  /* … writes on tx … */
})
publishAfterCommit(context, workspaceChannel(context.workspace.id), { type: "note.created", note })
```

## Subscribing from a page

The channel is the workspace (`workspace:<id>`), and every member of it receives every event on it;
there are no per-user channels. A page in another signed-in app subscribes in three steps:

1. Copy `apps/app/src/app/api/events/route.ts` (a few lines over `createEventsRoute`, with that app's
   `getAuth()`). The private service worker already treats `/api/*` as network-only, and
   `connect-src 'self'` already allows the relay.
2. Open ``new EventSource(`/api/events?workspace=${workspaceId}`)`` in a client component, with the
   workspace the server rendered — without the parameter the relay follows the `workspace` cookie,
   which another tab can switch under you. Parse each `message` with
   `RealtimeEventSchema.safeParse`, and fold it into state with a pure reducer. Import values only
   from `@repo/api-contract/realtime`; anything else from the contract must be `import type`.
3. Handle `resync` like `LiveNotes` does: every connect sends a `presence` snapshot and then a
   `resync`. Pass the page a server `renderedAt` (`Date.now()` in the server component) and skip
   the first resync after mount only when it arrives within 5 s of it (`shouldRefreshOnResync`):
   a page restored from the back/forward cache or the router cache mounts with an old render and
   must refresh. `router.refresh()` on every later resync — it means the stream was down and may
   have missed events. Never call `router.refresh()` inside a `setState` updater.
4. Recreate a `CLOSED` source — unless the refusal is permanent. `EventSource` retries a dropped
   connection by itself, but gives up for good on a non-OK answer (`401` / `404` / `429` / `502` /
   `503` — an api restart or deploy, a full server, a session or workspace that is simply gone). A
   closed `EventSource` carries no status, so `LiveNotes` probes once with a plain `fetch`
   (`probeStream`, cancelling the body unread) to learn it, then checks it with `refusalFor`: a
   `401` (signed out) or `404` (workspace gone, or membership revoked) will keep failing the same
   way forever, so the caller stops reconnecting and shows a message instead; a 2xx means the
   transient condition already cleared by the time the probe landed, so reconnect at once rather
   than sitting out the backoff queued for the error that triggered the probe; anything else
   (`429`/`502`/`503`, or the probe itself failing over the network) is still transient and gets
   that capped, jittered backoff (`reconnectDelay`: 5 s doubling to 60 s, ±20 %, reset by a
   successful open) with "Reconnecting…" shown while it waits. Clear a stored refusal on a
   successful (re)open and whenever the subscribed id changes (a workspace switch must not show a
   refusal that described the previous one). The decision lives in pure helpers (`connectionOpened`,
   `connectionErrored`, `refusalFor`, `decideAfterProbe`, `probeStream` in `src/lib/realtime.ts`),
   tested without a browser.

Things `LiveNotes` gets right that a copy should keep: presence lives outside the server-rendered
props, so a re-seed after `revalidatePath` or `router.refresh()` keeps it; "Reconnecting…" shows
after 5 s in `CONNECTING`, or at once while a `CLOSED` source waits to be recreated — never an
error; a permanent refusal (`401`/`404`) stops reconnecting instead of backing off forever, and
clears on the next successful open or a change of subscribed id; the list is memoised so the 5 s
presence tick does not re-render it; dates are formatted in a fixed zone (`UTC`) so the server
render, the hydration and a live insert print the same string; without JavaScript the effect never
runs and the page is exactly the server render.

## Presence

Each api process keeps who has a stream open per workspace (several tabs or devices of one user are
one person) and publishes a full snapshot tagged with its random `replicaId` on every join and
leave, and again every 25 s with the ping. Clients merge the latest snapshot per replica and drop a
replica not heard from for 60 s, so a crashed replica's users disappear within a minute. A
snapshot carries `userId`, `name` and `avatarUrl` — never an email — and only members of the
workspace receive it. On several replicas a newcomer learns about users on other replicas from
their next periodic snapshot, so it can take up to 25 s to see everyone; on one replica it is
immediate. Shutdown closes streams without publishing presence: the bus closes right after, and
clients age the replica out. A member's name and avatar in "Here now" are the ones read when the
stream connected; a rename or a new avatar shows on their next reconnect (a reload, or the next
dropped connection). An admin's impersonation stream receives the workspace's events but never
joins presence, so coworkers never see the impersonated user "here" because an admin is looking.

## Scaling

- **One api process on SQLite:** the `memory` bus, in-process fan-out. Correct only for one process,
  which is the SQLite deployment shape anyway.
- **Several replicas: Postgres.** The `postgres` bus has its own client, never the api's pool:
  `new SQL(DATABASE_URL, { max: 1 })` — one connection for the NOTIFYs, plus the dedicated
  connection Bun's `sql.listen` opens for the one `LISTEN realtime`, so two Postgres connections
  per api process. `publish` runs `SELECT pg_notify('realtime', '<json>')`, so every
  replica's subscribers hear every replica's writes. After the `LISTEN` connection reconnects (Bun
  re-subscribes), every channel with a local subscriber gets a `resync`, because notifications sent
  during the gap are lost. A `publish` call after `close()` is a no-op, matching the `memory` bus,
  rather than throwing — so `publishAfterCommit` racing shutdown never records a failure.
- **Every replica publishes its own presence** (see above); there is nothing to share.
- **Connections, not CPU, are the limit.** Each open page holds one HTTP connection through the
  proxy, the Next app and the api. `REALTIME_MAX_STREAMS` caps one api process (default 1000;
  `503` beyond it), a session may hold 5 streams (`429` for the sixth tab) and a user 10 across
  all their sessions (`429`). Size file
  descriptors and the proxy's connection limits accordingly.
- **The dedicated jobs worker serves no streams.** `src/worker.ts` runs only the worker and
  scheduler; streams are served by the api processes.

## Proxies

A proxy in front of the apps must not buffer `text/event-stream`, or events arrive in bursts or not
at all. The relay and the api both send `X-Accel-Buffering: no`, which nginx honours; set it
explicitly anyway:

```nginx
location /api/events {
  proxy_pass http://app;
  proxy_http_version 1.1;
  proxy_set_header Connection "";
  proxy_buffering off;
  proxy_read_timeout 1h;
}
```

```caddyfile
app.example.com {
  reverse_proxy app:3001 {
    flush_interval -1
  }
}
```

Idle timeouts must be above 25 s (the ping interval) everywhere on the path — load balancers often
default to 60 s, which is fine; a 10–20 s timeout drops every quiet stream, and the client
reconnects and resyncs on a loop. The api turns Bun's own 10 s idle timeout off before the stream
is even set up — the guard, the rate limiter and the membership check run first, and a database
round trip there would otherwise be counted as idle — and restores it to its configured value once
the answer turns out not to be a stream (a refused `401` / `404` / `429` / `503`) or the handler
throws, so a keep-alive connection from any of those is still closed like any other idle one.

## Limits and how a stream ends

- **Auth.** The stream (`GET /events/workspaces/:workspaceId`) sits behind the bearer guard and the
  rate limiter like every protected route, plus `x-session-token`. Session and membership are
  checked with the same `resolveSession` / `findMembership` helpers the procedures use (an
  impersonation session needs its admin to still be a superadmin): `401` without a live session,
  `404` for a non-member and an unknown workspace alike. They are re-checked every 60 s; a stream
  whose session expired, whose member was removed, or whose impersonating admin lost the role is
  closed.
- **Per session / per user / per process.** 5 streams per session and 10 per user across sessions
  (`429`), `REALTIME_MAX_STREAMS` per process (`503`), `503` while shutting down. An
  impersonation session may stream (read-only, like its procedures) but is never in presence; its
  stream counts against the impersonating admin's own per-user cap, not the impersonated user's.
- **Slow readers.** Each stream buffers 64 KiB; a client that stops reading is dropped once 256 KiB
  more is queued, and its connection is released within about 4 s (Bun's idle sweep).
- **Server drops error the stream, client drops close it.** A server-side drop (backpressure, a
  failed re-check, shutdown) errors the body so queued bytes are discarded — with no error value,
  because Bun.serve prints a stack trace for a body errored with anything else, and a drop is
  routine; `EventSource` reconnects after 3 s (`retry: 3000`) either way and the `resync` catches it
  up. Nothing is replayed:
  `Last-Event-ID` is accepted and ignored. Each event carries one `id:` (per process), the same on
  every stream that receives it.
- **The relay.** `/api/events?workspace=<id>` streams that workspace (`404` without an upstream
  call unless `<id>` is a positive integer; the api checks the membership); without the parameter
  it uses the `workspace` cookie's. It answers `401` without a user, `503` when the cookie's
  workspace lookup cannot reach the api, `404` without a workspace; it passes an upstream `401` /
  `404` / `429` / `503` through and answers `502` for anything else. When the client's ip is known
  (`x-real-ip` / `x-forwarded-for`, see `docs/guides/deploying.md`), its client id is
  `events:<ip hash>`, so one browser's reconnects count against its own rate-limit bucket; when it
  is not, the relay sends no client id and every browser behind that Next server shares the
  server's address bucket.

## Notifications

Phase 13 A added a second kind of channel on the same bus: one per **user**, for the signed-in
person's own in-app inbox (invited to a workspace, a role change, a workspace now requiring
two-step verification, a ready export, …) rather than per workspace. It reuses almost everything
above — the broadcaster, `publishAfterCommit`, the stream handler's guard, limiter, idle-timeout
handling, ping and re-check — so this section only covers what differs. The full data model,
emitters and retention are in CLAUDE.md's **Notifications.** paragraph and
`apps/api/README.md`'s **Notifications** section; this is the realtime slice.

- **Adding a notification type.** Add it to `NOTIFICATION_TYPES` and its strict schema to
  `NOTIFICATION_DATA_SCHEMAS` (`packages/api-contract/src/notifications{,-schema}.ts`) — `data`
  is ids and display names only, never an email, a token or a secret — then call `notifyUser(ctx,
  userId, type, data, { tx?, workspaceId? })` (`apps/api/src/notifications.ts`) from the procedure
  or job that makes the change, inside its own transaction when it has one.
- **Recipients.** `notifyUser` only writes the row and announces it; the caller decides who gets
  one. Every emitter skips the actor (`isActor(context, userId)` — the session's own user, or, on
  an impersonation session, the impersonating admin), so nobody is told about their own action,
  and an impersonator is never told on the impersonated user's behalf.
- **The stream.** `GET /events/me` is the per-user twin of `GET /events/workspaces/:id`: same
  guard, limiter, session resolution, idle-timeout handling, ping and 60 s re-check, `resync` on
  connect, no presence. It hears only `userChannel(userId)` = `user:<id>`, and keeps **its own**
  per-session (5) and per-user (10) counters, apart from the workspace stream's — counting the two
  together would halve how many `/notes` tabs fit in one session, since each then opens two
  streams — while the process-wide `REALTIME_MAX_STREAMS` cap stays shared by both kinds. An
  impersonation session hears the impersonated user's own channel, never the admin's, and counts
  against the admin's caps. `@repo/session`'s `createUserEventsRoute` relays it exactly as
  `createEventsRoute` relays a workspace stream, but with no workspace lookup, and `apps/app`'s
  `src/app/api/events/me/route.ts` is the few lines over it. Only `apps/app` subscribes live
  (`LiveNotificationRefresh`, debounced `router.refresh()` on `notification.created`); `apps/auth`
  and `apps/account` render the same header bell but refresh its count on a full load or a server
  action's `refresh()`, not by streaming.

## Out of scope

Client-to-server messages over the stream; typing indicators and cursors; an event log or replay;
realtime in `account` and `auth` (their notification bell does not stream, see **Notifications**
above); WebSockets.
