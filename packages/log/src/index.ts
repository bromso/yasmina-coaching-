export type Level = "debug" | "info" | "warn" | "error"
export type Fields = Record<string, unknown>

export type Logger = {
  debug(message: string, fields?: Fields): void
  info(message: string, fields?: Fields): void
  warn(message: string, fields?: Fields): void
  error(message: string, fields?: Fields): void
  child(fields: Fields): Logger
}

export type CreateLoggerOptions = {
  service: string
  level?: Level
  format?: "json" | "pretty"
  write?: (line: string, level: Level) => void
  env?: Record<string, string | undefined>
}

/** The header a request id travels on, both incoming and on the response. */
export const REQUEST_ID_HEADER = "x-request-id"

const LEVELS: readonly Level[] = ["debug", "info", "warn", "error"]
const LEVEL_RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }

const isLevel = (value: string | undefined): value is Level =>
  value !== undefined && (LEVELS as readonly string[]).includes(value)

// Case-insensitive, any depth, matched anywhere in the key (`sessionToken`, `api_secret`,
// `set-cookie`, `x-session-token` and `SENTRY_DSN` all count), plus the bare key `auth`; a key
// ending in "email" is masked rather than dropped.
const REDACT_PARTS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "apikey",
  "api_key",
  "api-key",
  "dsn",
  "credential",
  "private_key",
  "privatekey",
]
const isSensitiveKey = (lower: string) =>
  lower === "auth" || REDACT_PARTS.some((part) => lower.includes(part))

// Keys whose string value is masked when it holds an address (`to: "ada@example.com"`); a value
// without an `@` (a port, a version) is left alone.
const ADDRESS_KEYS = new Set(["to", "from", "address"])

const MAX_DEPTH = 8
// How many `cause` links an Error is followed through before the chain is cut.
const MAX_CAUSE_DEPTH = 5
// An Error's own properties copied besides name/message/stack/cause; strings and numbers only.
const ERROR_SKIP = new Set(["name", "message", "stack", "cause"])

let getRequestId: () => string | undefined = () => undefined

/**
 * Registered by `@repo/log/context` on import. Letting the context module register itself keeps
 * `node:async_hooks` out of anything that only imports the root `@repo/log` entry (client code
 * included) — call this yourself only if you are wiring up an alternative context source.
 */
export function setRequestIdGetter(getter: () => string | undefined): void {
  getRequestId = getter
}

/** `ada@example.com` -> `a***@example.com`; a value with no `@` -> `"***"`. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at <= 0) return "***"
  return `${email[0]}***${email.slice(at)}`
}

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  !(value instanceof Error) &&
  (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)

function serialiseError(error: Error, depth: number, causeDepth: number): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  }
  // Own enumerable string/number props (Node's `code`, `errno`, `syscall`, Postgres's `code`,
  // `detail`, …), each through the same key rules as any field; objects (headers, bodies) are left
  // out rather than walked.
  for (const [key, v] of Object.entries(error)) {
    if (ERROR_SKIP.has(key)) continue
    if (typeof v !== "string" && typeof v !== "number") continue
    out[key] = redactEntry(key, v, depth)
  }
  if ("cause" in error && error.cause !== undefined) {
    const cause = error.cause
    if (causeDepth >= MAX_CAUSE_DEPTH) {
      out.cause = "[cause chain truncated]"
    } else if (cause instanceof Error) {
      out.cause = serialiseError(cause, depth + 1, causeDepth + 1)
    } else {
      out.cause = redactValue(cause, depth + 1)
    }
  }
  return out
}

const maskAddresses = (v: unknown, always: boolean): unknown => {
  if (typeof v === "string") return always || v.includes("@") ? maskEmail(v) : v
  if (Array.isArray(v) && v.every((item) => typeof item === "string")) {
    return v.map((item) => maskAddresses(item, always))
  }
  return undefined
}

function redactEntry(key: string, v: unknown, depth: number): unknown {
  const lower = key.toLowerCase()
  if (lower.endsWith("email") || ADDRESS_KEYS.has(lower)) {
    const masked = maskAddresses(v, lower.endsWith("email"))
    if (masked !== undefined) return masked
  }
  if (isSensitiveKey(lower)) return "[redacted]"
  return redactValue(v, depth + 1)
}

// A URL as a string, without its username/password and with the value of any sensitive query
// parameter (`?token=…`, `?api_key=…`) redacted.
function redactUrl(url: URL): string {
  try {
    const copy = new URL(url.href)
    copy.username = ""
    copy.password = ""
    for (const name of [...copy.searchParams.keys()]) {
      if (isSensitiveKey(name.toLowerCase())) copy.searchParams.set(name, "[redacted]")
    }
    return copy.href
  } catch {
    return "[url]"
  }
}

function redactValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH) return "[depth]"
  if (value instanceof Error) return serialiseError(value, depth, 0)
  if (Array.isArray(value)) {
    return value.map((item) => redactValue(item, depth + 1))
  }
  if (value instanceof URL) return redactUrl(value)
  if (value instanceof Map) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of value) out[String(key)] = redactEntry(String(key), v, depth)
    return out
  }
  if (isPlainObject(value)) {
    const out: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value)) out[key] = redactEntry(key, v, depth)
    return out
  }
  return value
}

/**
 * Walks plain objects, arrays and Maps at any depth, redacting sensitive keys and masking emails;
 * a URL becomes a string without its credentials or sensitive query values.
 */
