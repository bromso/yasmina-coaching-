import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import type { Browser } from "@playwright/test"
import type { PerfPage } from "../perf/core"
import { storageStateFor, urlFor } from "./a11y-session"

// The IIFE build of the `web-vitals` the apps ship (catalog: version). Its package exports do not
// list the file, so it is found next to the resolved entry point.
const require = createRequire(import.meta.url)
const IIFE = readFileSync(
  join(dirname(require.resolve("web-vitals")), "web-vitals.iife.js"),
  "utf8"
)

// Runs before any page script: `web-vitals` defines the `webVitals` global, and every LCP / CLS
// report (reportAllChanges) lands in `window.__vitals`. Top frame only.
const INIT = `${IIFE}
;(() => {
  if (window.top !== window) return
  const out = (window.__vitals = {})
  webVitals.onLCP((m) => { out.lcp = m.value }, { reportAllChanges: true })
  webVitals.onCLS((m) => { out.cls = m.value }, { reportAllChanges: true })
})()`

/**
 * Loads `page` once in a fresh context (signed in for a `user` page) and returns what web-vitals
 * reported. After `networkidle` the page is made hidden, which is when web-vitals finalises LCP
 * and CLS — without it CLS on a page with no shift is never reported at all.
 */
export async function measureVitals(
  browser: Browser,
  page: PerfPage
): Promise<{ lcp?: unknown; cls?: unknown } | undefined> {
  const storageState = page.auth === "user" ? await storageStateFor(browser, "user") : undefined
  const context = await browser.newContext({ storageState })
  try {
    const tab = await context.newPage()
    await tab.addInitScript(INIT)
    const url = urlFor(page.app, page.path)
    const response = await tab.goto(url)
    if (!response?.ok()) throw new Error(`${url} answered ${response?.status()}`)
    // A signed-in page that bounced to /login would be measured as the wrong page.
    if (new URL(tab.url()).pathname !== page.path)
      throw new Error(`${url} redirected to ${tab.url()}`)
    await tab.waitForLoadState("networkidle")
    return await tab.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true })
      document.dispatchEvent(new Event("visibilitychange"))
      return (window as unknown as { __vitals?: { lcp?: unknown; cls?: unknown } }).__vitals
    })
  } finally {
    await context.close()
  }
}
