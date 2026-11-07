"use client"

import { sendPageview } from "@repo/telemetry/analytics"
import { usePathname } from "next/navigation"
import { useEffect, useRef } from "react"

/**
 * Drop into any app's root layout next to `<WebVitals />` / `<BrowserTelemetry />`: one pageview
 * on mount and one on every client-side navigation (`usePathname()` change). Deliberately never
 * `useSearchParams` — that would force a Suspense boundary or a client-render bailout and could
 * make a static app's pages dynamic, and the query string must never leave the browser anyway.
 * The first pageview sends `document.referrer`; every later navigation sends `""` (the previous
 * page was this app itself, so the route the visitor came from is already known server-side).
 * Nothing in development and nothing with Do Not Track — both handled inside `sendPageview`
 * itself, the one place that gate lives.
 */
export function Analytics(): null {
  const pathname = usePathname()
  const first = useRef(true)
  useEffect(() => {
    const referrer = first.current ? document.referrer : ""
    first.current = false
    sendPageview(pathname, referrer)
  }, [pathname])
  return null
}
