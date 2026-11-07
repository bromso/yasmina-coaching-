import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { storageStateFor, urlFor } from "../fixtures/a11y-session"
import { PASSWORD, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { expectFocusVisible, focusedName, tabTo } from "../fixtures/keyboard"

/** A tiny but valid PDF — `validatePdf` only checks the header and a trailing `%%EOF`. */
const TINY_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n")

test("sign in with the keyboard alone", async ({ page, browser }) => {
  const email = uniqueEmail("a11y-kbd")
  // The account has to exist before the keyboard-only run starts; create it in a separate
  // context so the main `page` never leaves the keyboard for a click.
  const setup = await browser.newContext()
  const setupPage = await setup.newPage()
  await signUpVerified(setupPage, email, "Keyboard User")
  await setup.close()

  await page.goto(`${URLS.auth}/login`)

  await page.keyboard.press("Tab")
  await expectFocusVisible(page)
  expect(await focusedName(page)).toMatch(/skip/i)

  // The password form has no accessible name of its own and comes before the magic-link form
  // below it, so the first "Email" field Tab reaches is its own (see fixtures/accounts.ts).
  await tabTo(page, "Email")
  await page.keyboard.type(email)
  await tabTo(page, "Password")
  await page.keyboard.type(PASSWORD)
  await tabTo(page, "Login")
  await page.keyboard.press("Enter")
  await expect(page).not.toHaveURL(/\/login/)
})

test("apply for a role with the keyboard alone", async ({ page }) => {
  await page.goto(`${URLS.jobs}/senior-fullstack-engineer`)

  await tabTo(page, "Apply for this role")
  await page.keyboard.press("Enter")
  await expect(page).toHaveURL(`${URLS.jobs}/senior-fullstack-engineer/apply`)

  const email = uniqueEmail("a11y-apply")
  await tabTo(page, "Name")
  await page.keyboard.type("Ada Lovelace")
  await tabTo(page, "Email")
  await page.keyboard.type(email)

  // The file input is set directly — there is no keyboard gesture for choosing a file.
  await page.getByLabel(/CV/).setInputFiles({
    name: "cv.pdf",
    mimeType: "application/pdf",
    buffer: TINY_PDF,
  })

  await tabTo(page, /I agree that my application is stored/)
  await page.keyboard.press("Space")
  await tabTo(page, "Apply")
  await page.keyboard.press("Enter")

  const status = page.getByRole("status").filter({ hasText: "we've received your application" })
  await expect(status).toBeVisible()
})

test("fill the contact form with the keyboard alone", async ({ page }) => {
  await page.goto(`${URLS.help}/contact`)

  const email = uniqueEmail("a11y-contact")
  await tabTo(page, "Email")
  await page.keyboard.type(email)
  await tabTo(page, "Name (optional)")
  await page.keyboard.type("Ada Lovelace")
  await tabTo(page, "Topic")
  // Type-ahead picks an option on a focused native select on every platform; ArrowDown opens the
  // popup instead on macOS.
  await page.keyboard.type("Account")
  await tabTo(page, "Message")
  await page.keyboard.type("Testing the keyboard-only contact flow.")
  await tabTo(page, "Send")
  await page.keyboard.press("Enter")

  const status = page.getByRole("status").filter({ hasText: "Your reference is" })
  await expect(status).toBeVisible()
})

test("rename the workspace and operate the account menu with the keyboard alone", async ({
  browser,
}) => {
  const storageState = await storageStateFor(browser, "user")
  const context = await browser.newContext({ storageState })
  const page = await context.newPage()

  await page.goto(urlFor("account", "/workspace"))

  await tabTo(page, "Name")
  await page.keyboard.press("Home")
  await page.keyboard.press("Shift+End")
  await page.keyboard.type("Accessibility Renamed")
  await tabTo(page, "Save name")
  await page.keyboard.press("Enter")
  await expect(page.getByText("Workspace renamed.", { exact: true })).toBeVisible()

  // The menu trigger sits in the header, before the form: go back to it rather than Tab forward
  // past the end of the page.
  await tabTo(page, /Account menu for/, { reverse: true })
  await page.keyboard.press("Enter")
  await expectFocusVisible(page)
  await expect(page.locator('[role="menuitem"]:focus')).toBeVisible()

  // Tab and arrow keys both stay inside the open menu.
  await page.keyboard.press("Tab")
  await expectFocusVisible(page)
  await expect(page.locator('[role="menuitem"]:focus')).toBeVisible()
  await page.keyboard.press("ArrowDown")
  await expectFocusVisible(page)
  await expect(page.locator('[role="menuitem"]:focus')).toBeVisible()

  // Escape closes the menu and returns focus to its trigger.
  await page.keyboard.press("Escape")
  await expect(page.getByRole("button", { name: /Account menu for/ })).toBeFocused()
  expect(await focusedName(page)).toMatch(/Account menu for/)
})
