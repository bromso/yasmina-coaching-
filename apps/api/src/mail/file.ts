import { mkdir, rename, writeFile } from "node:fs/promises"
import { join } from "node:path"
import type { Mailer } from "./mailer"

/**
 * Writes each message to `<dir>/<ms>-<hex>.json` instead of sending it — for end-to-end tests and
 * local runs that need the links in a mail. Never for production mail: the api warns at startup.
 * Each file is written as `.tmp` and renamed into place, so a reader polling for `*.json` never
 * sees a partly written message (a rename within one directory is atomic).
 */
export function fileMailer(dir: string): Mailer {
  return {
    kind: "file",
    async send({ to, subject, text, html, replyTo, headers }) {
      await mkdir(dir, { recursive: true })
      const name = `${Date.now()}-${crypto.randomUUID().replaceAll("-", "").slice(0, 6)}`
      const mail = { to, subject, text, html, replyTo, headers, sentAt: new Date().toISOString() }
      await writeFile(join(dir, `${name}.tmp`), JSON.stringify(mail, null, 2))
      await rename(join(dir, `${name}.tmp`), join(dir, `${name}.json`))
    },
  }
}
