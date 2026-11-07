import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"

/** A tiny but valid PDF — `validatePdf` only checks the header and a trailing `%%EOF`. */
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")

test("apply for a role with a CV, then review it as the e2e superadmin", async ({ page }) => {
  await page.goto(URLS.jobs)
  await expect(page.getByRole("heading", { level: 1, name: "Join us" })).toBeVisible()

  await page.getByRole("link", { name: "Senior Full-stack Engineer", exact: true }).click()
  await expect(page).toHaveURL(`${URLS.jobs}/senior-fullstack-engineer`)
  await expect(
    page.getByRole("heading", { level: 1, name: "Senior Full-stack Engineer" })
  ).toBeVisible()

  await page.getByRole("link", { name: "Apply for this role" }).click()
  await expect(page).toHaveURL(`${URLS.jobs}/senior-fullstack-engineer/apply`)
  await expect(
    page.getByRole("heading", { level: 1, name: "Apply for Senior Full-stack Engineer" })
  ).toBeVisible()

  const email = uniqueEmail("jobs")
  await page.getByLabel("Name", { exact: true }).fill("Ada Lovelace")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("CV (PDF, up to 5 MB)", { exact: true }).setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: TINY_PDF,
  })
  // Submitting with consent unchecked stays on the form with its field error.
  await page.getByRole("button", { name: "Apply" }).click()
  await expect(
    page.getByText("Please agree so we can store your application.", { exact: true })
  ).toBeVisible()
  await expectAccessible(page, {
    label: "jobs apply field error",
    route: "jobs:/senior-fullstack-engineer/apply",
  })

  // A browser never restores a file input after a round trip, so the CV is attached again.
  await page.getByLabel("CV (PDF, up to 5 MB)", { exact: true }).setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: TINY_PDF,
  })
  await page.getByRole("checkbox").check()
  await page.getByRole("button", { name: "Apply" }).click()

  // The confirmation message carries the name, role and address — not the `JOB-<id>` reference,
  // which the page never shows (only the mailed confirmation and the admin list do).
  const status = page.getByRole("status").filter({ hasText: "we've received your application" })
  await expect(status).toBeVisible()
  await expect(status).toContainText("Ada Lovelace")
  await expect(status).toContainText("Senior Full-stack Engineer")
  await expect(status).toContainText(email)
  await expectAccessible(page, {
    label: "jobs apply confirmation",
    route: "jobs:/senior-fullstack-engineer/apply",
  })

  // The application lands on apps/auth's admin, where the e2e superadmin (shared with admin.spec,
  // analytics.spec and help.spec) can see and review it. The list defaults to status "all", so no
  // query string is needed to find a fresh "new" application.
  await ensureAdmin(page, "admin@e2e.test")
  await page.goto(`${URLS.auth}/admin/applications`)

  // `email` is unique per run; the admin view renders the applicant as one "Name <email>"
  // definition, so an exact text match on the email alone would never find it — match the list
  // item whose own text contains it instead.
  const item = page.locator("li").filter({ hasText: email })
  await expect(item).toBeVisible()
  await expect(item).toContainText("Ada Lovelace")
  await expect(item).toContainText("Senior Full-stack Engineer")

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    item.getByRole("link", { name: "Download CV" }).click(),
  ])
  const path = await download.path()
  if (!path) throw new Error("CV did not download")
  const bytes = readFileSync(path)
  expect(bytes.toString("latin1", 0, 5)).toBe("%PDF-")

  // Setting the status re-renders the (unfiltered) list in place — the row, its select and the
  // "Reviewing" badge all stay mounted, unlike help's filtered Open/Resolved tabs.
  await item.getByLabel("Status", { exact: true }).selectOption("reviewing")
  await item.getByRole("button", { name: "Set status" }).click()
  await expect(item.getByText("reviewing", { exact: true })).toBeVisible()
})
