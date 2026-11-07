import { simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

// Mock models for tests only — not imported by src/index.ts, so not part of the build.

const usage = {
  inputTokens: { total: 12, noCache: 2, cacheRead: 10, cacheWrite: undefined },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
}

export function textModel(text: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ],
      }),
    }),
  })
}

/** Step 1 calls getCurrentTime with `input`; step 2 answers in text. */
export function toolCallModel(input: object) {
  return new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "getCurrentTime",
              input: JSON.stringify(input),
            },
            { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage },
          ],
        }),
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "t" },
            { type: "text-delta", id: "t", delta: "Here is the time." },
            { type: "text-end", id: "t" },
            { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
          ],
        }),
      },
    ],
  })
}

export function failingModel(message: string) {
  return new MockLanguageModelV4({
    doStream: async () => {
      throw new Error(message)
    },
    doGenerate: async () => {
      throw new Error(message)
    },
  })
}

/** A generate call that answers only after `ms` (a provider that has stopped responding). */
export function slowGenerateModel(ms: number) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      await Bun.sleep(ms)
      throw new Error("too late")
    },
  })
}

/** Reports a non-fatal error mid-stream, then finishes normally. */
export function recoveringModel(message: string) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Partial" },
          { type: "error", error: new Error(message) },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
        ],
      }),
    }),
  })
}

/** Step 1 calls getCurrentTime and finishes; step 2 fails before streaming anything. */
export function failsAfterToolModel(message: string) {
  const tool = toolCallModel({ timeZone: "UTC" })
  let calls = 0
  return new MockLanguageModelV4({
    doStream: async (options) => {
      calls++
      if (calls === 1) return tool.doStream(options)
      throw new Error(message)
    },
  })
}

/** Starts streaming, then stalls — for abort tests. */
export function hangingModel() {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: "Thinking" },
          { type: "text-end", id: "t" },
        ],
        chunkDelayInMs: 60_000,
      }),
    }),
  })
}

/** generateText returns `text` verbatim — pass valid or invalid JSON. */
export function jsonModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({
      content: [{ type: "text", text }],
      finishReason: { unified: "stop", raw: undefined },
      usage,
      warnings: [],
    }),
  })
}
