import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { uniqueEmail } from "../fixtures/accounts"
import { latestMail } from "../fixtures/mail"

const JOINED = "You're on the list — check your inbox."

test("home: header, footer, pricing tiers", async ({ page }) => {
  await page.goto(URLS.www)
  // A fresh visitor (no consent cookie yet) sees the banner before anything else.
  await expect(page.getByRole("region", { name: "Cookie consent" })).toBeVisible()
  await expectAccessible(page, { label: "www cookie banner", route: "www:/" })
  await expect(page.getByRole("banner")).toBeVisible()
  await expect(page.getByRole("contentinfo")).toBeVisible()
  for (const plan of ["Free", "Pro", "Team"]) {
    await expect(page.getByRole("heading", { name: plan, exact: true }).first()).toBeVisible()
  }
})

test("legal pages render", async ({ page }) => {
  for (const path of ["/terms", "/privacy"]) {
    await page.goto(`${URLS.www}${path}`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  }
})

test.describe("waitlist", () => {
  test("accepts an email with JavaScript", async ({ page }) => {
    const email = uniqueEmail("wait")
    await page.goto(URLS.www)
    await page.getByRole("textbox", { name: "Email", exact: true }).fill(email)
    await page.getByRole("button", { name: "Join the waitlist", exact: true }).click()
    await expect(page.getByRole("status").filter({ hasText: JOINED })).toBeVisible()
    await latestMail(email, /^You're on the list$/)
  })

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false })
    test("accepts an email", async ({ page }) => {
      await page.goto(URLS.www)
      const field = page.getByRole("textbox", { name: "Email", exact: true })
      await field.fill(uniqueEmail("wait-nojs"))
      // Enter submits the form natively. A click never lands here: with scripts off, Playwright's
      // stability check on the button (requestAnimationFrame-based) never settles.
      await field.press("Enter")
      await expect(page.getByText(JOINED, { exact: true })).toBeVisible()
    })
  })
})
