/**
 * A minimal SSE reader over `fetch`, no dependency. `SseParser` turns chunks of a response body
 * into complete events (`event:` / `data:` / `id:` lines, a multi-line `data:` joined by "\n" as
 * the spec requires, a blank line terminating the event) and comments (a line starting with `:`,
 * such as the realtime stream's `: ping` keepalive) — pure, fed strings, no IO, so it is the part
 * this package unit-tests directly. `readEvents` drives a real `Response`'s body through one,
 * timestamping each event the instant its terminating blank line is seen (not when `fetch`
 * resolved), which is what a write→delivery latency measurement needs.
 */

export type SseEvent = { event: string; data: string; id?: string }
export type ParsedItem = { kind: "event"; value: SseEvent } | { kind: "comment"; value: string }

export class SseParser {
  #buffer = ""
  #event = ""
  #data: string[] = []
  #id: string | undefined

  /** Feeds one chunk of decoded text; returns the events/comments it completes, in order. */
  push(chunk: string): ParsedItem[] {
    this.#buffer += chunk
    const out: ParsedItem[] = []
    for (;;) {
      const newline = this.#buffer.indexOf("\n")
      if (newline === -1) break
      const raw = this.#buffer.slice(0, newline)
      this.#buffer = this.#buffer.slice(newline + 1)
      const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw
      if (line === "") {
        // The SSE spec only dispatches a message when the data buffer is non-empty: a block that
        // carries only `retry:`, `id:` or `event:` (no `data:`) produces nothing, same as a
        // browser's EventSource.
        if (this.#data.length > 0) {
          out.push({
            kind: "event",
            value: { event: this.#event || "message", data: this.#data.join("\n"), id: this.#id },
          })
        }
        this.#event = ""
        this.#data = []
        this.#id = undefined
        continue
      }
      if (line.startsWith(":")) {
        out.push({ kind: "comment", value: line.slice(1).trimStart() })
        continue
      }
      const colon = line.indexOf(":")
      const field = colon === -1 ? line : line.slice(0, colon)
      let value = colon === -1 ? "" : line.slice(colon + 1)
      if (value.startsWith(" ")) value = value.slice(1)
      if (field === "event") this.#event = value
      else if (field === "data") this.#data.push(value)
      else if (field === "id") this.#id = value
      // "retry:" and any unrecognised field are ignored: no scenario needs them.
    }
    return out
  }
}

export type TimedSseEvent = SseEvent & { receivedAt: number }

/**
 * Drives `response.body` through a fresh `SseParser`, calling `onEvent` the instant each event's
 * blank-line terminator arrives, stamped with `now()` (default `performance.now()`) at that
 * moment. Resolves when the body ends (server close) or `signal` aborts; always releases the
 * reader. Comments (`: ping`) go to `onComment` when given, otherwise are dropped.
 *
 * On abort this calls the reader's own `cancel()` rather than relying on the *response*'s own
 * `AbortSignal` (the one, if any, given to `fetch` itself): cancelling the reader resolves a
 * blocked `read()` with `{ done: true }`, the spec's clean teardown, while aborting the fetch's
 * own signal would reject that same `read()` with an `AbortError` — exactly the kind of error a
 * caller's scenario has to remember to swallow. Give `readEvents` its own signal for "stop
 * reading"; keep the fetch's signal (if any) for "cancel the request before it even answered".
 */
export async function readEvents(
  response: Response,
  onEvent: (event: TimedSseEvent) => void,
  {
    onComment,
    now = () => performance.now(),
    signal,
  }: { onComment?: (comment: string) => void; now?: () => number; signal?: AbortSignal } = {}
): Promise<void> {
  const body = response.body
  if (!body) throw new Error("readEvents: response has no body")
  const reader = body.getReader()
  const decoder = new TextDecoder()
  const parser = new SseParser()
  const onAbort = () => {
    reader.cancel().catch(() => {})
  }
  signal?.addEventListener("abort", onAbort)
  try {
    if (signal?.aborted) return
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return
      for (const item of parser.push(decoder.decode(value, { stream: true }))) {
        if (item.kind === "event") onEvent({ ...item.value, receivedAt: now() })
        else onComment?.(item.value)
      }
    }
  } finally {
    signal?.removeEventListener("abort", onAbort)
    // `cancel()` never throws synchronously; on an already-errored or already-cancelled stream
    // it returns a promise *rejected* with that stream's error, so this must await it (with its
    // own `.catch`) rather than just calling it, or that rejection goes unhandled.
    await reader.cancel().catch(() => {})
  }
}
