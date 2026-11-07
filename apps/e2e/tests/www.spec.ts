import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { uniqueEmail } from "../fixtures/accounts"
import { latestMail } from "../fixtures/mail"

// www is Swedish: the copy below is `apps/www/src/content/home.tsx` and `src/lib/actions.ts`.
const JOINED = "Tack. En bekräftelse är på väg, och Yasmina hör av sig."

test("home: header, footer, the four coaching formats", async ({ page }) => {
  await page.goto(URLS.www)
  // A fresh visitor (no consent cookie yet) sees the banner before anything else.
  await expect(page.getByRole("region", { name: "Samtycke till kakor" })).toBeVisible()
  await expectAccessible(page, { label: "www cookie banner", route: "www:/" })
  await expect(page.getByRole("banner")).toBeVisible()
  await expect(page.getByRole("contentinfo")).toBeVisible()
  for (const offer of [
    "Ledarskapscoaching, en till en",
    "Teamutveckling",
    "Handledning för team inom socialt arbete",
    "Föreläsningar och workshoppar",
  ]) {
    await expect(page.getByRole("heading", { name: offer, exact: true })).toBeVisible()
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
    await page.getByRole("textbox", { name: "E-post", exact: true }).fill(email)
    await page.getByRole("button", { name: "Be om ett introsamtal", exact: true }).click()
    await expect(page.getByRole("status").filter({ hasText: JOINED })).toBeVisible()
    // The action sends `x-locale: sv`, so the api's welcome mail is Swedish.
    await latestMail(email, /^Du står på listan$/)
  })

  test.describe("without JavaScript", () => {
    test.use({ javaScriptEnabled: false })
    test("accepts an email", async ({ page }) => {
      await page.goto(URLS.www)
      const field = page.getByRole("textbox", { name: "E-post", exact: true })
      await field.fill(uniqueEmail("wait-nojs"))
      // Enter submits the form natively. A click never lands here: with scripts off, Playwright's
      // stability check on the button (requestAnimationFrame-based) never settles.
      await field.press("Enter")
      await expect(page.getByText(JOINED, { exact: true })).toBeVisible()
    })
  })
})
