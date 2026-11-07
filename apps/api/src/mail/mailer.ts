export type Message = {
  to: string
  subject: string
  html: string
  text: string
  /** Lets a provider drop a retried duplicate (Resend honours it; SMTP ignores it). */
  idempotencyKey?: string
  /** Where a reply should go instead of `from` (e.g. the support requester's own address). */
  replyTo?: string
  /**
   * Extra message headers, passed through as given (Nodemailer's `headers`, Resend's `headers`)
   * and recorded by the log and file mailers. Only optional notification mail sets any:
   * `List-Unsubscribe` and `List-Unsubscribe-Post` (RFC 8058). Absent on every other mail.
   */
  headers?: Record<string, string>
}

/** The seam for email. Adapters implement `send`; the default writes to the log. */
export type Mailer = {
  kind: "log" | "smtp" | "resend" | "file"
  send(message: Message): Promise<void>
}

/** `ada@example.com` → `a***@example.com`; for log lines, never for the message itself. */
export function maskEmail(email: string): string {
  const at = email.indexOf("@")
  if (at < 1) return "***"
  return `${email[0]}***${email.slice(at)}`
}

/**
 * Runs `work` off the response path. `@react-email/render` completes in microtasks, so a bare
 * `void promise` chain still renders before the handler's response is written; the macrotask hop
 * (`setTimeout(0)`) guarantees rendering and sending start only after it. That also keeps the
 * known- and unknown-email branches of `requestPasswordReset` alike in timing. Failures go to
 * `onError`, a synchronous throw included; nothing is retried.
 */
export function detach(work: () => Promise<void>, onError: (error: unknown) => void): void {
  setTimeout(() => {
    // Through a promise, so a synchronous throw from `work` reaches `onError` too instead of
    // escaping the timer callback as an uncaught exception.
    Promise.resolve().then(work).catch(onError)
  }, 0)
}
