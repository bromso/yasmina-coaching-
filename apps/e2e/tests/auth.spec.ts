import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { createWorkspace, signIn, signOut, signUp, uniqueEmail, verify } from "../fixtures/accounts"

test("sign-up, verify, workspace, sign-out everywhere, sign back in", async ({ page }) => {
  const email = uniqueEmail("auth")
  await signUp(page, email, "Ada Lovelace")

  await page.goto(`${URLS.account}/personal-info`)
  await expect(page.getByText(email).first()).toBeVisible()
  await expect(page.getByText(/unverified|not verified|verify your email/i).first()).toBeVisible()

  await verify(page, email)
  await page.goto(`${URLS.account}/personal-info`)
  await expect(page.getByText(/unverified|not verified|verify your email/i)).toHaveCount(0)
  await expect(page.getByText("Verified", { exact: true })).toBeVisible()

  await page.goto(`${URLS.app}/notes`)
  await expect(page).toHaveURL(/\/workspaces\/new/)
  await createWorkspace(page, "Acme")
  await expect(page.getByRole("heading", { name: /notes · acme/i })).toBeVisible()

  await signOut(page)
  await page.goto(`${URLS.account}/`)
  await expect(page).toHaveURL(/auth\.brand\.localhost:3002\/login/)

  // A wrong password stays on the login form with its error, before the real sign-in below.
  await page.goto(`${URLS.auth}/login?next=${encodeURIComponent(`${URLS.account}/security`)}`)
  const loginForm = page.locator("form", { has: page.getByRole("button", { name: "Login" }) })
  await loginForm.getByLabel("Email", { exact: true }).fill(email)
  await loginForm.getByLabel("Password", { exact: true }).fill("wrong password")
  await loginForm.getByRole("button", { name: "Login" }).click()
  await expect(page.getByText("Invalid email or password", { exact: true })).toBeVisible()
  await expectAccessible(page, { label: "auth /login wrong-password error", route: "auth:/login" })

  await signIn(page, email, `${URLS.account}/security`)
  await expect(page).toHaveURL(`${URLS.account}/security`)
  await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible()
})
