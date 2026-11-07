import { type ChatMessage, chatTools } from "@repo/ai-contract"
import { errorResponse } from "@repo/service-kit"
import {
  convertToModelMessages,
  createUIMessageStreamResponse,
  isStepCount,
  type LanguageModel,
  type LanguageModelUsage,
  streamText,
  toUIMessageStream,
  validateUIMessages,
} from "ai"
import type { Logger, UsageEntry } from "./log"
// Replace with a prompt for your product. Keep it free of per-request values (dates, names):
// it is the cached prefix of every request.
import systemPrompt from "./prompts/system.md" with { type: "text" }
import { tools } from "./tools"

export type ChatLimits = {
  maxMessages: number
  maxMessageBytes: number
  maxOutputTokens: number
  maxSteps: number
}

type ChatDeps = {
  model: LanguageModel
  modelId: string
  limits: ChatLimits
  log: Logger
  /** Called once per request whose stream ends in failure; never for a recovered error. */
  reportFailure?: (key: string, error: unknown) => void
}

const badRequest = (message: string) => errorResponse("BAD_REQUEST", { message })
const encoder = new TextEncoder()

/** Everything is checked before a model is called: invalid requests cost nothing. */
async function parseChatRequest(
  req: Request,
  limits: ChatLimits
): Promise<ChatMessage[] | Response> {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return badRequest("Body must be JSON")
  }

  const messages = (body as { messages?: unknown } | null)?.messages
  if (!Array.isArray(messages) || messages.length === 0) {
    return badRequest("messages must be a non-empty array")
  }
  if (messages.length > limits.maxMessages) {
    return badRequest(`At most ${limits.maxMessages} messages per request`)
  }
  // Bytes of the whole message — text, tool parts and files alike.
  if (messages.some((m) => encoder.encode(JSON.stringify(m)).byteLength > limits.maxMessageBytes)) {
    return badRequest(`Each message must be at most ${limits.maxMessageBytes} bytes`)
  }

  // validateUIMessages accepts system messages, but streamText rejects them mid-stream. The
  // system prompt is the server's alone.
  if (messages.some((m) => (m as { role?: unknown } | null)?.role === "system")) {
    return badRequest("system messages are not accepted")
  }

  try {
    return await validateUIMessages<ChatMessage>({ messages, tools: chatTools })
  } catch {
    return badRequest("messages are not valid UI messages")
  }
}

type Tokens = Pick<UsageEntry, "inputTokens" | "outputTokens" | "cachedInputTokens">

const noTokens: Tokens = {
  inputTokens: undefined,
  outputTokens: undefined,
  cachedInputTokens: undefined,
}

// Unknown stays unknown until some step reports a count.
const sum = (a: number | undefined, b: number | undefined) =>
  a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0)

const addStep = (tokens: Tokens, usage: LanguageModelUsage): Tokens => ({
  inputTokens: sum(tokens.inputTokens, usage.inputTokens),
  outputTokens: sum(tokens.outputTokens, usage.outputTokens),
  cachedInputTokens: sum(tokens.cachedInputTokens, usage.inputTokenDetails.cacheReadTokens),
})

export function createChatHandler({ model, modelId, limits, log, reportFailure }: ChatDeps) {
  return async (req: Request): Promise<Response> => {
    const messages = await parseChatRequest(req, limits)
    if (messages instanceof Response) return messages

    const started = performance.now()
    const elapsed = () => Math.round(performance.now() - started)
    // Totals are summed from finished steps, so aborted and failed calls still report what they used.
    let stepsSeen = 0
    let stepTokens = noTokens
    // onError also fires for non-fatal stream errors. A step that ends after the error means the
    // call recovered; none ending means it failed, whether or not onFinish still runs.
    let failed = false
    let lastError: unknown
    // Exactly one failure report per call, from whichever of finish / flush settles it first.
    let reported = false
    const settleFailure = () => {
      if (!failed || reported) return
      reported = true
      reportFailure?.("chat stream failed", lastError)
    }
    // Exactly one usage line per call, whichever of finish / error / abort reports first.
    let logged = false
    const logUsage = (outcome: NonNullable<UsageEntry["outcome"]>) => {
      if (logged) return
      logged = true
      log.usage({
        route: "chat",
        model: modelId,
        ...stepTokens,
        steps: stepsSeen,
        ms: elapsed(),
        outcome,
      })
    }
    // The SDK's onAbort only fires if its stream is pulled after the abort; when Bun cancels the
    // response body on a client disconnect it may never be, so the request signal is the backstop.
    req.signal.addEventListener("abort", () => logUsage("aborted"), { once: true })
    const result = streamText({
      model,
      instructions: {
        role: "system",
        content: systemPrompt,
        providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } },
      },
      messages: await convertToModelMessages(messages),
      tools,
      stopWhen: isStepCount(limits.maxSteps),
      maxOutputTokens: limits.maxOutputTokens,
      // Bun aborts req.signal when the client disconnects, which cancels the provider call.
      abortSignal: req.signal,
      // Anthropic only (other providers ignore it): server-side retry on a refusal.
      providerOptions: { anthropic: { effort: "high", fallbacks: "default" } },
      onStepEnd: ({ usage }) => {
        stepsSeen++
        stepTokens = addStep(stepTokens, usage)
        failed = false
      },
      onError: ({ error }) => {
        log.error("chat stream failed", error)
        failed = true
        lastError = error
      },
      onAbort: () => logUsage("aborted"),
      // When a later step fails, onFinish still runs, but with undefined totals. The step sums
      // match the SDK's totals on success and are the only figures left after a failure.
      onFinish: () => {
        logUsage(failed ? "error" : "ok")
        settleFailure()
      },
    })

    // toUIMessageStream masks errors as "An error occurred." for the client by default.
    // A failed first step never reaches onFinish; the stream closing is the last chance to log it.
    const settle = new TransformStream({
      flush: () => {
        if (failed) logUsage("error")
        settleFailure()
      },
    })
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream, tools }).pipeThrough(settle),
    })
  }
}
