import type { Logger } from "@repo/log"
import { fileMailer } from "./file"
import { logMailer } from "./log"
import type { Mailer } from "./mailer"
import { resendMailer } from "./resend"
import { smtpMailer } from "./smtp"

export type MailEnv = {
  MAIL_PROVIDER: "log" | "smtp" | "resend" | "file"
  MAIL_FROM: string
  SMTP_URL?: string
  RESEND_API_KEY?: string
  MAIL_DIR?: string
}

/**
 * Picks the adapter from env. Throws on a missing key so the process fails at startup. `logger` is
 * where the `log` provider writes (the process logger).
 */
export function createMailer(env: MailEnv, logger?: Logger): Mailer {
  switch (env.MAIL_PROVIDER) {
    case "smtp":
      if (!env.SMTP_URL) throw new Error("MAIL_PROVIDER=smtp needs SMTP_URL")
      return smtpMailer({ url: env.SMTP_URL, from: env.MAIL_FROM })
    case "resend":
      if (!env.RESEND_API_KEY) throw new Error("MAIL_PROVIDER=resend needs RESEND_API_KEY")
      return resendMailer({ apiKey: env.RESEND_API_KEY, from: env.MAIL_FROM })
    case "file":
      if (!env.MAIL_DIR) throw new Error("MAIL_PROVIDER=file needs MAIL_DIR")
      return fileMailer(env.MAIL_DIR)
    default:
      return logMailer(logger)
  }
}
