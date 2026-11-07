import { createLogger } from "@repo/log"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { createTelemetryClient } from "@repo/telemetry/server"
import { DEV_TOKEN, isDevLike, loadEnv } from "./env"
import { resolveModel } from "./models"
import { createServer } from "./server"

// One logger for the process, built before the env is parsed so a config error is logged the
// same way. NODE_ENV defaults to production as `loadEnv` does (Bun never sets it), so an unset
// NODE_ENV logs JSON; LOG_LEVEL / LOG_FORMAT are read (and validated) by createLogger itself.
const logger = createLogger({
  service: "ai",
  env: { ...Bun.env, NODE_ENV: Bun.env.NODE_ENV || "production" },
})

let config: { env: ReturnType<typeof loadEnv>; resolved: ReturnType<typeof resolveModel> }
try {
  const env = loadEnv(Bun.env)
  config = { env, resolved: resolveModel(env, Bun.env, (message) => logger.warn(message)) }
} catch (error) {
  logger.error(`cannot start: ${error instanceof Error ? error.message : String(error)}`)
  process.exit(1)
}

const { env, resolved } = config
const telemetry =
  env.API_URL && env.API_SERVICE_TOKEN
    ? createTelemetryClient({ apiUrl: env.API_URL, serviceToken: env.API_SERVICE_TOKEN, app: "ai" })
    : undefined
const { server, lifecycle } = createServer({
  hostname: env.HOST,
  port: env.PORT,
  development: env.NODE_ENV === "development",
  model: resolved.model,
  modelId: resolved.id,
  token: env.AI_SERVICE_TOKEN,
  allowedOrigins: env.AI_ALLOWED_ORIGINS,
  allowLocalhostOrigins: isDevLike(env.NODE_ENV),
  limits: {
    maxMessages: env.AI_MAX_MESSAGES,
    maxMessageBytes: env.AI_MAX_MESSAGE_BYTES,
    maxOutputTokens: env.AI_MAX_OUTPUT_TOKENS,
    maxSteps: env.AI_MAX_STEPS,
  },
  rateLimiter: createMemoryRateLimiter({
    limit: env.AI_RATE_LIMIT,
    windowMs: env.AI_RATE_WINDOW_SECONDS * 1000,
  }),
  telemetry,
  logger,
  requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
})
lifecycle.installSignalHandlers(server)

if (env.AI_SERVICE_TOKEN === DEV_TOKEN) {
  logger.warn(
    `⚠ Using the public development token "${DEV_TOKEN}" — anyone can call this service. ` +
      "Set AI_SERVICE_TOKEN before exposing it."
  )
}

if (!telemetry) {
  logger.info("telemetry off — set API_URL and API_SERVICE_TOKEN to report errors to the api")
}

logger.info(
  `AI service ready on ${server.url} (${env.NODE_ENV}) — model ${resolved.id} — ` +
    `docs at ${new URL("/openapi", server.url)}`
)
