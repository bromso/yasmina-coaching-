"use client"

import { track } from "@repo/telemetry/analytics"
import { type ReactNode, useEffect, useRef } from "react"

/**
 * Wraps `onVisible` so it fires at most once across any number of IntersectionObserver callbacks
 * — pulled out of the component so the once-per-page-load rule is testable without a DOM.
 */
export function createOnceVisible(
  onVisible: () => void
): (entries: { isIntersecting: boolean }[]) => void {
  let sent = false
  return (entries) => {
    if (sent) return
    if (entries.some((entry) => entry.isIntersecting)) {
      sent = true
      onVisible()
    }
  }
}

// Module-level, not component or `createOnceVisible` state: `PricingViewTracker` remounts on a
// client-side navigation away from "/" and back (the home page's component tree is torn down and
// rebuilt), which would otherwise reset `createOnceVisible`'s own flag and fire a second
// `pricing_viewed` for the same page load. This one survives remounts, and resets only on a real
// reload, when the module itself is re-evaluated from scratch.
let trackedThisLoad = false

/**
 * Fires the `pricing_viewed` client event (see `ANALYTICS_EVENTS`) once per page load when its
 * child scrolls into view. Wraps the shared `Pricing` block rather than living inside it — that
 * block stays content-agnostic and framework-agnostic — so this is the one place www opts into
 * the IntersectionObserver. `"use client"`, but renders exactly its children with no interactivity
 * of its own, so the page around it stays static (`○` in the build output).
 */
export function PricingViewTracker({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || trackedThisLoad || typeof IntersectionObserver === "undefined") return
    const onVisible = createOnceVisible(() => {
      trackedThisLoad = true
      track("pricing_viewed")
    })
    const observer = new IntersectionObserver((entries) => onVisible(entries), { threshold: 0.5 })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return <div ref={ref}>{children}</div>
}
