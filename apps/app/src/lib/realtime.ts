import type { Note } from "@repo/api-contract"
import type { PresenceMember, RealtimeEvent } from "@repo/api-contract/realtime"

// Type-only imports above are erased at build time, so they do not pull `@repo/api-contract`'s
// full index (auth, billing, admin, …) into the client bundle `live-notes.tsx` ships this file
// into — only the value imports in that file matter, and those come from the `/realtime` subpath.

/** One replica's latest presence snapshot, and when this client last heard it. */
type PresenceSnapshot = { members: PresenceMember[]; seenAt: number }

export type LiveState = {
  notes: Note[]
  firstPage: boolean
  presence: Record<string, PresenceSnapshot>
}

/** A replica unheard from this long is dropped from the "Here now" merge (design doc §2). */
const PRESENCE_TTL_MS = 60_000

/**
 * The pure half of `LiveNotes`: folds one realtime event into the current state, or returns
 * `"resync"` when the caller should `router.refresh()` instead. `note.created` only prepends on
 * the first page (an older page never gains a note that was never on it) and only once — the
 * author's own create arrives twice, through `revalidatePath` (already in `state.notes` by the
 * time the event lands) and through this event. `note.deleted` removes by id on any page.
 */
export function applyRealtimeEvent(
  state: LiveState,
  event: RealtimeEvent,
  now: number
): LiveState | "resync" {
  switch (event.type) {
    case "note.created": {
      if (!state.firstPage) return state
      if (state.notes.some((note) => note.id === event.note.id)) return state
      return { ...state, notes: [event.note, ...state.notes] }
    }
    case "note.deleted": {
      if (!state.notes.some((note) => note.id === event.id)) return state
      return { ...state, notes: state.notes.filter((note) => note.id !== event.id) }
    }
    case "presence":
      return {
        ...state,
        presence: {
          ...state.presence,
          [event.replicaId]: { members: event.members, seenAt: now },
        },
      }
    case "resync":
      return "resync"
  }
}

/** Every present member, merged across replicas' snapshots and de-duplicated by `userId`. */
export function presentMembers(state: LiveState, now: number): PresenceMember[] {
  const byUser = new Map<number, PresenceMember>()
  for (const snapshot of Object.values(state.presence)) {
    if (now - snapshot.seenAt >= PRESENCE_TTL_MS) continue
    for (const member of snapshot.members) byUser.set(member.userId, member)
  }
  return [...byUser.values()]
}

/** How old a server render may be for the first resync to count as already caught up. */
export const FRESH_RENDER_MS = 5_000

/**
 * Every (re)connect sends a `presence` snapshot and then a `resync`. The first resync after
 * `LiveNotes` mounts is a no-op only when the list on screen is fresh — rendered by the server
 * (`renderedAt`, its clock, in ms) within `FRESH_RENDER_MS` of the resync's arrival. A page
 * restored from the back/forward cache or the client router's cache mounts with an old render, so
 * its first resync still refreshes. Any later resync follows a reconnect, after which the stream
 * may have missed `note.created` / `note.deleted` events, so it always refreshes. `opens` counts
 * how many times a stream has reached `OPEN` since mount (across recreated EventSources): 1 for the
 * first connection, 2+ after any reconnect. The age is compared in both directions, so a browser
 * clock a little behind the server's still counts a fresh render as fresh; a clock far off either
 * way only costs a refresh.
 */
export function shouldRefreshOnResync(input: {
  opens: number
  renderedAt: number
  now: number
}): boolean {
  if (input.opens > 1) return true
  return Math.abs(input.now - input.renderedAt) > FRESH_RENDER_MS
}

export const RECONNECT_BASE_MS = 5_000
export const RECONNECT_MAX_MS = 60_000
const RECONNECT_JITTER = 0.2

/**
 * How long to wait before recreating an EventSource that reached CLOSED — which only happens on a
 * non-OK answer (401/404/429/502/503: the browser itself retries only network errors). `failures`
 * counts consecutive closes since the last successful open, starting at 0: 5 s, 10 s, 20 s, 40 s,
 * then 60 s, each ±20 % so a fleet of tabs cut off by one deploy does not come back in lockstep.
 */
