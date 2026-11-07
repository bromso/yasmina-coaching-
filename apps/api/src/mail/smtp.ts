import nodemailer, { type SentMessageInfo, type Transporter } from "nodemailer"
import type { Mailer, Message } from "./mailer"

type Options = { url: string; from: string; jsonTransport?: boolean }

/** Any SMTP server (Mailpit in Compose, or a provider's SMTP endpoint) via Nodemailer. */
export function smtpMailer({ url, from, jsonTransport = false }: Options): Mailer & {
  sendRaw(message: Message): Promise<SentMessageInfo>
} {
  const transport: Transporter = jsonTransport
    ? nodemailer.createTransport({ jsonTransport: true })
    : // Nodemailer's defaults wait 2 min to connect and 10 min on an idle socket; bound a
      // black-holed host like the Resend adapter's 10 s. Query flags on `url` (`?requireTLS=true`)
      // still apply on top.
      nodemailer.createTransport({
        url,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 30_000,
      })
  const sendRaw = (message: Message) =>
    transport.sendMail({
      from,
      to: message.to,
      subject: message.subject,
      html: message.html,
      text: message.text,
      ...(message.replyTo ? { replyTo: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    })
  return {
    kind: "smtp",
    sendRaw,
    async send(message) {
      await sendRaw(message)
    },
  }
}
