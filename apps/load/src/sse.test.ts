import { describe, expect, test } from "bun:test"
import { readEvents, SseParser } from "./sse"

describe("SseParser", () => {
  test("parses a single event split across two chunks", () => {
    const parser = new SseParser()
    expect(parser.push("event: message\nda")).toEqual([])
    expect(parser.push('ta: {"a":1}\n\n')).toEqual([
      { kind: "event", value: { event: "message", data: '{"a":1}', id: undefined } },
    ])
  })

  test("joins multi-line data with \\n, in order", () => {
    const parser = new SseParser()
    const items = parser.push("data: line one\ndata: line two\n\n")
    expect(items).toEqual([
      { kind: "event", value: { event: "message", data: "line one\nline two", id: undefined } },
    ])
  })

  test("defaults event to 'message' when no event: line is sent, and carries id:", () => {
    const parser = new SseParser()
    const items = parser.push("id: 42\ndata: hi\n\n")
    expect(items).toEqual([{ kind: "event", value: { event: "message", data: "hi", id: "42" } }])
  })

  test("a comment line (: ping) is reported separately, not as an event", () => {
    const parser = new SseParser()
    const items = parser.push(": ping\n\n")
    expect(items).toEqual([{ kind: "comment", value: "ping" }])
  })

  test("a bare comment colon with no space after it", () => {
    const parser = new SseParser()
    expect(parser.push(":\n\n")).toEqual([{ kind: "comment", value: "" }])
  })

  test("several events across one chunk, in order", () => {
    const parser = new SseParser()
    const items = parser.push("data: one\n\ndata: two\n\n")
    expect(items.map((i) => (i.kind === "event" ? i.value.data : i.value))).toEqual(["one", "two"])
  })

  test("CRLF line endings are accepted like LF", () => {
    const parser = new SseParser()
    const items = parser.push("data: hi\r\n\r\n")
    expect(items).toEqual([
      { kind: "event", value: { event: "message", data: "hi", id: undefined } },
    ])
  })

  test("a blank line with no preceding field dispatches nothing", () => {
    const parser = new SseParser()
    expect(parser.push("\n\n\n")).toEqual([])
  })

  test("retry: and unknown fields are ignored but still terminate the event on blank line", () => {
    const parser = new SseParser()
    const items = parser.push("retry: 3000\nfoo: bar\ndata: x\n\n")
    expect(items).toEqual([
      { kind: "event", value: { event: "message", data: "x", id: undefined } },
    ])
  })

  test("a chunk with no trailing newline buffers until the next chunk completes the line", () => {
    const parser = new SseParser()
    expect(parser.push("data: part")).toEqual([])
    expect(parser.push("ial\n\n")).toEqual([
      { kind: "event", value: { event: "message", data: "partial", id: undefined } },
    ])
  })
})

/** A `Response` whose body streams the given chunks, one per microtask tick. */
function streamResponse(chunks: string[]): Response {
  const encoder = new TextEncoder()
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk))
        await Promise.resolve()
      }
      controller.close()
    },
  })
  return new Response(body)
}

describe("readEvents", () => {
  test("calls onEvent for each event, stamped with the given clock, and resolves at body end", async () => {
    let clock = 0
    const events: Array<{ data: string; receivedAt: number }> = []
    const comments: string[] = []
    await readEvents(
      streamResponse(["retry: 3000\n\n", ": ping\n\n", "data: hello\n\n"]),
      (e) => events.push({ data: e.data, receivedAt: e.receivedAt }),
      { onComment: (c) => comments.push(c), now: () => ++clock }
    )
    expect(comments).toEqual(["ping"])
    expect(events).toEqual([{ data: "hello", receivedAt: 1 }])
  })

  test("stops early when the signal is already aborted", async () => {
    const controller = new AbortController()
    controller.abort()
    const events: unknown[] = []
    await readEvents(streamResponse(["data: hi\n\n"]), (e) => events.push(e), {
      signal: controller.signal,
    })
    expect(events).toEqual([])
  })

  test("throws when the response has no body", async () => {
    await expect(readEvents(new Response(null), () => {})).rejects.toThrow("no body")
  })
})
