"use client"

import type { Note } from "@repo/api-contract"
import { RealtimeEventSchema } from "@repo/api-contract/realtime"
import type { Locale } from "@repo/i18n/locales"
import { SignInLink } from "@repo/ui/components/sign-in-link"
import { useRouter } from "next/navigation"
import { useTranslations } from "next-intl"
import { memo, useEffect, useRef, useState } from "react"
import { HereNow } from "@/components/here-now"
import { NoteList, type NoteListViewer } from "@/components/note-list"
import {
  applyRealtimeEvent,
  connectionErrored,
  connectionOpened,
  decideAfterProbe,
  hasPresence,
  initialConnection,
  type LiveState,
  presentMembers,
  probeStream,
  type StreamRefusal,
  shouldRefreshOnResync,
} from "@/lib/realtime"

// `Note` above is type-only (erased at build time) — this file's only value import from
// `@repo/api-contract` is the `/realtime` subpath, so the full contract (auth, billing, admin, …)
// never reaches the client bundle. See `lib/realtime.ts`'s own note.

/** How long a stream may sit in CONNECTING (the browser's own retries) before "Reconnecting…". */
const RECONNECT_NOTICE_MS = 5_000
const PRESENCE_TICK_MS = 5_000

// Memoised: the 5 s presence tick re-renders `LiveNotes` only to age "Here now"; the list's props
// (`state.notes`, `older`, the server-sent `viewer`) are unchanged by it.
const MemoNoteList = memo(NoteList)

/**
 * Wraps the server-rendered notes list with live updates from `GET /api/events`: a note created
 * or deleted anywhere in the workspace appears or disappears without a reload, and a "Here now"
 * row shows who else has the page open. Without JavaScript, the effect below never runs and the
 * markup is exactly what `NoteList` renders on the server — nothing here changes that.
 *
 * `renderedAt` is the server's `Date.now()` for this render: the first resync after mount skips
 * its refresh only when the render is that fresh (see `shouldRefreshOnResync`). The stream asks
 * for `viewer.workspaceId` explicitly, so a tab keeps following the workspace it shows even after
 * another tab switches the `workspace` cookie. `locale` is the page's, for the note dates.
 */
