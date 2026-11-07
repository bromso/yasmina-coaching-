import type { Logger as StructuredLogger } from "@repo/log"

export type UsageEntry = {
  route: "chat" | "summarize"
  model: string
  inputTokens: number | undefined
  outputTokens: number | undefined
  cachedInputTokens: number | undefined
  steps: number
  ms: number
  /** "ok" for a finished call; aborted and failed calls are logged too — they can still cost. */
  outcome?: "ok" | "aborted" | "error"
}

export type Logger = {
  usage(entry: UsageEntry): void
  error(message: string, error: unknown): void
}

/**
 * Backs the service's `usage`/`error` calls onto a structured `@repo/log` logger: `ai.usage`
 * becomes one JSON line per model call, carrying the request id from context (set by `withRequest`
 * around the handler that is in flight) like every other log line; `error` becomes a structured
 * error line instead of a bare `console.error`.
 */
export function createAiLogger(logger: StructuredLogger): Logger {
  return {
    usage: (entry) => logger.info("ai.usage", { ...entry }),
    error: (message, error) => logger.error(message, { error }),
  }
}
