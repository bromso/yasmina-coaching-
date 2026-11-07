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

// www defaults to Swedish (English only once picked); the other apps render their chrome in
// English for an anonymous visitor.
const english = { nav: "Site", skip: "Skip to content" }
const swedish = { nav: "Webbplats", skip: "Hoppa till innehållet" }
const chrome = { www: swedish, app: english, auth: english, docs: english, blog: english } as const

for (const app of ["www", "app", "auth", "docs", "blog"] as const) {
  test(`${app}: site nav and skip link`, async ({ page }) => {
    await page.goto(URLS[app])
    await expect(page.getByRole("navigation", { name: chrome[app].nav })).toBeVisible()
    await expect(page.getByRole("link", { name: chrome[app].skip })).toBeAttached()
  })
}

test("www: the navigation opens behind Utforska, on a phone, and closes on Escape", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(URLS.www)
  // Let the hero's entrance animation finish: axe would read its half-faded text as low contrast.
  await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)))
  const nav = page.getByRole("navigation", { name: "Webbplats" })
  const toggle = nav.getByRole("button", { name: "Utforska" })
  await expect(toggle).toHaveAttribute("aria-expanded", "false")
  await toggle.click()
  const close = nav.getByRole("button", { name: "Stäng menyn" })
  await expect(close).toHaveAttribute("aria-expanded", "true")
  await expect(nav.getByRole("link", { name: "Om Yasmina" })).toBeVisible()
  await expect(nav.getByRole("link", { name: /Coachingsamtal/ })).toBeVisible()
  // The panel's pieces spring in; let them settle before axe reads their contrast.
  await expect
    .poll(() =>
      nav.evaluate((root) =>
        [...root.querySelectorAll("a, b, p")].every((el) => {
          for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
            if (getComputedStyle(node).opacity !== "1") return false
          }
          return true
        })
      )
    )
    .toBe(true)
  await expectAccessible(page, { label: "www navigation open", route: "www:/" })
  await page.keyboard.press("Escape")
  await expect(nav.getByRole("link", { name: "Om Yasmina" })).toBeHidden()
  await expect(nav.getByRole("button", { name: "Utforska" })).toBeFocused()
})