export function LiveNotes({
  notes,
  firstPage,
  older,
  viewer,
  renderedAt,
  locale,
  authUrl,
  signInNext,
}: {
  notes: Note[]
  firstPage: boolean
  older: boolean
  viewer: NoteListViewer
  renderedAt: number
  locale: Locale
  /** Origin of the auth app, for the sign-in link shown after a 401 ends the stream for good. */
  authUrl: string
  /** Where that link should return to — the same URL the header's own `SignInLink` carries. */
  signInNext: string
}) {
  const t = useTranslations("app.notes")
  const tSignIn = useTranslations("app.invitations")
  const router = useRouter()
  const [state, setState] = useState<LiveState>(() => ({ notes, firstPage, presence: {} }))

  // Re-seed `notes`/`firstPage` when the server sends new ones — after a revalidating server
  // action (create/delete) or a `router.refresh()` from a later resync. This runs during render
  // (React's documented "adjusting state when a prop changes" pattern), not a ref written as a
  // side effect of rendering: a ref mutated mid-render would stick even if React discards that
  // render (e.g. a Suspense/transition retry), leaving the tracker out of sync with what actually
  // committed. `presence` is deliberately left untouched — it comes from the stream, not from the
  // server-rendered props, and must survive every re-seed (see the stream's own presence snapshot
  // sent on every connect, folded in below).
  const [prevProps, setPrevProps] = useState({ notes, firstPage })
  if (prevProps.notes !== notes || prevProps.firstPage !== firstPage) {
    setPrevProps({ notes, firstPage })
    setState((prev) => ({ ...prev, notes, firstPage }))
  }

  const [reconnecting, setReconnecting] = useState(false)
  // Set once a closed stream turns out to be permanently refused (401/404); from then on the
  // effect below never reconnects again, so this never resets on its own.
  const [refusal, setRefusal] = useState<StreamRefusal>(null)
  const [, forceTick] = useState(0)
  // Read by the stream's callbacks, which live as long as the effect; written after each commit,
  // never during render.
  const stateRef = useRef(state)
  const renderedAtRef = useRef(renderedAt)
  useEffect(() => {
    stateRef.current = state
    renderedAtRef.current = renderedAt
  })

  const workspaceId = viewer.workspaceId

  useEffect(() => {
    // A new workspace (switched via `UserMenu`, which re-targets this effect in place) starts
    // clean: an earlier permanent refusal described the previous workspace and must not linger
    // as a stale, now wrongly-labelled banner over a stream that is about to open normally.
    setRefusal(null)
    const url = `/api/events?workspace=${workspaceId}`
    let source: EventSource | undefined
    let stopped = false
    let connection = initialConnection
    let noticeTimer: ReturnType<typeof setTimeout> | undefined
    let retryTimer: ReturnType<typeof setTimeout> | undefined

    const clearNotice = () => {
      clearTimeout(noticeTimer)
      noticeTimer = undefined
    }
    const armNotice = () => {
      // Already counting down from when the source first entered CONNECTING — `retry: 3000`
      // means the browser retries every 3 s, and resetting the clock on each failed retry would
      // mean the message never shows during a longer outage.
      if (noticeTimer !== undefined) return
      noticeTimer = setTimeout(() => {
        noticeTimer = undefined
        if (source?.readyState === EventSource.CONNECTING) setReconnecting(true)
      }, RECONNECT_NOTICE_MS)
    }

    const connect = () => {
      const current = new EventSource(url)
      source = current
      armNotice()

      current.onopen = () => {
        connection = connectionOpened(connection)
        clearNotice()
        setReconnecting(false)
        setRefusal(null)
      }

      current.onerror = () => {
        const next = connectionErrored(connection, current.readyState === EventSource.CLOSED)
        connection = next.state
        if (next.retryInMs === null) {
          armNotice()
          return
        }
        // A non-OK answer (401/404/429/502/503 — an api restart or deploy, a full server): the
        // browser will not retry by itself. A 401 (signed out) or 404 (workspace gone, or no
        // longer a member) will keep failing the same way forever, so probe once to tell those
        // apart from a transient 429/502/503 before deciding whether to back off and retry.
        const retryInMs = next.retryInMs
        current.close()
        clearNotice()
        setReconnecting(true)
        void probeStream(url).then((status) => {
          if (stopped) return
          const decision = decideAfterProbe(status)
          if (decision.action === "refuse") {
            setReconnecting(false)
            setRefusal(decision.refusal)
            return
          }
          if (decision.action === "reconnect") {
            // The transient condition already cleared by the time the probe landed — reconnect
            // now rather than sitting out the backoff queued for the error that triggered it.
            connect()
            return
          }
          retryTimer = setTimeout(() => {
            retryTimer = undefined
            if (!stopped) connect()
          }, retryInMs)
        })
      }

      current.onmessage = (messageEvent) => {
        let data: unknown
        try {
          data = JSON.parse(messageEvent.data)
        } catch {
          return
        }
        const parsed = RealtimeEventSchema.safeParse(data)
        if (!parsed.success) return

        if (parsed.data.type === "resync") {
          // A side effect (router.refresh()) must not run inside a setState updater — React may
          // invoke it more than once (StrictMode) or for a render that never commits — so this is
          // decided here, before touching state.
          const refresh = shouldRefreshOnResync({
            opens: connection.opens,
            renderedAt: renderedAtRef.current,
            now: Date.now(),
          })
          if (refresh) router.refresh()
          return
        }

        setState((prev) => applyRealtimeEvent(prev, parsed.data, Date.now()) as LiveState)
      }
    }
    connect()

    // Presence snapshots expire on a clock, independent of new events: tick so a replica that
    // stops sending still drops out of "Here now" after 60 s even with nothing new to apply.
    // Skipped entirely while there is no presence data yet, so this never re-renders for nothing.
    const presenceTicker = setInterval(() => {
      if (hasPresence(stateRef.current)) forceTick((n) => n + 1)
    }, PRESENCE_TICK_MS)

    return () => {
      stopped = true
      clearNotice()
      clearTimeout(retryTimer)
      clearInterval(presenceTicker)
      source?.close()
    }
  }, [router, workspaceId])

  const members = presentMembers(state, Date.now())

  return (
    <div className="grid gap-4">
      {refusal === "signedOut" && (
        <div className="flex flex-wrap items-center gap-2">
          <p role="status" className="text-muted-foreground text-sm">
            {t("live.signedOut")}
          </p>
          <SignInLink authUrl={authUrl} next={signInNext} label={tSignIn("signIn")} />
        </div>
      )}
      {refusal === "twoFactorRequired" && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("live.twoFactorRequired")}
        </p>
      )}
      {refusal === "gone" && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("live.gone")}
        </p>
      )}
      {!refusal && reconnecting && (
        <p role="status" className="text-muted-foreground text-sm">
          {t("reconnecting")}
        </p>
      )}
      <HereNow members={members} />
      <MemoNoteList notes={state.notes} older={older} viewer={viewer} locale={locale} />
    </div>
  )
}
