import { DEV_TOKEN } from "@repo/ai-contract"
import { isDevLike, resolveServiceToken } from "@repo/service-kit"
import { z } from "zod"

export { DEV_TOKEN, isDevLike }

// Blank values in .env files arrive as "" and pasted secrets often carry a trailing newline:
// trim, and treat what is left empty as unset.
const optionalString = z
  .string()
  .optional()
  .transform((value) => value?.trim() || undefined)

const csv = z
  .string()
  .default("")
  .transform((value) =>
    value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
  )

const EnvSchema = z.object({
  // Bun never sets NODE_ENV, so an unset value must fail closed: `bun dev` opts into development.
  NODE_ENV: z.enum(["development", "production", "test"]).default("production"),
  HOST: z.string().default("ai.brand.localhost"),
  PORT: z.coerce.number().int().min(0).max(65_535).default(3008),
  AI_MODEL: z
    .string()
    .regex(/^[a-z0-9-]+:.+$/, 'AI_MODEL must look like "provider:model"')
    .default("anthropic:claude-opus-5"),
  AI_SERVICE_TOKEN: optionalString,
  AI_ALLOWED_ORIGINS: csv,
  AI_MAX_MESSAGES: z.coerce.number().int().positive().default(50),
  AI_MAX_MESSAGE_BYTES: z.coerce.number().int().positive().default(32_768),
  AI_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(4096),
  AI_MAX_STEPS: z.coerce.number().int().positive().default(5),
  AI_RATE_LIMIT: z.coerce.number().int().positive().default(30),
  AI_RATE_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
  // The server-side request deadline: a request with no answer by then gets 503 "Service
  // unavailable, try again". Only the time to a response counts; a chat stream already under way
  // is not cut. Blank means the default.
  REQUEST_TIMEOUT_MS: optionalString
    .pipe(z.coerce.number<string | undefined>().int().min(1_000).max(600_000).optional())
    .transform((value) => value ?? 30_000),
  // Error reporting through apps/api's telemetry.ingest; both unset means no reporting.
  API_URL: optionalString.pipe(z.string().url().optional()),
  API_SERVICE_TOKEN: optionalString,
})

export type Env = Omit<z.infer<typeof EnvSchema>, "AI_SERVICE_TOKEN"> & {
  AI_SERVICE_TOKEN: string
}

/** Parses and validates configuration. Bun loads .env files into Bun.env on its own. */
export function loadEnv(source: Record<string, string | undefined>): Env {
  const env = EnvSchema.parse(source)
  const token = resolveServiceToken({
    given: env.AI_SERVICE_TOKEN,
    devToken: DEV_TOKEN,
    nodeEnv: env.NODE_ENV,
    name: "AI_SERVICE_TOKEN",
  })
  return { ...env, AI_SERVICE_TOKEN: token }
}
