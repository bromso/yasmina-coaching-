import { implement } from "@orpc/server"
import { contract, SummarySchema } from "@repo/ai-contract"
import { generateText, type LanguageModel, NoObjectGeneratedError, Output } from "ai"
import type { Logger } from "./log"

export type Context = {
  model: LanguageModel
  modelId: string
  log: Logger
  /** Reports a request failure to telemetry (reduced to key and error name). Optional in tests. */
  reportFailure?: (key: string, error: unknown) => void
  maxOutputTokens: number
}

const ai = implement(contract).$context<Context>()

export const router = ai.router({
  summarize: ai.summarize.handler(async ({ input, context, errors, signal }) => {
    const started = performance.now()
    try {
      const { output, usage } = await generateText({
        model: context.model,
        instructions: "Summarize the user's text. Be faithful to the source and add no facts.",
        prompt: input.text,
        // The contract's own output schema constrains the model and types the response.
        output: Output.object({ schema: SummarySchema }),
        maxOutputTokens: context.maxOutputTokens,
        abortSignal: signal,
        providerOptions: { anthropic: { fallbacks: "default" } },
      })
      context.log.usage({
        route: "summarize",
        model: context.modelId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        cachedInputTokens: usage.inputTokenDetails.cacheReadTokens,
        steps: 1,
        ms: Math.round(performance.now() - started),
        outcome: "ok",
      })
      return output
    } catch (error) {
      // A client disconnect is not a server failure: log the call, not the error.
      const aborted = signal?.aborted === true
      if (!aborted) {
        context.log.error("summarize failed", error)
        context.reportFailure?.("summarize failed", error)
      }
      // Output that fails the schema still came from a finished model call, which cost tokens.
      const usage = NoObjectGeneratedError.isInstance(error) ? error.usage : undefined
      context.log.usage({
        route: "summarize",
        model: context.modelId,
        inputTokens: usage?.inputTokens,
        outputTokens: usage?.outputTokens,
        cachedInputTokens: usage?.inputTokenDetails.cacheReadTokens,
        steps: usage ? 1 : 0,
        ms: Math.round(performance.now() - started),
        outcome: aborted ? "aborted" : "error",
      })
      throw errors.GENERATION_FAILED()
    }
  }),
})
