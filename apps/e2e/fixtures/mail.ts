import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { expect } from "@playwright/test"
import { MAIL_DIR } from "../e2e.env"

export type Mail = {
  to: string
  subject: string
  text: string
  html: string
  sentAt: string
  /** RFC 8058 `List-Unsubscribe` / `List-Unsubscribe-Post`, present only on an optional-type mail. */
  headers?: Record<string, string>
}

/** The mailbox's file names; none yet when the directory does not exist (e.g. a reused api). */
function mailFiles(): string[] {
  try {
    return readdirSync(MAIL_DIR)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

/** One mail, or undefined while it cannot be parsed yet; the next poll reads it again. */
function readMail(name: string): Mail | undefined {
  try {
    return JSON.parse(readFileSync(join(MAIL_DIR, name), "utf8")) as Mail
  } catch {
    return undefined
  }
}

/** Polls `find` (newest match, or undefined) every 100 ms until it returns one, or `timeoutMs` passes. */
async function pollMail(
  find: (mails: Mail[]) => Mail | undefined,
  describe: string,
  { after, timeoutMs }: { after: number; timeoutMs: number }
): Promise<Mail> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const mails = mailFiles()
      .filter((name) => name.endsWith(".json") && Number(name.split("-")[0]) >= after)
      .sort()
      .map(readMail)
      .filter((mail): mail is Mail => mail !== undefined)
    const found = find(mails)
    if (found) return found
    if (Date.now() > deadline) {
      throw new Error(
        `${describe} in ${timeoutMs} ms ` +
          `(is the api running with MAIL_PROVIDER=file and MAIL_DIR=${MAIL_DIR}?)`
      )
    }
    // A filesystem poll for the api's detached send, not a wait on the UI.
    await new Promise((resolve) => setTimeout(resolve, 100))
  }
}

/** The newest mail to `to` whose subject matches, sent at or after `after` (ms); polls up to 5 s. */
export async function latestMail(
  to: string,
  subject: RegExp,
  { after = 0, timeoutMs = 5_000 }: { after?: number; timeoutMs?: number } = {}
): Promise<Mail> {
  return pollMail(
    (mails) => mails.filter((mail) => mail.to === to && subject.test(mail.subject)).at(-1),
    `no mail to ${to} matching ${subject}`,
    { after, timeoutMs }
  )
}

/**
 * The newest mail to `to`, by recipient alone — for a subject in a language the caller does not
 * want to hard-code (the i18n e2e journey reads a Swedish subject this way, not by guessing its
 * English text). Sent at or after `after` (ms); polls up to 5 s.
 */
export async function latestMailTo(
  to: string,
  { after = 0, timeoutMs = 5_000 }: { after?: number; timeoutMs?: number } = {}
): Promise<Mail> {
  return pollMail((mails) => mails.filter((mail) => mail.to === to).at(-1), `no mail to ${to}`, {
    after,
    timeoutMs,
  })
}

/** The first URL in the mail's text body matching `pattern`. */
export function linkIn(mail: Mail, pattern: RegExp): string {
  const url = mail.text.match(/https?:\/\/\S+/g)?.find((u) => pattern.test(u))
  if (!url) throw new Error(`no link matching ${pattern} in "${mail.subject}" to ${mail.to}`)
  return url
}

/**
 * Confirms no mail to `to` matching `subject`, sent at or after `after` (ms), shows up within
 * `windowMs` (default 2.5 s) — the check for a type a preference turned off. Built on
 * `expect.poll` rather than a blind sleep: the poll function withholds a real answer (returning
 * `"pending"`, which never satisfies `.toBe("none")`) until the window has fully elapsed, so a
 * late-landing mail is still caught instead of the assertion resolving the instant the first,
 * too-early check finds nothing.
 */
export async function assertNoMail(
  to: string,
  subject: RegExp,
  { after = 0, windowMs = 2_500 }: { after?: number; windowMs?: number } = {}
): Promise<void> {
  const deadline = Date.now() + windowMs
  await expect
    .poll(
      () => {
        if (Date.now() < deadline) return "pending"
        const arrived = mailFiles()
          .filter((name) => name.endsWith(".json") && Number(name.split("-")[0]) >= after)
          .map(readMail)
          .filter((mail): mail is Mail => mail !== undefined)
          .some((mail) => mail.to === to && subject.test(mail.subject))
        return arrived ? "arrived" : "none"
      },
      { timeout: windowMs + 2_000, intervals: [150] }
    )
    .toBe("none")
}
