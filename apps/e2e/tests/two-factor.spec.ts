import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { PASSWORD, signOut, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { nextStepCode, totpCode } from "../fixtures/totp"

const WRONG_CODE_MESSAGE = "That code didn't work. Check your authenticator app and try again."

/** The password step, up to the code page. `signIn` from the fixtures asserts it left `/login`,
 * which `/login/verify` does not. `checkA11y` runs the axe check once, on the first call — this
 * helper runs three times in the test below and the state never changes between them. */
async function passwordStep(page: Page, email: string, next: string, checkA11y = false) {
  await page.goto(`${URLS.auth}/login?next=${encodeURIComponent(next)}`)
  const form = page.locator("form", { has: page.getByRole("button", { name: "Login" }) })
  await form.getByLabel("Email", { exact: true }).fill(email)
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await form.getByRole("button", { name: "Login" }).click()
  await expect(page).toHaveURL(/\/login\/verify/)
  await expect(page.getByText("Enter your code", { exact: true })).toBeVisible()
  if (checkA11y) {
    await expectAccessible(page, {
      label: "auth /login/verify code field",
      route: "auth:/login/verify",
    })
  }
}

async function submitCode(page: Page, code: string, label = "Code") {
  await page.getByLabel(label, { exact: true }).fill(code)
  await page.getByRole("button", { name: "Verify" }).click()
}

test("turn on two-step verification, then sign in with a code and a recovery code", async ({
  page,
}) => {
  const email = uniqueEmail("2fa")
  const security = `${URLS.account}/security`
  await signUpVerified(page, email)

  // Turn on: the api re-checks the current password first. Scoped to the two-step card's own
  // setup form — the Security page also has a change-password form with its own "Current
  // password" field, and an unscoped `getByLabel` would hit both.
  await page.goto(security)
  const setupForm = page.locator("form", { has: page.getByRole("button", { name: "Turn on" }) })
  await setupForm.getByLabel("Current password", { exact: true }).fill(PASSWORD)
  await setupForm.getByRole("button", { name: "Turn on" }).click()
  const key = page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/)
  await expect(key).toBeVisible()
  await expectAccessible(page, { label: "account /security setup QR", route: "account:/security" })
  const secret = (await key.textContent()) ?? ""
  await page.getByLabel("Code", { exact: true }).fill(totpCode(secret))
  await page.getByRole("button", { name: "Turn on" }).click()

  // Shown once: keep the first recovery code.
  await expect(page.getByText("Your recovery codes", { exact: true })).toBeVisible()
  const codes = ((await page.locator("pre").textContent()) ?? "").trim().split("\n")
  expect(codes).toHaveLength(10)
  const recoveryCode = codes[0] ?? ""
  expect(recoveryCode).toMatch(/^[a-z0-9]{5}-[a-z0-9]{5}$/)
  await page.getByRole("link", { name: "Done" }).click()
  await expect(page.getByText("Two-step verification is on.", { exact: true })).toBeVisible()
  await signOut(page)

  // The password alone is not enough: a wrong code stays on the page, the right one signs in.
  await passwordStep(page, email, security, true)
  const now = [-30_000, 0, 30_000].map((offset) => totpCode(secret, Date.now() + offset))
  const wrong = ["000000", "111111", "222222"].find((code) => !now.includes(code)) ?? "333333"
  await submitCode(page, wrong)
  await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible()
  await expect(page).toHaveURL(/\/login\/verify/)
  // The enable code was the current step, which the api now refuses as a replay; the next one is
  // inside its ±1 window and later than it.
  await submitCode(page, nextStepCode(secret))
  await expect(page).toHaveURL(security)
  await signOut(page)

  // A recovery code signs in once.
  await passwordStep(page, email, security)
  await page.getByRole("link", { name: "Use a recovery code instead" }).click()
  await expect(page).toHaveURL(/recovery=1/)
  await submitCode(page, recoveryCode, "Recovery code")
  await expect(page).toHaveURL(security)
  await expect(page.getByText("9 recovery codes left.", { exact: true })).toBeVisible()
  await signOut(page)

  // ...and only once.
  await passwordStep(page, email, security)
  await page.getByRole("link", { name: "Use a recovery code instead" }).click()
  await expect(page).toHaveURL(/recovery=1/)
  await submitCode(page, recoveryCode, "Recovery code")
  await expect(page.getByText(WRONG_CODE_MESSAGE)).toBeVisible()
  await expect(page).toHaveURL(/\/login\/verify/)
})
