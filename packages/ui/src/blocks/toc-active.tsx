"use client"

import { activeHeadingId, fragmentId, headingPositions } from "@repo/ui/lib/active-heading"
import { cn } from "@repo/ui/lib/utils"
import { type ReactNode, useEffect, useRef } from "react"

/** The reading band: the top 30% of the viewport below a sticky header's worth of space (64px). A
 * heading in it marks its section as the one being read. */
const BAND_TOP = 64
const BAND_BOTTOM_PERCENT = 30
const ROOT_MARGIN = `-${BAND_TOP}px 0px -${100 - BAND_BOTTOM_PERCENT}% 0px`

export type TocActiveProps = {
  /** The table of contents to enhance — normally `<Toc items={…} />`, rendered on the server. */
  children: ReactNode
  className?: string
}

/**
 * An opt-in enhancement around a server-rendered `Toc`: once hydrated, it watches the headings its
 * links point at with an `IntersectionObserver` and marks the link of the section being read with
 * `aria-current="location"` (styled here, as the current link), re-measuring on every observer
 * callback and once per animation frame while the page scrolls. Without JavaScript — or before
 * hydration — the table of contents is the plain list `Toc` rendered; nothing else changes.
 */
export function TocActive({ children, className }: TocActiveProps) {
  const ref = useRef<HTMLDivElement>(null)

  // Re-run when the table of contents changes: a client-side navigation to another page keeps
  // this component mounted and swaps its children (the links and the headings they point at).
  // biome-ignore lint/correctness/useExhaustiveDependencies: `children` is the trigger, not read.
  useEffect(() => {
    const root = ref.current
    if (!root || typeof IntersectionObserver === "undefined") return

    const links = new Map<string, HTMLAnchorElement>()
    for (const link of root.querySelectorAll<HTMLAnchorElement>("a[href^='#']")) {
      const id = fragmentId(link.getAttribute("href") ?? "")
      if (id && !links.has(id)) links.set(id, link)
    }
    const headings = [...links.keys()]
      .map((id) => document.getElementById(id))
      .filter((heading): heading is HTMLElement => heading !== null)
    if (headings.length === 0) return

    const ids = headings.map((heading) => heading.id)
    let current: string | undefined

    // Every heading is measured afresh each time, never pieced together from observer entries: an
    // entry only reports a crossing, so a jump (a hash link, Home/End, a scrollbar drag) that
    // carries a heading from below the band to above it in one step would leave it stale.
    const mark = () => {
      const positions = headingPositions(
        headings.map((heading) => ({ id: heading.id, top: heading.getBoundingClientRect().top })),
        { top: BAND_TOP, bottom: (window.innerHeight * BAND_BOTTOM_PERCENT) / 100 }
      )
      const next = activeHeadingId(ids, positions)
      if (next === current) return
      if (current) links.get(current)?.removeAttribute("aria-current")
      if (next) links.get(next)?.setAttribute("aria-current", "location")
      current = next
    }

    // The observer catches a heading crossing the band; the scroll listener (one measurement per
    // frame) catches everything the observer does not report.
    const observer = new IntersectionObserver(mark, { rootMargin: ROOT_MARGIN })
    for (const heading of headings) observer.observe(heading)
    let frame = 0
    const onScroll = () => {
      if (frame) return
      frame = requestAnimationFrame(() => {
        frame = 0
        mark()
      })
    }
    window.addEventListener("scroll", onScroll, { passive: true })

    return () => {
      observer.disconnect()
      window.removeEventListener("scroll", onScroll)
      if (frame) cancelAnimationFrame(frame)
      if (current) links.get(current)?.removeAttribute("aria-current")
    }
  }, [children])

  return (
    <div
      ref={ref}
      data-slot="toc-active"
      className={cn(
        "[&_a[aria-current=location]]:font-medium [&_a[aria-current=location]]:text-foreground",
        className
      )}
    >
      {children}
    </div>
  )
}
