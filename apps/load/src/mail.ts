import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

/** One message the api's `file` mail provider wrote (`<ms>-<hex>.json`, renamed into place). */
export type Mail = {
  to: string
  subject: string
  text: string
  html: string
  replyTo?: string
  sentAt: string
}

/** The mailbox's `.json` file names, oldest first; none while the directory does not exist. */
export function mailFiles(mailDir: string): string[] {
  try {
    return readdirSync(mailDir)
      .filter((name) => name.endsWith(".json"))
      .sort()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
    throw error
  }
}

const sentAtMs = (name: string) => Number(name.split("-")[0])

/** Every parseable message written at or after `after` (ms), oldest first. */
export function readMails(mailDir: string, { after = 0 }: { after?: number } = {}): Mail[] {
  const mails: Mail[] = []
  for (const name of mailFiles(mailDir)) {
    if (sentAtMs(name) < after) continue
    try {
      mails.push(JSON.parse(readFileSync(join(mailDir, name), "utf8")) as Mail)
    } catch {
      // Unreadable for now; the next poll reads it again.
    }
  }
  return mails
}

/**
 * The newest mail to `to` (optionally also matching `match`) written at or after `after`; polls
 * every 50 ms for up to `timeoutMs` (default 10 s — the send is a background job).
 */
export async function latestMail(
  mailDir: string,
  to: string,
  {
    after = 0,
    match = () => true,
    timeoutMs = 10_000,
  }: { after?: number; match?: (mail: Mail) => boolean; timeoutMs?: number } = {}
): Promise<Mail> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = readMails(mailDir, { after })
      .filter((mail) => mail.to === to && match(mail))
      .at(-1)
    if (found) return found
    if (Date.now() > deadline) {
      throw new Error(
        `no mail to ${to} in ${timeoutMs} ms (is the api on MAIL_PROVIDER=file, MAIL_DIR=${mailDir}?)`
      )
    }
    await Bun.sleep(50)
  }
}

/** The first URL in the mail's text body matching `pattern`. */
export function linkIn(mail: Mail, pattern: RegExp): string {
  const url = mail.text.match(/https?:\/\/\S+/g)?.find((u) => pattern.test(u))
  if (!url) throw new Error(`no link matching ${pattern} in "${mail.subject}" to ${mail.to}`)
  return url
}