export function reconnectDelay(failures: number, random: () => number = Math.random): number {
  const base = Math.min(RECONNECT_BASE_MS * 2 ** Math.max(0, failures), RECONNECT_MAX_MS)
  return Math.round(base * (1 - RECONNECT_JITTER + 2 * RECONNECT_JITTER * random()))
}

/** One mount's connection bookkeeping, across every EventSource it creates. */
export type ConnectionState = { opens: number; failures: number }

export const initialConnection: ConnectionState = { opens: 0, failures: 0 }

/** A stream opened: count it, and a later close starts the backoff from 5 s again. */
export function connectionOpened(state: ConnectionState): ConnectionState {
  return { opens: state.opens + 1, failures: 0 }
}

/**
 * A stream reported an error. While the browser is retrying by itself (`CONNECTING`) nothing
 * changes: `retryInMs` is null. Once it gave up (`CLOSED`), the caller recreates it after
 * `retryInMs` and shows "Reconnecting…" meanwhile.
 */
export function connectionErrored(
  state: ConnectionState,
  closed: boolean,
  random: () => number = Math.random
): { state: ConnectionState; retryInMs: number | null } {
  if (!closed) return { state, retryInMs: null }
  return {
    state: { ...state, failures: state.failures + 1 },
    retryInMs: reconnectDelay(state.failures, random),
  }
}

/** Whether there is any presence data yet — lets the caller skip a pointless re-render tick. */
export function hasPresence(state: LiveState): boolean {
  return Object.keys(state.presence).length > 0
}

/** Why a closed stream should stop reconnecting, or `null` to keep the existing backoff. */
export type StreamRefusal = "signedOut" | "twoFactorRequired" | "gone" | null

/**
 * The relay (`createEventsRoute()` in `@repo/session/events`) passes an upstream 401 (no
 * session — the browser signed out), 403 (the workspace requires two-step verification and the
 * caller has turned on neither it nor a passkey) or 404 (no workspace — deleted, or membership
 * revoked) straight through; everything else it can refuse (429, or a 502/503 it maps an
 * unexpected upstream status or its own failure to) is transient. A 401, 403 or 404 will keep
 * failing the same way on every retry — a 403 until the user sets up two-step on the account
 * app, after which a reload renders the page again — so the caller stops instead of backing off
 * forever; anything else keeps today's reconnect behavior unchanged.
 */
export function refusalFor(status: number): StreamRefusal {
  switch (status) {
    case 401:
      return "signedOut"
    case 403:
      return "twoFactorRequired"
    case 404:
      return "gone"
    default:
      return null
  }
}

/** What `LiveNotes` should do once a probe (following a closed stream) answers. */
export type ProbeDecision =
  | { action: "refuse"; refusal: Exclude<StreamRefusal, null> }
  | { action: "reconnect" }
  | { action: "wait" }

/**
 * Turns a probe's status (`null` on a network error) into what the caller should do next: stop
 * for good on a permanent refusal (`refusalFor`); reconnect at once on a 2xx, since that means the
 * transient condition which caused the original error already cleared, so there is no reason to
 * sit out the backoff queued for it; otherwise wait out that backoff, unchanged.
 */
export function decideAfterProbe(status: number | null): ProbeDecision {
  const refusal = status === null ? null : refusalFor(status)
  if (refusal) return { action: "refuse", refusal }
  if (status !== null && status >= 200 && status < 300) return { action: "reconnect" }
  return { action: "wait" }
}

/** The narrow shape `probeStream` needs from `fetch` — just enough for a test fake to provide. */
type FetchLike = (url: string) => Promise<Response>

/**
 * GETs `url` to learn only its status, then cancels the body at once without reading it — a
 * closed `EventSource` gives no status, so this is how `LiveNotes` finds out why a stream just
 * closed before deciding whether to keep reconnecting. `null` on a network error, which the
 * caller treats the same as a status `refusalFor` does not recognize (keep retrying).
 */
export async function probeStream(
  url: string,
  fetchImpl: FetchLike = fetch
): Promise<number | null> {
  try {
    const response = await fetchImpl(url)
    // Fire-and-forget: a rejecting cancel (the stream already errored, or the body was never
    // readable) must never surface as an unhandled rejection — the caller only wants the status.
    void response.body?.cancel().catch(() => {})
    return response.status
  } catch {
    return null
  }
}
