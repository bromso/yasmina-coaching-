import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { ensureAdmin, PASSWORD, signIn, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail } from "../fixtures/mail"

const SUSPENDED_MESSAGE = "This account is suspended. Contact support."

/** The password sign-in form on `/login`, without the `signIn` fixture's "left /login" assertion
 * — used here to prove a suspended account's sign-in is refused, which the fixture cannot express. */
async function submitLogin(page: Page, email: string) {
  await page.goto(`${URLS.auth}/login`)
  const form = page.locator("form", { has: page.getByRole("button", { name: "Login" }) })
  await form.getByLabel("Email", { exact: true }).fill(email)
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await form.getByRole("button", { name: "Login" }).click()
}

test("suspend a user, refuse their sign-in, then unsuspend and let them in", async ({
  browser,
}) => {
  const adminCtx = await browser.newContext()
  const userCtx = await browser.newContext()
  try {
    const admin = await adminCtx.newPage()
    const userPage = await userCtx.newPage()
    const userEmail = uniqueEmail("suspend")
    await signUpVerified(userPage, userEmail, "Suspend Target")
    await ensureAdmin(admin, "admin@e2e.test")

    await admin.goto(`${URLS.auth}/admin/users?q=${encodeURIComponent(userEmail)}`)
    await admin.getByRole("link", { name: userEmail }).click()

    // Not suspended yet: the Suspend fields show. Their label is unique on the page — the
    // impersonate form beside it has its own "Reason".
    await admin.getByLabel("Reason for suspending").fill("e2e: suspicious activity")
    await admin.getByRole("button", { name: "Suspend account" }).click()
    await expect(
      admin.getByText("Account suspended; the user is signed out everywhere.", { exact: true })
    ).toBeVisible()

    const suspensionCard = admin.locator("article").filter({ hasText: "Suspension" })
    await expect(suspensionCard.getByText("Active", { exact: true })).toBeVisible()

    // The admin list's "Suspended only" filter and badge.
    await admin.goto(`${URLS.auth}/admin/users?q=${encodeURIComponent(userEmail)}&suspended=true`)
    const row = admin.getByRole("row").filter({ hasText: userEmail })
    await expect(row.getByText("Suspended", { exact: true })).toBeVisible()

    const suspendedMail = await latestMail(userEmail, /^Your account has been suspended$/)
    expect(suspendedMail.text).not.toContain("suspicious activity")

    // Sign-in is refused: the api's own message, no field error, the browser stays on /login.
    await submitLogin(userPage, userEmail)
    await expect(userPage.getByText(SUSPENDED_MESSAGE, { exact: true })).toBeVisible()
    await expect(userPage.locator('[aria-invalid="true"]')).toHaveCount(0)
    await expect(userPage).toHaveURL(/\/login/)

    // Lift the suspension.
    await admin.goto(`${URLS.auth}/admin/users?q=${encodeURIComponent(userEmail)}`)
    await admin.getByRole("link", { name: userEmail }).click()
    await admin.getByLabel("Reason for lifting").fill("e2e: cleared")
    await admin.getByRole("button", { name: "Lift suspension" }).click()
    await expect(
      admin.getByText("Suspension lifted; the user can sign in again.", { exact: true })
    ).toBeVisible()
    await expect(suspensionCard.getByText("Not suspended", { exact: true })).toBeVisible()

    const unsuspendedMail = await latestMail(userEmail, /^Your account is no longer suspended$/)
    expect(unsuspendedMail.text).not.toContain("cleared")

    // Sign-in works again.
    await signIn(userPage, userEmail)
  } finally {
    await adminCtx.close()
    await userCtx.close()
  }
})
