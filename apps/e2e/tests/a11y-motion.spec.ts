import { expect, test } from "@playwright/test"
import { urlFor } from "../fixtures/a11y-session"

const PAGES = [
  ["www", "/"],
  ["blog", "/welcome"],
  ["docs", "/getting-started"],
] as const

for (const [app, path] of PAGES) {
  test(`reduced motion: ${app} ${path}`, async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" })
    const page = await context.newPage()
    await page.goto(urlFor(app, path))
    await page.waitForLoadState("networkidle")
    // Poll rather than sleep: an entrance animation may start a moment after load, and under
    // reduced motion it must settle to none within the timeout.
    const running = () =>
      page.evaluate(() =>
        document
          .getAnimations()
          .filter((a) => a.playState === "running")
          .map((a) => {
            const timing = a.effect?.getComputedTiming()
            const target = (a.effect as KeyframeEffect | null)?.target as Element | null
            return {
              duration: Number(timing?.duration ?? 0),
              iterations: timing?.iterations,
              target: target
                ? `${target.tagName.toLowerCase()}.${target.className}`.slice(0, 80)
                : "?",
            }
          })
          .filter((a) => a.duration > 0)
      )
    // On timeout the failure shows the last poll's list (each animation's target) as "Received".
    await expect
      .poll(running, {
        message: "animations still running under reduced motion (targets under Received)",
        timeout: 3000,
      })
      .toEqual([])
    await context.close()
  })
}
