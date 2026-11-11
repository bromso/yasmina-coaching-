import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"

// www is Swedish: the copy below is `apps/www/src/content/home.tsx`.

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

test("the home page's contact section leads to the contact page", async ({ page }) => {
  await page.goto(URLS.www)
  await expect(page.getByRole("heading", { level: 2, name: "Börja med ett samtal" })).toBeVisible()
  await page.getByRole("link", { name: "Kontakta Yasmina" }).last().click()
  await expect(page).toHaveURL(`${URLS.www}/kontakt`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
})
