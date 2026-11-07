import { type LanguageModel, simulateReadableStream } from "ai"
import { MockLanguageModelV4 } from "ai/test"

const usage = {
  inputTokens: { total: 0, noCache: 0, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 0, text: 0, reasoning: undefined },
}

type Prompt = Parameters<MockLanguageModelV4["doStream"]>[0]["prompt"]
type StreamPart =
  Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer P>
    ? P
    : never

function lastUserText(prompt: Prompt): string {
  const message = prompt.findLast((m) => m.role === "user")
  if (message?.role !== "user") return ""
  return message.content.map((part) => (part.type === "text" ? part.text : "")).join("")
}

/** The getCurrentTime result the prompt ends with, if the last message is that tool's result. */
function trailingTimeResult(prompt: Prompt): { formatted: string; timeZone: string } | undefined {
  const last = prompt.at(-1)
  if (last?.role !== "tool") return undefined
  const part = last.content.find((p) => p.type === "tool-result" && p.toolName === "getCurrentTime")
  if (part?.type !== "tool-result" || part.output.type !== "json") return undefined
  const value = part.output.value as { formatted?: unknown; timeZone?: unknown } | null
  if (typeof value?.formatted !== "string" || typeof value.timeZone !== "string") return undefined
  return { formatted: value.formatted, timeZone: value.timeZone }
}

const textChunks = (text: string): StreamPart[] => [
  { type: "text-start", id: "echo" },
  { type: "text-delta", id: "echo", delta: text },
  { type: "text-end", id: "echo" },
  { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage },
]

/** One step of the echo model: a tool call when asked for the time, otherwise an echo. */
function echoChunks(prompt: Prompt): StreamPart[] {
  const last = prompt.at(-1)
  if (last?.role === "tool") {
    const time = trailingTimeResult(prompt)
    return textChunks(time ? `Echo: it's ${time.formatted} (${time.timeZone})` : "Echo: done")
  }
  const text = lastUserText(prompt)
  if (last?.role === "user" && /\btime\b/i.test(text)) {
    return [
      {
        type: "tool-call",
        toolCallId: `echo-time-${crypto.randomUUID()}`,
        toolName: "getCurrentTime",
        input: JSON.stringify({ timeZone: "UTC" }),
      },
      {
        type: "finish",
        finishReason: { unified: "tool-calls", raw: undefined },
        usage,
      },
    ]
  }
  return textChunks(`Echo: ${text}`)
}

/**
 * Keyless development model (AI_MODEL=mock:echo, or the fallback when no provider key is set).
 * Built on the AI SDK's own mock, so it exercises the same code path as a real provider.
 * Mention "time" and it calls getCurrentTime for UTC, then echoes the tool's answer — so the
 * chat page's tool UI works without a key.
 */
export const echoModel: LanguageModel = new MockLanguageModelV4({
  provider: "mock",
  modelId: "echo",
  doStream: async ({ prompt }) => ({
    stream: simulateReadableStream({ chunks: echoChunks(prompt) }),
  }),
  doGenerate: async ({ prompt }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({
          title: "Echo",
          summary: lastUserText(prompt).slice(0, 280),
          keyPoints: [],
        }),
      },
    ],
    finishReason: { unified: "stop", raw: undefined },
    usage,
    warnings: [],
  }),
})
