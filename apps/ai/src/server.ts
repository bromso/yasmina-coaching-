import { OpenAPIHandler } from "@orpc/openapi/fetch"
import { OpenAPIReferencePlugin } from "@orpc/openapi/plugins"
import { ORPCError, onError } from "@orpc/server"
import { RPCHandler } from "@orpc/server/fetch"
import { ZodToJsonSchemaConverter } from "@orpc/zod/zod4"
import { contract } from "@repo/ai-contract"
import { type BrowserBatch, type ErrorEvent, TELEMETRY_LIMITS } from "@repo/api-contract"
import { createLogger, type Level, type Logger as StructuredLogger } from "@repo/log"
import {
  clientKey,
  createBearerCheck,
  createGuard,
  createLifecycle,
  createProtect,
  DEFAULT_REQUEST_TIMEOUT_MS,
  errorResponse,
  MAX_CLIENT_ID_LENGTH,
  type RateLimiter,
  readyRoute,
  withRequest,
} from "@repo/service-kit"
import type { LanguageModel } from "ai"
import { type ChatLimits, createChatHandler } from "./chat"
import { createAiLogger, type Logger } from "./log"
import { type Context, router } from "./router"

export type ServerOptions = {
  hostname: string
  port: number
  development?: boolean
  model: LanguageModel
  modelId: string
  token: string
  allowedOrigins: string[]
  allowLocalhostOrigins: boolean
  limits: ChatLimits
  rateLimiter: RateLimiter
  /** The ai-specific usage/error callback. Defaults to `createAiLogger(logger)`. */
  log?: Logger
  /** The structured logger (access lines). Defaults to `createLogger({ service: "ai" })`. */
  logger?: StructuredLogger
  /** Where the default logger writes each line (tests capture lines here). Defaults to the console. */
  logWrite?: (line: string, level: Level) => void
  /** How long in-flight requests get to finish on shutdown (Docker kills after 10 s). */
  drainMs?: number
  /** Where the service's own failures go (apps/api's telemetry.ingest). Fire-and-forget. */
  telemetry?: { report(batch: BrowserBatch): void }
  /** How long /ready answers 503 before the listener closes (raise behind a load balancer). */
  graceMs?: number
  /**
   * The server-side request deadline (`REQUEST_TIMEOUT_MS`): a handler with no response by then
   * answers 503. A chat stream that already started is not cut. Defaults to 30 000 ms.
   */
  requestTimeoutMs?: number
}

type ContractNode = { [key: string]: unknown }

/** Every procedure path (`summarize`) the ai contract declares, at any depth. */
function contractProcedures(node: ContractNode, path: string[] = [], depth = 0): Set<string> {
  const procedures = new Set<string>()
  if (depth > 8) return procedures
  for (const [key, value] of Object.entries(node)) {
    if (typeof value !== "object" || value === null) continue
    if ("~orpc" in value) {
      procedures.add([...path, key].join("/"))
    } else if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const p of contractProcedures(value as ContractNode, [...path, key], depth + 1)) {
        procedures.add(p)
      }
    }
  }
  return procedures
}

const PROCEDURES = contractProcedures(contract)

/**
 * The ai service's route label: `chat`, the oRPC procedure path (`summarize`), `openapi` for any
 * REST call, else `other` — bounded, so a label never carries a raw id or a query string.
 */
export function aiRouteOf(req: Request): string {
  const { pathname } = new URL(req.url)
  if (pathname === "/chat") return "chat"
  if (pathname.startsWith("/rpc/")) {
    const procedure = pathname.slice("/rpc/".length)
    return PROCEDURES.has(procedure) ? procedure : "other"
  }
  if (pathname.startsWith("/openapi/")) return "openapi"
  return "other"
}

/** `String(value)`, or "Error" for a value it cannot convert (`Object.create(null)`). */
function describe(value: unknown): string {
  try {
    return String(value)
  } catch {
    return "Error"
  }
}

/** The error's class name only: provider messages can carry secrets and prompt or output text. */
function errorName(error: unknown): string {
  if (!(error instanceof Error)) return "Error"
  return describe(error.name || error.constructor?.name || "Error") || "Error"
}

/**
 * A reduced `server` event: `<log key>: <error name>`, never the message and no stack (whose
 * first line repeats the message). The full text stays in the local log.
 */
export const toAiErrorEvent = (key: string, error: unknown): ErrorEvent => ({
  kind: "server",
  message: `${key}: ${errorName(error)}`.slice(0, TELEMETRY_LIMITS.message),
})

const notFound = () => errorResponse("NOT_FOUND", { message: "Not found" })

