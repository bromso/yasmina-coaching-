import { createLogger, type Logger } from "@repo/log"
import { type Mailer, maskEmail } from "./mailer"

/**
 * The dev mailer: one structured `info` line `mail` per message, carrying the text body as a
 * field — its whole purpose is to show the one-time links (verify, reset, magic link) in the log,
 * so never run it in production (the api warns at startup). The addresses are masked; the body is
 * not.
 */
export function logMailer(logger: Logger = createLogger({ service: "api" })): Mailer {
  return {
    kind: "log",
    async send({ to, subject, text, replyTo, headers }) {
      logger.info("mail", {
        to: maskEmail(to),
        ...(replyTo ? { replyTo: maskEmail(replyTo) } : {}),
        subject,
        ...(headers ? { headers } : {}),
        text,
      })
    },
  }
}
