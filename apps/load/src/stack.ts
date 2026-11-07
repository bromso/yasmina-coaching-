import { closeSync, mkdirSync, openSync, readFileSync, rmSync } from "node:fs"
import { join } from "node:path"
import type { Subprocess } from "bun"
import type { Targets } from "./target"

/**
 * Starts `apps/api` and `apps/ai` for a load run: production mode, a fresh SQLite file (or a given
 * Postgres `DATABASE_URL`), the `file` mail provider, local storage, raised per-client limits (the
 * shape of `apps/e2e/e2e.env.ts`), the ai service on the keyless `mock:echo` model. Binds
 * 127.0.0.1 only. Both processes log to one file under the run directory.
 */

export const LOAD_DIR = join(import.meta.dirname, "..")
export const TMP = join(LOAD_DIR, ".tmp")
const ROOT = join(LOAD_DIR, "..", "..")

/** The stack script's default ports (3017 is the dedicated jobs worker's). */
export const DEFAULT_PORTS = { api: 3027, ai: 3028 } as const

/** The engine a scenario's own stack runs on: `LOAD_DB=postgres` (with `LOAD_DATABASE_URL`), else SQLite. */
export const loadDb = (): "sqlite" | "postgres" =>
  process.env.LOAD_DB === "postgres" ? "postgres" : "sqlite"
export const runDirFor = (apiPort: number) => join(TMP, `stack-${apiPort}`)
export const DEFAULT_MAIL_DIR = join(runDirFor(DEFAULT_PORTS.api), "mail")

export const LOAD_API_TOKEN = "load-api-service-token-0123456789abcdef"
export const LOAD_AI_TOKEN = "load-ai-service-token-0123456789abcdef"
/** The api's /metrics bearer (≥ 24 chars), for the scenarios that sample it. */
export const LOAD_METRICS_TOKEN = "load-metrics-token-0123456789abcdef"
// Test-only: the same fixed 32-byte key apps/e2e uses — valid, and not the public dev key that
// production mode refuses.
const TWO_FACTOR_ENCRYPTION_KEY = "CQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQkJCQk="

export type StackOptions = {
  db: "sqlite" | "postgres"
  apiPort: number
  aiPort: number
  /** Extra env for both processes; wins over the defaults (e.g. `API_RATE_LIMIT`, `JOBS_WORKER`). */
  env?: Record<string, string>
  /** Scratch for the database, mailbox, storage and log; wiped first. Default `.tmp/stack-<apiPort>`. */
  runDir?: string
  /** How long to wait for both `/ready` answers. Default 15 s. */
  readyTimeoutMs?: number
}

export type Stack = {
  apiUrl: string
  aiUrl: string
  target: Targets
  runDir: string
  mailDir: string
  logPath: string
  metricsToken: string
  /** The two child processes — for a drill that signals one itself (the SIGTERM drill). */
  processes: { api: Subprocess; ai: Subprocess }
  stop(): Promise<void>
}

/** Env for the api process; exported for tests. */
export function apiEnvFor(opts: StackOptions, runDir: string): Record<string, string> {
  const databaseUrl =
    opts.db === "sqlite"
      ? `sqlite://${join(runDir, "api.db")}`
      : (opts.env?.DATABASE_URL ?? process.env.LOAD_DATABASE_URL ?? process.env.DATABASE_URL)
  if (!databaseUrl)
    throw new Error("startStack: db postgres needs DATABASE_URL (or LOAD_DATABASE_URL)")
  return {
    ...shared(opts),
    HOST: "127.0.0.1",
    PORT: String(opts.apiPort),
    TWO_FACTOR_ENCRYPTION_KEY,
    DATABASE_URL: databaseUrl,
    MAIL_PROVIDER: "file",
    MAIL_DIR: join(runDir, "mail"),
    BILLING_PROVIDER: "mock",
    STORAGE_PROVIDER: "local",
    STORAGE_DIR: join(runDir, "storage"),
    METRICS_TOKEN: LOAD_METRICS_TOKEN,
    // Raised so the closed-model scenarios measure the api, not its limiter (every VU has its own
    // client id, but sign-ups and the telemetry/analytics buckets are shared).
    API_RATE_LIMIT: "100000",
    SIGNUP_RATE_LIMIT: "100000",
    SIGNUP_EMAIL_RATE_LIMIT: "1000",
    MAGIC_LINK_RATE_LIMIT: "100000",
    PASSWORD_RESET_RATE_LIMIT: "100000",
    TELEMETRY_RATE_LIMIT: "100000",
    ANALYTICS_RATE_LIMIT: "100000",
    ...opts.env,
  }
}

