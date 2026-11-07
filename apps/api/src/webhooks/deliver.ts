// One delivery attempt over HTTP, to addresses the SSRF guard has just checked. Bun's fetch dials
// the address written in the URL; `Host` (and, over https, `tls.serverName` for SNI and the
// certificate check) name the endpoint's own host. So whatever DNS answers between the check and
// the connection, only a checked address is ever dialled. `redirect: "manual"` means a 3xx is an
// answer, never followed. The response body is never read: it is cancelled unread.
//
// `proxy: false` asks for a direct connection, but Bun 1.4.2 IGNORES it: with HTTP_PROXY /
// HTTPS_PROXY / ALL_PROXY set, the request still goes through that proxy (asked for the checked
// address in the URL, so the pinning holds; deliver.test.ts pins this). It is kept for a runtime
// that honours it; meanwhile the api and the worker warn at startup when a proxy is configured
// (`webhookStartupWarnings`).
import { isIP } from "node:net"
import type { WebhookDeliveryError } from "@repo/api-contract/webhooks-limits"
import type { WebhookUrlCheck } from "./ssrf"

/** Each attempt's own deadline (connect plus response headers). */
export const WEBHOOK_ATTEMPT_TIMEOUT_MS = 10_000

/**
 * What a delivery passes to fetch. `proxy: false` (no proxy, whatever the environment says) is a
 * runtime option Bun's own typings do not declare yet.
 */
export type WebhookFetchInit = Omit<BunFetchRequestInit, "proxy"> & { proxy: false }

/** The fetch a delivery uses; a test injects one to see exactly what is dialled. */
export type WebhookFetch = (url: string, init: WebhookFetchInit) => Promise<Response>

/** Bun's own fetch, given the `proxy: false` its typings leave out. */
export const bunWebhookFetch: WebhookFetch = (url, init) =>
  fetch(url, init as unknown as BunFetchRequestInit)

/** What one attempt came to. `status` is the HTTP status when an answer came back. */
export type AttemptOutcome =
  | { kind: "success"; status: number }
  | { kind: "gone"; status: 410 }
  | { kind: "failure"; status: number | null; error: WebhookDeliveryError }

type CheckedUrl = Extract<WebhookUrlCheck, { ok: true }>

const bracketed = (address: string) => (isIP(address) === 6 ? `[${address}]` : address)

/** The URL to dial: the endpoint's own, with `address` in place of its host. */
export function dialUrl(check: CheckedUrl, address: string): string {
  const { url } = check
  const port = url.port === "" ? "" : `:${url.port}`
  return `${url.protocol}//${bracketed(address)}${port}${url.pathname}${url.search}`
}

/** The `Host` header: the host (no trailing dot), with the port when it is not the default. */
export function hostHeader(check: CheckedUrl): string {
  const port = check.url.port === "" ? "" : `:${check.url.port}`
  return `${bracketed(check.host)}${port}`
}

/** A 2xx is a success, a 410 asks us to stop, a 3xx is a redirect (never followed). */
export function classifyStatus(status: number): AttemptOutcome {
  if (status >= 200 && status < 300) return { kind: "success", status }
  if (status === 410) return { kind: "gone", status: 410 }
  if (status >= 300 && status < 400) return { kind: "failure", status, error: "redirect" }
  return { kind: "failure", status, error: "http" }
}

const isTimeout = (error: unknown) =>
  error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")

/**
 * POSTs `body` to each checked address in turn until one answers (a connection error moves on to
 * the next; all of them failing is `network`). One deadline (`timeoutMs`) covers the whole
 * attempt, every address included: once it passes the attempt is a `timeout`. `signal` is the
 * job's: once it fires (the worker gave up on this run), nothing further is dialled.
 */
export async function postToCheckedAddresses(input: {
  check: CheckedUrl
  body: string
  headers: Record<string, string>
  fetch: WebhookFetch
  signal: AbortSignal
  timeoutMs?: number
}): Promise<AttemptOutcome> {
  const { check, body, headers, signal } = input
  const timeoutMs = input.timeoutMs ?? WEBHOOK_ATTEMPT_TIMEOUT_MS
  const https = check.url.protocol === "https:"
  const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)])
  for (const address of check.addresses) {
    if (attemptSignal.aborted) return { kind: "failure", status: null, error: "timeout" }
    let response: Response
    try {
      response = await input.fetch(dialUrl(check, address), {
        method: "POST",
        headers: { ...headers, host: hostHeader(check) },
        body,
        redirect: "manual",
        proxy: false,
        signal: attemptSignal,
        // A plain http URL (local development only) needs `Host` alone.
        ...(https ? { tls: { serverName: check.host } } : {}),
      })
    } catch (error) {
      if (isTimeout(error) || attemptSignal.aborted) {
        return { kind: "failure", status: null, error: "timeout" }
      }
      continue
    }
    // Never read: whatever the receiver sent back stays unseen, unstored and unlogged.
    await response.body?.cancel().catch(() => {})
    return classifyStatus(response.status)
  }
  return { kind: "failure", status: null, error: "network" }
}
