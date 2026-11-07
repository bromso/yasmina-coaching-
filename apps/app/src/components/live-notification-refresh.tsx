"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import {
  connectionErrored,
  connectionOpened,
  decideAfterProbe,
  initialConnection,
  probeStream,
  shouldRefreshOnResync,
} from "@/lib/realtime"
import { NOTIFICATION_REFRESH_DEBOUNCE_MS, userStreamEventType } from "@/lib/user-stream"

const STREAM_URL = "/api/events/me"

/**
 * Keeps the header's notification bell current: follows the signed-in user's own stream
 * (`GET /api/events/me`) and, on `notification.created`, calls `router.refresh()` — debounced, so
 * a burst of notifications re-renders the server layout (and the bell's count) once. Renders
 * nothing and never shows a toast or any other interruption: the badge is the only signal.
 *
 * A reconnect's `resync` refreshes too (notifications in the gap were missed), except the first
 * one after mount while the render is fresh (`shouldRefreshOnResync`, as `LiveNotes` decides it).
 * A closed stream is probed once, like `LiveNotes`: a 401/403/404 stops it for good, a 2xx
 * reconnects at once, anything else waits out the capped, jittered backoff. Without JavaScript
 * nothing runs, and the bell still shows the count rendered with the page.
 */
export function LiveNotificationRefresh({ renderedAt }: { renderedAt: number }) {
  const router = useRouter()
  // Read by the stream's callbacks; written after each commit, never during render.
  const renderedAtRef = useRef(renderedAt)
  useEffect(() => {
    renderedAtRef.current = renderedAt
  })

  useEffect(() => {
    let source: EventSource | undefined
    let stopped = false
    let connection = initialConnection
    let retryTimer: ReturnType<typeof setTimeout> | undefined
    let refreshTimer: ReturnType<typeof setTimeout> | undefined

    const scheduleRefresh = () => {
      if (refreshTimer !== undefined) return
      refreshTimer = setTimeout(() => {
        refreshTimer = undefined
        if (!stopped) router.refresh()
      }, NOTIFICATION_REFRESH_DEBOUNCE_MS)
    }

    const connect = () => {
      const current = new EventSource(STREAM_URL)
      source = current

      current.onopen = () => {
        connection = connectionOpened(connection)
      }

      current.onerror = () => {
        const next = connectionErrored(connection, current.readyState === EventSource.CLOSED)
        connection = next.state
        if (next.retryInMs === null) return // the browser is retrying by itself
        const retryInMs = next.retryInMs
        current.close()
        void probeStream(STREAM_URL).then((status) => {
          if (stopped) return
          const decision = decideAfterProbe(status)
          if (decision.action === "refuse") {
            stopped = true
            return
          }
          if (decision.action === "reconnect") {
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
        const type = userStreamEventType(messageEvent.data)
        if (type === "notification.created") {
          scheduleRefresh()
          return
        }
        if (
          type === "resync" &&
          shouldRefreshOnResync({
            opens: connection.opens,
            renderedAt: renderedAtRef.current,
            now: Date.now(),
          })
        ) {
          scheduleRefresh()
        }
      }
    }
    connect()

    return () => {
      stopped = true
      clearTimeout(retryTimer)
      clearTimeout(refreshTimer)
      source?.close()
    }
  }, [router])

  return null
}
