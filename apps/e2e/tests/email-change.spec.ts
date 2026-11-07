import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { PASSWORD, signIn, signOut, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

const NEW_PASSWORD = "a different horse battery staple"

/** The password sign-in form on `/login`, without the `signIn` fixture's "left /login" assertion
 * — used here once to prove a sign-in now fails (the fixture cannot express that). */
async function submitLogin(page: Page, email: string, password: string) {
  await page.goto(`${URLS.auth}/login`)
  const form = page.locator("form", { has: page.getByRole("button", { name: "Login" }) })
  await form.getByLabel("Email", { exact: true }).fill(email)
  await form.getByLabel("Password", { exact: true }).fill(password)
  await form.getByRole("button", { name: "Login" }).click()
}

/** The Email address card's own form on Personal info, scoped by its submit button (the page
 * also has a name form, with no password field of its own). */
function emailChangeForm(page: Page) {
  return page.locator("form", {
    has: page.getByRole("button", { name: /^(Change email|Send again)$/ }),
  })
}

test("change an email, undo it from the old address, then sign in with a new password", async ({
  page,
}) => {
  const addressA = uniqueEmail("change-a")
  const addressB = uniqueEmail("change-b")
  await signUpVerified(page, addressA)

  // Request the change, with the current password (the account has one, two-step is off).
  await page.goto(`${URLS.account}/personal-info`)
  const form = emailChangeForm(page)
  await form.getByLabel("New email address", { exact: true }).fill(addressB)
  await form.getByLabel("Current password", { exact: true }).fill(PASSWORD)
  await form.getByRole("button", { name: "Change email" }).click()
  await expect(form.getByRole("button", { name: "Send again" })).toBeVisible()

  // The confirm link went to the new address.
  const confirmMail = await latestMail(addressB, /^Confirm your new email address$/)
  await page.goto(linkIn(confirmMail, /\/email\/confirm\?token=/))
  await page.getByRole("button", { name: "Confirm new email" }).click()
  await expect(page.getByText(`Your email is now ${addressB}.`)).toBeVisible()

  await signOut(page)
  await signIn(page, addressB)

  // The old address was told the account's email changed, with a link to undo it.
  const changedMail = await latestMail(addressA, /^Your email address was changed$/)
  await page.goto(linkIn(changedMail, /\/email\/revert\?token=/))
  await page.getByRole("button", { name: "Restore my email" }).click()
  await expect(
    page.getByText(
      "Your email is restored. Every session was signed out, passkeys removed and anything set up after the change undone.",
      { exact: true }
    )
  ).toBeVisible()
  // The account had a password, so a reset link also went out.
  await expect(
    page.getByText("Check your email for a link to set a new password.", { exact: true })
  ).toBeVisible()

  // The new address no longer signs in — the account's email is back to the old one.
  await submitLogin(page, addressB, PASSWORD)
  await expect(page).toHaveURL(/\/login/)
  await expect(page.getByText("Invalid email or password")).toBeVisible()

  // The mailed reset link sets a new password for the restored (old) address.
  const resetMail = await latestMail(addressA, /^Reset your password$/)
  await page.goto(linkIn(resetMail, /\/reset-password\?token=/))
  await page.getByLabel("New password", { exact: true }).fill(NEW_PASSWORD)
  await page.getByLabel("Confirm password", { exact: true }).fill(NEW_PASSWORD)
  await page.getByRole("button", { name: "Set new password" }).click()
  await expect(page).toHaveURL(/\/login\?reset=1/)
  await expect(
    page.getByText("Your password was changed. Sign in with the new one.", { exact: true })
  ).toBeVisible()

  await submitLogin(page, addressA, NEW_PASSWORD)
  await expect(page).not.toHaveURL(/\/login/)
})

test("cancel a requested email change from the old address", async ({ page }) => {
  const address = uniqueEmail("cancel")
  const requested = uniqueEmail("cancel-new")
  await signUpVerified(page, address)

  await page.goto(`${URLS.account}/personal-info`)
  const form = emailChangeForm(page)
  await form.getByLabel("New email address", { exact: true }).fill(requested)
  await form.getByLabel("Current password", { exact: true }).fill(PASSWORD)
  await form.getByRole("button", { name: "Change email" }).click()
  await expect(form.getByRole("button", { name: "Send again" })).toBeVisible()

  // Keep the new address's confirm link for later — cancelling must void it too.
  const confirmMail = await latestMail(requested, /^Confirm your new email address$/)
  const confirmLink = linkIn(confirmMail, /\/email\/confirm\?token=/)

  // The current address was told a change was requested, with a link to cancel it.
  const requestedMail = await latestMail(address, /^Your email address is changing$/)
  await page.goto(linkIn(requestedMail, /\/email\/cancel\?token=/))
  await page.getByRole("button", { name: "Cancel this change" }).click()
  await expect(
    page.getByText("The change was cancelled and every session was signed out.", { exact: true })
  ).toBeVisible()

  // Cancelling ended every session, this browser's included.
  await signIn(page, address)
  await page.goto(`${URLS.account}/personal-info`)
  await expect(emailChangeForm(page).getByRole("button", { name: "Change email" })).toBeVisible()

  // The new address's confirm link is dead too.
  await page.goto(confirmLink)
  await page.getByRole("button", { name: "Confirm new email" }).click()
  await expect(page.getByText("This link is invalid, expired or already used")).toBeVisible()
})
