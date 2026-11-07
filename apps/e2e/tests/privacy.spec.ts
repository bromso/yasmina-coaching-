import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { signIn, signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("request an export, delete the account, sign in and cancel the deletion", async ({ page }) => {
  const email = uniqueEmail("privacy")
  await signUpVerified(page, email)

  await page.goto(`${URLS.account}/data-privacy`)
  await page.getByRole("button", { name: "Request an export" }).click()
  await expect(page.getByText("Preparing your export…")).toBeVisible()

  // The `privacy.export` job runs on the api's in-process worker and drains on its own — poll by
  // reloading rather than sleeping, as analytics.spec does for its own background job.
  const downloadLink = page.getByRole("link", { name: "Download" })
  await expect
    .poll(
      async () => {
        await page.reload()
        return downloadLink.isVisible()
      },
      { timeout: 15_000, intervals: [1_000] }
    )
    .toBe(true)

  const [download] = await Promise.all([page.waitForEvent("download"), downloadLink.click()])
  const path = await download.path()
  if (!path) throw new Error("export did not download")
  const file = JSON.parse(readFileSync(path, "utf8"))
  expect(file.profile.email).toBe(email)

  // A mismatched email stays on the card with its field error.
  await page.getByLabel("Your email address", { exact: true }).fill("not-this-account@example.com")
  await page.getByRole("button", { name: "Delete my account" }).click()
  await expect(
    page.getByText("Type your account's email address to confirm.", { exact: true })
  ).toBeVisible()
  await expectAccessible(page, {
    label: "account /data-privacy delete field error",
    route: "account:/data-privacy",
  })

  // Delete: the typed email must match the account's own.
  await page.getByLabel("Your email address", { exact: true }).fill(email)
  await page.getByRole("button", { name: "Delete my account" }).click()
  await expect(page).toHaveURL(`${URLS.auth}/login?deleted=1`)
  await expect(
    page.getByText("Your account is scheduled for deletion. Sign in to cancel.")
  ).toBeVisible()

  // Signing in during the grace period lands on the requested page with the banner showing.
  await signIn(page, email, `${URLS.account}/data-privacy`)
  await expect(page).toHaveURL(`${URLS.account}/data-privacy`)
  const banner = page.getByText(/^Your account will be deleted on/)
  await expect(banner).toBeVisible()
  await expectAccessible(page, {
    label: "account /data-privacy deletion banner",
    route: "account:/data-privacy",
  })

  await page.getByRole("button", { name: "Cancel deletion" }).click()
  await expect(banner).toHaveCount(0)
})
