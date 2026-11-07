import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, PASSWORD, signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("impersonate with a reason, blocked password change, stop, audit", async ({ browser }) => {
  const adminCtx = await browser.newContext()
  const userCtx = await browser.newContext()
  try {
    const admin = await adminCtx.newPage()
    const userPage = await userCtx.newPage()
    const userEmail = uniqueEmail("target")
    await signUpVerified(userPage, userEmail, "Target User")
    await ensureAdmin(admin, "admin@e2e.test")

    await admin.goto(`${URLS.auth}/admin/users?q=${encodeURIComponent(userEmail)}`)
    await admin.getByRole("link", { name: userEmail }).click()
    await admin.getByLabel("Reason", { exact: true }).fill("e2e support ticket")
    await admin.getByRole("button", { name: "Impersonate" }).click()
    await expect(admin).toHaveURL((url) => url.origin === URLS.app)
    await expect(
      admin.getByRole("status").filter({ hasText: /viewing as target user/i })
    ).toBeVisible()

    await admin.goto(`${URLS.account}/security`)
    await admin.getByLabel("Current password").fill(PASSWORD)
    // "New password" is a substring of "Confirm new password": match it exactly.
    await admin.getByLabel("New password", { exact: true }).fill("another horse battery staple")
    await admin.getByLabel("Confirm new password").fill("another horse battery staple")
    await admin.getByRole("button", { name: "Change password" }).click()
    // The field error has no full stop; the Two-step verification card's own notices do.
    await expect(
      admin.getByText("Not available while impersonating", { exact: true })
    ).toBeVisible()

    await admin.getByRole("link", { name: "Stop impersonating" }).click()
    await expect(admin).toHaveURL(`${URLS.auth}/admin/stop`)
    await expect(
      admin.getByRole("status").filter({ hasText: /viewing as target user/i })
    ).toBeVisible()
    await expectAccessible(admin, {
      label: "auth /admin/stop impersonating",
      route: "auth:/admin/stop",
    })
    await admin.getByRole("button", { name: "Stop impersonating" }).click()
    await expect(admin).toHaveURL(/\/admin\/users\/\d+/)
    await expect(admin.getByText("impersonation.stopped")).toBeVisible()
    await expect(admin.getByText("impersonation.started")).toBeVisible()

    await userPage.goto(`${URLS.auth}/admin`)
    await expect(userPage.getByText(/page not found/i)).toBeVisible()
  } finally {
    await adminCtx.close()
    await userCtx.close()
  }
})
