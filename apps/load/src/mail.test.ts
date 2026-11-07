import { afterAll, describe, expect, test } from "bun:test"
import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { latestMail, linkIn, mailFiles, readMails } from "./mail"

const dir = mkdtempSync(join(tmpdir(), "load-mail-"))
afterAll(() => rmSync(dir, { recursive: true, force: true }))

const write = (ms: number, to: string, text: string) =>
  writeFileSync(
    join(dir, `${ms}-abcdef.json`),
    JSON.stringify({ to, subject: "s", text, html: "", sentAt: new Date(ms).toISOString() })
  )

describe("mail", () => {
  test("a missing mailbox is empty", () => {
    expect(mailFiles(join(dir, "nope"))).toEqual([])
  })

  test("reads, filters by time and recipient, and finds a link", async () => {
    write(1_000, "a@example.com", "old http://x.localhost/verify-email?token=old")
    write(2_000, "a@example.com", "Verify: http://auth.brand.localhost:3002/verify-email?token=t1")
    writeFileSync(join(dir, "3000-ffffff.tmp"), "{partial")
    expect(readMails(dir, { after: 1_500 })).toHaveLength(1)
    const mail = await latestMail(dir, "a@example.com", { after: 1_500, timeoutMs: 100 })
    expect(new URL(linkIn(mail, /verify-email/)).searchParams.get("token")).toBe("t1")
    await expect(latestMail(dir, "b@example.com", { timeoutMs: 100 })).rejects.toThrow(
      "no mail to b@example.com"
    )
  })
})
