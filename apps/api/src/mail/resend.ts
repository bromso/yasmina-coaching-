import type { Mailer, Message } from "./mailer"

// Narrower than `typeof fetch` (Bun adds `preconnect`), so a test can pass a plain function.
type Fetch = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type Options = { apiKey: string; from: string; fetch?: Fetch; timeoutMs?: number }

/** Resend's HTTP API: one POST per message. No SDK — the endpoint is a single JSON call. */
export function resendMailer({
  apiKey,
  from,
  fetch = globalThis.fetch,
  timeoutMs = 10_000,
}: Options): Mailer {
  return {
    kind: "resend",
    async send(message: Message) {
      const headers: Record<string, string> = {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
      }
      if (message.idempotencyKey) headers["idempotency-key"] = message.idempotencyKey
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers,
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
          ...(message.replyTo ? { reply_to: message.replyTo } : {}),
          ...(message.headers ? { headers: message.headers } : {}),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      })
      if (!response.ok) {
        const body = (await response.text().catch(() => "")).slice(0, 200)
        throw new Error(`resend ${response.status}: ${body}`)
      }
    },
  }
}
