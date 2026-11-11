import { expect, test } from "@playwright/test"
import { VISUAL_PAGES, VISUAL_THEMES, VISUAL_WIDTHS, visualUrl } from "../visual/pages"

// Visual baseline of www and blog. Opt-in (`VISUAL=1`, the `visual` project): snapshots are
// platform-specific and git-ignored (`visual/.snapshots/*-visual-darwin.png`, generated locally),
// so CI on Linux never runs it. See README.md.

// Anything whose pixels depend on the clock or on a playing video.
// The footer copyright carries the current year; the calendar shows the month and today.
const MASKED = ["video", "time", ".rdp-root", '[data-slot="calendar"]', 'p:has-text("©")']

for (const page of VISUAL_PAGES) {
  for (const theme of VISUAL_THEMES) {
    for (const width of VISUAL_WIDTHS) {
      test(`${page.name} · ${theme} · ${width}px`, async ({ browser }) => {
        const context = await browser.newContext({
          viewport: { width, height: 900 },
          colorScheme: theme,
          reducedMotion: "reduce",
          // The consent banner is part of the first visit and stays in the shot on purpose.
        })
        // next-themes reads this key; "system" would also follow colorScheme, this pins it.
        await context.addInitScript((value) => {
          try {
            localStorage.setItem("theme", value)
          } catch {}
        }, theme)
        const tab = await context.newPage()
        await tab.goto(visualUrl(page), { waitUntil: "networkidle" })
        await tab.evaluate(() => document.fonts.ready)
        // Finite animations finish first (same rule as fixtures/a11y.ts); endless ones are left.
        await tab
          .evaluate(() =>
            Promise.race([
              Promise.all(
                document
                  .getAnimations()
                  .filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
                  .map((a) => a.finished.catch(() => undefined))
              ),
              new Promise((resolve) => setTimeout(resolve, 3000)),
            ])
          )
          .catch(() => {})
        // Lazy images below the fold: scroll through once so fullPage captures them decoded.
        await tab.evaluate(async () => {
          for (let y = 0; y < document.body.scrollHeight; y += 600) {
            window.scrollTo(0, y)
            await new Promise((resolve) => setTimeout(resolve, 50))
          }
          window.scrollTo(0, 0)
        })
        await tab.waitForLoadState("networkidle")
        await expect(tab).toHaveScreenshot(`${page.name}-${theme}-${width}.png`, {
          fullPage: true,
          maxDiffPixelRatio: 0.001,
          animations: "disabled",
          mask: MASKED.map((selector) => tab.locator(selector)),
        })
        await context.close()
      })
    }
  }
}
