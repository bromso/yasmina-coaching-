import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"

const apps = ["www", "app", "auth", "account", "docs", "blog"] as const

for (const app of apps) {
  test(`${app}: health, CSP without unsafe-eval`, async ({ request }) => {
    const res = await request.get(`${URLS[app]}/api/health`)
    expect(res.ok()).toBe(true)
    // An anonymous visit to account redirects to the auth app, whose policy is not account's:
    // read account's off its health route, which the proxy covers too.
    const page = await request.get(app === "account" ? `${URLS[app]}/api/health` : URLS[app])
    const csp = page.headers()["content-security-policy"] ?? ""
    expect(csp).toContain("default-src 'self'")
    expect(csp).not.toContain("'unsafe-eval'")
  })
}

for (const app of ["www", "app", "auth", "docs", "blog"] as const) {
  test(`${app}: site nav and skip link`, async ({ page }) => {
    await page.goto(URLS[app])
    await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible()
    await expect(page.getByRole("link", { name: "Skip to content" })).toBeAttached()
  })
}

test("www: the mobile navigation sheet opens behind the hamburger", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(URLS.www)
  await page.getByRole("button", { name: "Open menu" }).click()
  const sheet = page.getByRole("dialog", { name: "Menu" })
  await expect(sheet).toBeVisible()
  await expectAccessible(page, { label: "www mobile nav sheet", route: "www:/" })
  await sheet.getByRole("button", { name: "Close" }).click()
  await expect(sheet).toBeHidden()
})
