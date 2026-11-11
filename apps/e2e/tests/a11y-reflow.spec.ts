import { expect, test } from "@playwright/test"
import { A11Y_PAGES } from "../a11y/routes"
import { resolvePath, storageStateFor, urlFor } from "../fixtures/a11y-session"

// WCAG 1.4.10: at 320 CSS px wide nothing may force sideways scrolling of the page. A table, code
// block or chart scrolling inside its own container is fine — it does not widen the document.
// Every manifest entry: the admin detail pages resolve their id first, and the not-found pages
// (answered 404) render each app's status page, which must reflow like any other.
const UNCLIP = "html, body { overflow-x: visible !important; }"

for (const entry of A11Y_PAGES) {
  test(`reflow: ${entry.app} ${entry.path}`, async ({ browser }) => {
    const storageState =
      entry.auth === "none" ? undefined : await storageStateFor(browser, entry.auth)
    const context = await browser.newContext({
      storageState,
      viewport: { width: 320, height: 640 },
    })
    const page = await context.newPage()
    await page.goto(urlFor(entry.app, await resolvePath(page, entry)))
    await page.waitForLoadState("networkidle")
    // @repo/ui clips horizontal overflow on html and body (so a decorative glow never pans the
    // page), which would also hide real overflow from scrollWidth. Lift the clip to measure: what
    // overflows here would be cut off, unreachable, on the real page.
    await page.addStyleTag({ content: UNCLIP })
    const overflow = await page.evaluate(() => {
      const doc = document.documentElement
      if (doc.scrollWidth <= doc.clientWidth) return null
      const wide = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide }
    })
    expect(overflow, `scrolls sideways at 320 px: ${JSON.stringify(overflow)}`).toBeNull()
    await context.close()
  })
}
