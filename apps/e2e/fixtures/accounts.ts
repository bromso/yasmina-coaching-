import { expect, type Page } from "@playwright/test"
import { URLS } from "../e2e.env"
import { latestMail, linkIn } from "./mail"

export const PASSWORD = "correct horse battery staple"
const run = Date.now().toString(36)
let n = 0
/** A fresh address per call, so per-email limiters never trip across tests or runs. */
export const uniqueEmail = (prefix: string) => `${prefix}-${run}-${++n}@e2e.test`

export async function signUp(page: Page, email: string, name = "E2E User") {
  await page.goto(`${URLS.auth}/signup`)
  await page.getByLabel("Name", { exact: true }).fill(name)
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  await expect(page).not.toHaveURL(/\/signup/)
}

export async function verify(page: Page, email: string) {
  const mail = await latestMail(email, /^Verify your email$/)
  await page.goto(linkIn(mail, /\/verify-email\?token=/))
  await expect(page.getByText("Email verified", { exact: true })).toBeVisible()
}

export async function signUpVerified(page: Page, email: string, name?: string) {
  await signUp(page, email, name)
  await verify(page, email)
}

export async function signIn(page: Page, email: string, next?: string) {
  await page.goto(`${URLS.auth}/login${next ? `?next=${encodeURIComponent(next)}` : ""}`)
  // The password form has no accessible name (the magic-link form below it does, and shares the
  // "Email" label), so find it by its submit button.
  const form = page.locator("form", { has: page.getByRole("button", { name: "Login" }) })
  await form.getByLabel("Email", { exact: true }).fill(email)
  await form.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await form.getByRole("button", { name: "Login" }).click()
  await expect(page).not.toHaveURL(/\/login/)
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: /^Account menu for/ }).click()
  await page.getByRole("menuitem", { name: "Sign out" }).click()
  await expect(page).toHaveURL(/\/login\?signedout=1/)
}

export async function createWorkspace(page: Page, name: string) {
  await page.goto(`${URLS.app}/workspaces/new`)
  await page.getByLabel("Workspace name", { exact: true }).fill(name)
  await page.getByRole("button", { name: "Create", exact: true }).click()
  await expect(page).toHaveURL(/\/notes/)
}

/**
 * `admin@e2e.test` is created fresh by the first spec that calls this on a given database (see
 * `e2e.env.ts`'s `SUPERADMIN_EMAILS`); a Playwright retry, or a later spec in the same serial run,
 * re-runs this against the same database, so a later attempt's sign-up is refused with the api's
 * CONFLICT ("An account with this email already exists", shown as the email field's error — see
 * apps/auth/src/lib/actions.test.ts). Fill the form directly (rather than through `signUp`, which
 * asserts the signup page is left) so the CONFLICT can be read from the page instead of surfacing
 * as a timeout, and fall back to signing in with the already-verified account. Shared by every
 * spec that needs the e2e superadmin, so each one stands alone whether or not another has already
 * created the account.
 */
export async function ensureAdmin(page: Page, email: string) {
  await page.goto(`${URLS.auth}/signup`)
  await page.getByLabel("Name", { exact: true }).fill("Root")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Create account" }).click()
  const conflict = page.getByText("An account with this email already exists")
  const left = page.waitForURL((url) => !url.pathname.startsWith("/signup")).catch(() => null)
  const stayed = conflict.waitFor({ state: "visible" }).catch(() => null)
  await Promise.race([left, stayed])
  if (await conflict.isVisible()) {
    await signIn(page, email)
    return
  }
  await verify(page, email)
}
