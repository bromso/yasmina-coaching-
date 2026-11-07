/**
 * Show-once secrets (a created API key, a webhook signing secret) live only in React state. A page
 * put into the back-forward cache keeps its JavaScript heap, so pressing Back after a full
 * navigation away would show the secret again; the page's `no-store` no longer guarantees the
 * cache is skipped. This calls `discard` (the card remounts its show-once sections) as the page is
 * hidden *into* that cache (`persisted`), never on an ordinary unload. Returns the cleanup, for a
 * `useEffect`. Dependency-free and given its target, so it has a unit test without a DOM.
 */
export function discardOnPersistedPageHide(
  target: {
    addEventListener(type: "pagehide", listener: (event: { persisted: boolean }) => void): void
    removeEventListener(type: "pagehide", listener: (event: { persisted: boolean }) => void): void
  },
  discard: () => void
): () => void {
  const listener = (event: { persisted: boolean }) => {
    if (event.persisted) discard()
  }
  target.addEventListener("pagehide", listener)
  return () => target.removeEventListener("pagehide", listener)
}