export function createServer(options: ServerOptions) {
  const logger = options.logger ?? createLogger({ service: "ai", write: options.logWrite })
  const log = options.log ?? createAiLogger(logger)
  // Request failures only (unexpected 5xx, GENERATION_FAILED, a chat stream that ends failed),
  // never recovered stream errors. Never on the response's path: a telemetry failure changes nothing.
  const reportFailure = (key: string, error: unknown) => {
    try {
      options.telemetry?.report({ errors: [toAiErrorEvent(key, error)], vitals: [] })
    } catch (failure) {
      log.error("telemetry report failed", failure)
    }
  }
  const context: Context = {
    model: options.model,
    modelId: options.modelId,
    log,
    reportFailure,
    maxOutputTokens: options.limits.maxOutputTokens,
  }

  // Contract errors (BAD_REQUEST, GENERATION_FAILED, …) are expected or already logged.
  const logUnexpected = (error: unknown) => {
    if (!(error instanceof ORPCError && (error.defined || error.status < 500))) {
      log.error("rpc failed", error)
      reportFailure("rpc failed", error)
    }
  }
  const rpc = new RPCHandler(router, { interceptors: [onError(logUnexpected)] })
  const openapi = new OpenAPIHandler(router, {
    interceptors: [onError(logUnexpected)],
    plugins: [
      new OpenAPIReferencePlugin({
        docsProvider: "scalar",
        docsTitle: "AI service",
        schemaConverters: [new ZodToJsonSchemaConverter()],
        specGenerateOptions: { info: { title: "AI service", version: "0.1.0" } },
      }),
    ],
  })

  const handle = async (
    handler: RPCHandler<Context> | OpenAPIHandler<Context>,
    prefix: `/${string}`,
    req: Request
  ) => {
    const { matched, response } = await handler.handle(req, { prefix, context })
    return matched ? response : notFound()
  }

  const protect = createProtect({
    guard: createGuard(options),
    rateLimiter: options.rateLimiter,
    keyFor: clientKey("x-ai-client-id"),
  })
  const lifecycle = createLifecycle({ drainMs: options.drainMs ?? 8_000, graceMs: options.graceMs })

  const chat = createChatHandler({
    model: options.model,
    modelId: options.modelId,
    limits: options.limits,
    log,
    reportFailure,
  })

  // Shared by the top-level `error()` callback below and `logged`'s `onError`: a generic 500,
  // never the error's message or stack (it can carry provider secrets and prompt/output text).
  const unhandled = (error: unknown) => {
    log.error("unhandled", error)
    reportFailure("unhandled", error)
    return errorResponse("INTERNAL_SERVER_ERROR", { message: "Internal error" })
  }

  // Outermost on every logged route, so the guard's own 401/403/429 carry an id and an access
  // line. A caller's x-request-id is honoured only once it holds the service bearer — the same
  // check the guard itself runs — so an anonymous caller can never plant an id that then shows up
  // in operator logs as if trusted.
  const hasServiceToken = createBearerCheck(options.token)
  const logged = <S, Args extends unknown[]>(
    handler: (req: Request, server: S, ...rest: Args) => Response | Promise<Response>
  ) =>
    withRequest(handler, {
      trusted: hasServiceToken,
      logger,
      routeOf: aiRouteOf,
      clientIdOf: (req, trusted) =>
        trusted ? req.headers.get("x-ai-client-id")?.trim().slice(0, MAX_CLIENT_ID_LENGTH) : null,
      onError: unhandled,
      timeoutMs: options.requestTimeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS,
    })

  const server = Bun.serve({
    hostname: options.hostname,
    port: options.port,
    development: options.development,
    // Bun rejects larger bodies with 413 before any parsing.
    maxRequestBodySize: options.limits.maxMessages * options.limits.maxMessageBytes + 64 * 1024,
    routes: {
      "/health": new Response("OK"),
      "/ready": readyRoute(lifecycle),
      "/chat": { POST: logged(protect(chat)) },
      "/rpc/*": logged(protect((req) => handle(rpc, "/rpc", req))),
      // Docs and spec are open; every REST procedure under /openapi/* is protected.
      "/openapi": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/spec.json": { GET: (req) => handle(openapi, "/openapi", req) },
      "/openapi/*": logged(protect((req) => handle(openapi, "/openapi", req))),
    },
    fetch: notFound,
    // Anything that throws past the handlers: log it, and never show Bun's error page or stack.
    error: unhandled,
  })

  return {
    server,
    lifecycle,
    stop: () => lifecycle.shutdown(server),
  }
}
