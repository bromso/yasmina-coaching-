import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("the stuck header's account menu opens on screen after the page has scrolled", async ({
  page,
}) => {
  // A modal menu locks scrolling with `overflow: hidden` on body. If html clips its own overflow,
  // body becomes a scroll box under that lock: the sticky header falls back to the top of the
  // page and the menu opens off-screen, where nothing in it can be clicked.
  await signUpVerified(page, uniqueEmail("header-menu"))
  await page.goto(`${URLS.account}/security`)
  await page.evaluate(() =>
    window.scrollTo({ top: document.body.scrollHeight, behavior: "instant" })
  )
  await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(300)

  await page.getByRole("button", { name: /^Account menu for/ }).click()
  const menu = page.getByRole("menu")
  await expect(menu).toBeVisible()
  await expect(menu).toBeInViewport()
  await expect(page.locator('[data-slot="site-header"]')).toBeInViewport()
  await expect(page.getByRole("menuitem", { name: "Sign out" })).toBeInViewport()
})
