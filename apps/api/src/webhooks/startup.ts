// The startup warnings about outgoing webhooks, shared by the api (index.ts) and the dedicated
// worker (worker.ts): both deliver, so both say so. Pure, so a test reads exactly what is logged.
import type { Env } from "../env"

/** The proxy variables Bun's fetch reads, in either case. */
export const PROXY_ENV_KEYS = ["HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY"] as const

export const WEBHOOK_LOCALHOST_PRODUCTION_WARNING =
  "⚠ WEBHOOK_ALLOW_LOCALHOST_HTTP is on in production: webhooks may target http(s) on " +
  "localhost and *.localhost (this machine). For local development and e2e only — never in a real " +
  "deployment."

export const webhookProxyWarning = (key: string) =>
  `⚠ ${key} is set: webhook deliveries go through that proxy (to the address the SSRF guard ` +
  "checked, never a fresh lookup). Bun 1.4.2 ignores fetch's `proxy: false`, so the proxy sees " +
  "every delivery; unset it for this process if deliveries must leave directly."

/** Every warning this process should log at startup, in order. */
export function webhookStartupWarnings(
  env: Pick<Env, "NODE_ENV" | "WEBHOOK_ALLOW_LOCALHOST_HTTP">,
  source: Record<string, string | undefined>
): string[] {
  const warnings: string[] = []
  if (env.WEBHOOK_ALLOW_LOCALHOST_HTTP && env.NODE_ENV === "production")
    warnings.push(WEBHOOK_LOCALHOST_PRODUCTION_WARNING)
  // One line for the first proxy variable set (upper case before lower), not one per spelling.
  for (const key of PROXY_ENV_KEYS) {
    const set = [key, key.toLowerCase()].find((name) => (source[name] ?? "").trim() !== "")
    if (set) {
      warnings.push(webhookProxyWarning(set))
      break
    }
  }
  return warnings
}
