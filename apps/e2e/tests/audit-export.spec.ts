import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { ensureAdmin, signUpVerified, uniqueEmail } from "../fixtures/accounts"

// The exported file's header row, in the design's own column order (RFC 4180: every field quoted).
const CSV_HEADER =
  '"id","at","actor_id","actor_email","impersonated_id","impersonated_email","action","target_type","target_id","reason","ip","user_agent","metadata"'

test("export the audit log as CSV, then see the export itself audited", async ({ browser }) => {
  const adminCtx = await browser.newContext()
  const userCtx = await browser.newContext()
  try {
    const admin = await adminCtx.newPage()
    const userPage = await userCtx.newPage()
    const userEmail = uniqueEmail("audit-export")
    await signUpVerified(userPage, userEmail, "Audit Export Target")
    await ensureAdmin(admin, "admin@e2e.test")

    // A recognisable audit row: suspend the fresh user, reason carries the unique email.
    const reason = `e2e audit export ${userEmail}`
    await admin.goto(`${URLS.auth}/admin/users?q=${encodeURIComponent(userEmail)}`)
    await admin.getByRole("link", { name: userEmail }).click()
    await admin.getByLabel("Reason for suspending").fill(reason)
    await admin.getByRole("button", { name: "Suspend account" }).click()
    await expect(
      admin.getByText("Account suspended; the user is signed out everywhere.", { exact: true })
    ).toBeVisible()

    await admin.goto(`${URLS.auth}/admin/audit`)
    await expect(
      admin.getByText(
        /Network details \(IP, browser\) are kept \d+ days; entries are kept \d+ days\./
      )
    ).toBeVisible()

    // Export as CSV with the default From/To (the last 30 UTC days) — today is within it. The
    // submit produces a file download, not a navigation.
    const [download] = await Promise.all([
      admin.waitForEvent("download"),
      admin.getByRole("button", { name: "Export", exact: true }).click(),
    ])

    expect(download.suggestedFilename()).toMatch(/^audit-\d{4}-\d{2}-\d{2}-\d{4}-\d{2}-\d{2}\.csv$/)
    const path = await download.path()
    if (!path) throw new Error("export did not download")
    const text = readFileSync(path, "utf8")
    // readFileSync("utf8") does not strip a leading BOM — it decodes as the literal U+FEFF
    // character, which should be the file's very first character.
    expect(text.startsWith(`\uFEFF${CSV_HEADER}\r\n`)).toBe(true)
    expect(text).toContain('"user.suspended"')
    expect(text).toContain(reason)

    // The export itself wrote an `audit.exported` row. Tie it to this admin and this run: the
    // suspend row's own `actor_id` column (the third) is the admin's id, and filtering the list by
    // it puts this admin's newest entry first — the export just made, after this run's suspend —
    // so a leftover `audit.exported` row from an earlier attempt cannot satisfy the check.
    const suspendLine = text.split("\r\n").find((line) => line.includes(reason))
    if (!suspendLine) throw new Error("the suspend row is missing from the export")
    const adminId = suspendLine.split('","')[2]
    expect(adminId).toMatch(/^\d+$/)
    await admin.goto(`${URLS.auth}/admin/audit?actorId=${adminId}`)
    const newest = admin.locator("tbody tr").first()
    await expect(newest.locator("td").nth(1)).toHaveText("audit.exported")
  } finally {
    await adminCtx.close()
    await userCtx.close()
  }
})