/** Env for the ai process; exported for tests. */
export function aiEnvFor(opts: StackOptions): Record<string, string> {
  return {
    ...shared(opts),
    HOST: "127.0.0.1",
    PORT: String(opts.aiPort),
    AI_MODEL: "mock:echo",
    AI_RATE_LIMIT: "100000",
    ...opts.env,
  }
}

function shared(opts: StackOptions): Record<string, string> {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? "",
    NODE_ENV: "production",
    SITE_DOMAIN: "brand.localhost",
    API_SERVICE_TOKEN: LOAD_API_TOKEN,
    AI_SERVICE_URL: `http://127.0.0.1:${opts.aiPort}`,
    AI_SERVICE_TOKEN: LOAD_AI_TOKEN,
    COOKIE_DOMAIN: ".brand.localhost",
    AUTH_URL: "http://auth.brand.localhost:3002",
    APP_URL: "http://app.brand.localhost:3001",
    ACCOUNT_URL: "http://account.brand.localhost:3003",
  }
}

async function waitReady(
  url: string,
  child: Subprocess,
  deadline: number,
  logPath: string
): Promise<void> {
  for (;;) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`${url} exited before it was ready:\n${tail(logPath)}`)
    }
    try {
      const res = await fetch(`${url}/ready`, { signal: AbortSignal.timeout(1_000) })
      if (res.ok) return
    } catch {
      // Not listening yet.
    }
    if (Date.now() > deadline) throw new Error(`${url}/ready did not answer 200:\n${tail(logPath)}`)
    await Bun.sleep(100)
  }
}

function tail(path: string, lines = 30): string {
  try {
    return readFileSync(path, "utf8").split("\n").slice(-lines).join("\n")
  } catch {
    return "(no log)"
  }
}

async function terminate(child: Subprocess, graceMs = 10_000): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return
  child.kill("SIGTERM")
  const exited = await Promise.race([
    child.exited.then(() => true),
    Bun.sleep(graceMs).then(() => false),
  ])
  if (!exited) {
    child.kill("SIGKILL")
    await child.exited
  }
}

export async function startStack(opts: StackOptions): Promise<Stack> {
  const runDir = opts.runDir ?? runDirFor(opts.apiPort)
  rmSync(runDir, { recursive: true, force: true })
  mkdirSync(join(runDir, "mail"), { recursive: true })
  const logPath = join(runDir, "stack.log")
  const log = openSync(logPath, "a")
  const apiUrl = `http://127.0.0.1:${opts.apiPort}`
  const aiUrl = `http://127.0.0.1:${opts.aiPort}`

  const spawn = (app: "api" | "ai", env: Record<string, string>) =>
    Bun.spawn(["bun", "src/index.ts"], {
      cwd: join(ROOT, "apps", app),
      env,
      stdin: "ignore",
      stdout: log,
      stderr: log,
    })

  const children: Subprocess[] = []
  let processes: Stack["processes"] | undefined
  let stopped: Promise<void> | undefined
  const stop = () => {
    stopped ??= Promise.all(children.map((child) => terminate(child))).then(() => closeSync(log))
    return stopped
  }

  try {
    const api = spawn("api", apiEnvFor(opts, runDir))
    children.push(api)
    const ai = spawn("ai", aiEnvFor(opts))
    children.push(ai)
    processes = { api, ai }
    const deadline = Date.now() + (opts.readyTimeoutMs ?? 15_000)
    await Promise.all([
      waitReady(apiUrl, api, deadline, logPath),
      waitReady(aiUrl, ai, deadline, logPath),
    ])
  } catch (error) {
    await stop()
    throw error
  }

  return {
    apiUrl,
    aiUrl,
    target: {
      api: new URL(apiUrl),
      ai: new URL(aiUrl),
      apiToken: LOAD_API_TOKEN,
      aiToken: LOAD_AI_TOKEN,
    },
    runDir,
    mailDir: join(runDir, "mail"),
    logPath,
    metricsToken: LOAD_METRICS_TOKEN,
    processes: processes as Stack["processes"],
    stop,
  }
}
