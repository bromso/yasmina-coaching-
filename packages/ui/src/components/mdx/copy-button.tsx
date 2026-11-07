"use client"

import type { MouseEvent } from "react"
import { useEffect, useState } from "react"
import { CopyControls, type CopyStatus } from "./copy-controls"

/**
 * Writes `text` to the clipboard and says whether it worked. `navigator.clipboard` is missing on an
 * insecure origin and in some embedded browsers, and `writeText` rejects when permission is
 * denied or the document lost focus — both are a `false`, never a throw or an unhandled rejection.
 */
export async function copyToClipboard(
  text: string,
  clipboard: Pick<Clipboard, "writeText"> | undefined = globalThis.navigator?.clipboard
): Promise<boolean> {
  if (typeof clipboard?.writeText !== "function") return false
  try {
    await clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * `CodeBlock`'s copy button, as the `actions` slot `CodeBlockFrame` renders next to the `<pre>`.
 * Reads the block's own text at click time (`closest('[data-slot="code-block"]')` then its
 * `<pre>`) rather than holding a ref to it, so `CodeBlockFrame` itself stays a plain component
 * with no state. Renders nothing until mounted (`isHydrated`), so a reader without JavaScript
 * sees no dead control.
 */
export function CopyButton() {
  const [isHydrated, setIsHydrated] = useState(false)
  const [status, setStatus] = useState<CopyStatus>("idle")

  useEffect(() => {
    setIsHydrated(true)
  }, [])

  function handleCopy(event: MouseEvent<HTMLButtonElement>) {
    const frame = event.currentTarget.closest('[data-slot="code-block"]')
    const pre = frame?.querySelector("pre")
    if (!pre) return
    // `innerText` (what the old ref-based `CodeBlock` copied) reflects rendered line breaks the
    // way a reader actually sees them; it needs layout, so it comes back empty without one (a
    // detached or `display:none` node, as in a test) — `textContent` covers that case.
    // biome-ignore lint/performance/useDomNodeTextContent: innerText is deliberate, see above
    const text = pre.innerText || pre.textContent || ""
    void copyToClipboard(text).then((ok) => {
      setStatus(ok ? "copied" : "failed")
      setTimeout(() => setStatus("idle"), 2000)
    })
  }

  if (!isHydrated) return null
  return <CopyControls status={status} onCopy={handleCopy} />
}
