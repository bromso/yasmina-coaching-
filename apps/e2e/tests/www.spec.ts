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

// The legal pages moved to the legal app; www's old paths redirect there permanently, in the
// reader's language: Swedish without a `locale` cookie, English with `locale=en`.
test("the old legal pages redirect to the legal app in the reader's language", async ({
  request,
}) => {
  for (const [path, sv, en] of [
    ["/privacy", "/integritet", "/en/privacy"],
    ["/terms", "/villkor", "/en/terms"],
  ]) {
    const swedish = await request.get(`${URLS.www}${path}`, { maxRedirects: 0 })
    expect(swedish.status()).toBe(308)
    expect(swedish.headers().location).toBe(`${URLS.legal}${sv}`)
    // The target follows the cookie: never cached, or a language switch would not reach it.
    expect(swedish.headers()["cache-control"]).toBe("private, no-store")
    const english = await request.get(`${URLS.www}${path}`, {
      maxRedirects: 0,
      headers: { cookie: "locale=en" },
    })
    expect(english.status()).toBe(308)
    expect(english.headers().location).toBe(`${URLS.legal}${en}`)
    expect(english.headers()["cache-control"]).toBe("private, no-store")
  }
})

test("the home page's contact section leads to the contact page", async ({ page }) => {
  await page.goto(URLS.www)
  await expect(page.getByRole("heading", { level: 2, name: "Börja med ett samtal" })).toBeVisible()
  await page.getByRole("link", { name: "Kontakta Yasmina" }).last().click()
  await expect(page).toHaveURL(`${URLS.www}/kontakt?from=/`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
})