export function redact(value: unknown): unknown {
  return redactValue(value, 0)
}

/** 16 random bytes, base64url: 22 characters. */
export function newRequestId(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("base64url")
}

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{8,64}$/

/** A well-formed incoming request id, or `null` when absent or malformed. */
export function validRequestId(id: string | null | undefined): string | null {
  if (!id) return null
  return REQUEST_ID_PATTERN.test(id) ? id : null
}

type ErrorField = {
  name?: unknown
  message?: unknown
  stack?: unknown
  code?: unknown
  cause?: unknown
}

// `TypeError: fetch failed [code] <- Error: connect ECONNREFUSED [ECONNREFUSED]`: the cause chain
// on the one line, since the stack printed below it belongs to the outer error only.
function describeError(value: ErrorField): string {
  let text = `${String(value.name)}: ${String(value.message)}`
  if (value.code !== undefined) text += ` [${String(value.code)}]`
  const cause = value.cause
  if (cause === undefined) return text
  if (isErrorField(cause)) return `${text} <- ${describeError(cause)}`
  return `${text} <- ${typeof cause === "string" ? cause : JSON.stringify(cause)}`
}

const isErrorField = (value: unknown): value is ErrorField =>
  typeof value === "object" &&
  value !== null &&
  "name" in value &&
  "message" in value &&
  "stack" in value

function formatPretty(
  time: string,
  level: Level,
  service: string,
  message: string,
  requestId: string | undefined,
  fields: Fields
): string {
  let line = `${time} ${level.toUpperCase().padEnd(5)} [${service}] ${message}`
  if (requestId) line += ` (${requestId})`

  const pairs: string[] = []
  let stackLines = ""
  for (const [key, value] of Object.entries(fields)) {
    if (key === "error" && isErrorField(value)) {
      pairs.push(`error=${describeError(value)}`)
      if (typeof value.stack === "string") stackLines += `\n${value.stack}`
      continue
    }
    pairs.push(`${key}=${typeof value === "string" ? value : JSON.stringify(value)}`)
  }
  if (pairs.length > 0) line += ` ${pairs.join(" ")}`
  return line + stackLines
}

function formatJson(
  time: string,
  level: Level,
  service: string,
  message: string,
  requestId: string | undefined,
  fields: Fields
): string {
  try {
    const line: Fields = { time, level, service, message, ...(requestId ? { requestId } : {}) }
    // The envelope always wins: a field named like one of its keys (`level: "info"` on an error
    // line would hide it from level filters) is kept as `field.<key>` instead.
    for (const [key, value] of Object.entries(fields)) {
      line[Object.hasOwn(line, key) ? `field.${key}` : key] = value
    }
    return JSON.stringify(line)
  } catch {
    return JSON.stringify({ time, level, service, message, logError: "unserialisable fields" })
  }
}

const defaultWrite = (line: string, level: Level): void => {
  if (level === "error" || level === "warn") console.error(line)
  else console.log(line)
}

function resolveLevel(
  opts: CreateLoggerOptions,
  env: Record<string, string | undefined>
): {
  level: Level
  invalidEnvLevel: string | undefined
} {
  if (opts.level) return { level: opts.level, invalidEnvLevel: undefined }
  const envLevel = env.LOG_LEVEL
  if (isLevel(envLevel)) return { level: envLevel, invalidEnvLevel: undefined }
  return { level: "info", invalidEnvLevel: envLevel }
}

function resolveFormat(
  opts: CreateLoggerOptions,
  env: Record<string, string | undefined>
): "json" | "pretty" {
  if (opts.format) return opts.format
  const envFormat = env.LOG_FORMAT
  if (envFormat === "json" || envFormat === "pretty") return envFormat
  return env.NODE_ENV === "production" ? "json" : "pretty"
}

/** Builds a structured logger. See the README for the line format and env vars. */
export function createLogger(opts: CreateLoggerOptions): Logger {
  const env = opts.env ?? process.env
  const { level, invalidEnvLevel } = resolveLevel(opts, env)
  const format = resolveFormat(opts, env)
  const write = opts.write ?? defaultWrite
  const { service } = opts

  const emit = (
    lvl: Level,
    baseFields: Fields,
    message: string,
    fields: Fields | undefined
  ): void => {
    if (LEVEL_RANK[lvl] < LEVEL_RANK[level]) return
    const time = new Date().toISOString()
    const requestId = getRequestId()
    let merged: Fields
    let line: string
    try {
      merged = redact({ ...baseFields, ...fields }) as Fields
    } catch {
      merged = {}
    }
    try {
      line =
        format === "json"
          ? formatJson(time, lvl, service, message, requestId, merged)
          : formatPretty(time, lvl, service, message, requestId, merged)
    } catch {
      line = formatJson(time, lvl, service, message, requestId, {})
    }
    write(line, lvl)
  }

  const build = (baseFields: Fields): Logger => ({
    debug: (message, fields) => emit("debug", baseFields, message, fields),
    info: (message, fields) => emit("info", baseFields, message, fields),
    warn: (message, fields) => emit("warn", baseFields, message, fields),
    error: (message, fields) => emit("error", baseFields, message, fields),
    child: (fields) => build({ ...baseFields, ...fields }),
  })

  const logger = build({})
  if (invalidEnvLevel) {
    logger.warn(`invalid LOG_LEVEL "${invalidEnvLevel}", falling back to "info"`)
  }
  return logger
}
