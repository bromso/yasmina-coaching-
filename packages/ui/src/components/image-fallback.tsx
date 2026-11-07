"use client"

import type { RefObject } from "react"
import { useEffect, useRef, useState } from "react"

/**
 * True once a (possibly already-finished) image load has failed. Pulled out as a pure function so
 * the decision — not the DOM wiring around it — can be unit tested without a browser: a real
 * `HTMLImageElement` reports this through `complete` and `naturalWidth` once the browser is done
 * with the request, load or error alike (a successful load never leaves `naturalWidth` at 0).
 */
export function imageFailed(img: { complete: boolean; naturalWidth: number }): boolean {
  return img.complete && img.naturalWidth === 0
}

export type ImageFallback = {
  /** Attach to the `<img>` so the mount effect can read its post-hydration state. */
  ref: RefObject<HTMLImageElement | null>
  /** Once true, render a fallback (initials, a letter tile, …) instead of the `<img>`. */
  failed: boolean
  /** Attach to the `<img>`'s `onError`, for a failure that happens after hydration. */
  onError: () => void
}

/**
 * Tracks whether a server-rendered `<img src>` has failed to load, including a load that
 * finished *before* hydration ever attached `onError`: a fast local 404 (a stale upload — the
 * file the server rendered has since been removed, on a page that loaded before the removal) can
 * resolve before React mounts, which would otherwise leave a broken image on screen with nothing
 * left to catch it. The mount effect re-checks the element's own `complete` / `naturalWidth` —
 * properties the browser keeps regardless of when, or whether, a listener was ever attached — and
 * treats a changed `src` as a fresh attempt worth re-checking the same way.
 */
export function useImageFallback(src: string | null | undefined): ImageFallback {
  const ref = useRef<HTMLImageElement>(null)
  const [failed, setFailed] = useState(false)

  // biome-ignore lint/correctness/useExhaustiveDependencies: src is the resync trigger, unread here
  useEffect(() => {
    setFailed(false)
    const img = ref.current
    if (img && imageFailed(img)) setFailed(true)
  }, [src])

  return { ref, failed, onError: () => setFailed(true) }
}
