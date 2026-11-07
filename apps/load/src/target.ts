import { DEV_TOKEN as DEV_AI_TOKEN } from "@repo/ai-contract"
import { DEV_API_TOKEN } from "@repo/api-contract"

export type Targets = { api: URL; ai: URL; apiToken: string; aiToken: string }

const DEFAULT_API = "http://api.brand.localhost:3007"
const DEFAULT_AI = "http://ai.brand.localhost:3008"

/** Loopback and `*.localhost` only: a load run must never reach a real deployment by accident. */
export function isLocalHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1")
  return (
    host === "127.0.0.1" || host === "localhost" || host === "::1" || host.endsWith(".localhost")
  )
}

/** Throws unless `url` is local or `LOAD_ALLOW_REMOTE=1`. */
export function guardTarget(url: URL, env: Record<string, string | undefined> = process.env): URL {
  if (!isLocalHost(url.hostname) && env.LOAD_ALLOW_REMOTE !== "1") {
    throw new Error(
      `Refusing to load ${url.origin}: not a local host. Set LOAD_ALLOW_REMOTE=1 to run against it.`
    )
  }
  return url
}

/**
 * Where the scenarios send load: `LOAD_TARGET_API` / `LOAD_TARGET_AI` (default the dev ports) and
 * the service tokens (`API_SERVICE_TOKEN` / `AI_SERVICE_TOKEN`, default the public dev tokens).
 */
export function targets(env: Record<string, string | undefined> = process.env): Targets {
  return {
    api: guardTarget(new URL(env.LOAD_TARGET_API || DEFAULT_API), env),
    ai: guardTarget(new URL(env.LOAD_TARGET_AI || DEFAULT_AI), env),
    apiToken: env.API_SERVICE_TOKEN || DEV_API_TOKEN,
    aiToken: env.AI_SERVICE_TOKEN || DEV_AI_TOKEN,
  }
}
