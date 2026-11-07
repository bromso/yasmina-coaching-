import { type Browser, expect, test } from "@playwright/test"
import { type AllowEntry, applyAllowlist, routeMatches } from "../a11y/core"
import { A11Y_PAGES, type A11yPage, type Variant, variantsFor } from "../a11y/routes"
import { ALLOWLIST, axeViolations, expectAccessible } from "../fixtures/a11y"
import { applyVariant, resolvePath, storageStateFor, urlFor } from "../fixtures/a11y-session"

/** Opens `entry` in a fresh context signed in as its `auth`, in `variant`. */
async function openEntry(browser: Browser, entry: A11yPage, variant: Variant) {
  const storageState =
    entry.auth === "none" ? undefined : await storageStateFor(browser, entry.auth)
  const context = await browser.newContext({ storageState })
  const page = await context.newPage()
  await applyVariant(context, page, variant)
  const path = await resolvePath(page, entry)
  const response = await page.goto(urlFor(entry.app, path))
  return { context, page, path, response, route: `${entry.app}:${path.split("?")[0]}` }
}

for (const entry of A11Y_PAGES) {
  for (const variant of variantsFor(entry)) {
    const label = `${entry.app} ${entry.path} ${variant}`
    test(`axe: ${label}`, async ({ browser }) => {
      const { context, page, path, response, route } = await openEntry(browser, entry, variant)
      if (entry.route === "404") {
        expect(response?.status()).toBe(404)
      } else {
        expect(response?.ok(), `${label} answered ${response?.status()}`).toBe(true)
        // A signed-in page that bounced to /login would be checked as the wrong page.
        expect(new URL(page.url()).pathname).toBe(new URL(urlFor(entry.app, path)).pathname)
      }
      await page.waitForLoadState("networkidle")
      await expectAccessible(page, { label, route })
      await context.close()
    })
  }
}

// A stale allowlist entry hides nothing today but would hide a future regression on its route, so
// each one must still cover a real violation. This test checks every entry on its own pages (light
// variant) rather than counting what the sweep above matched: that count lived in one worker's
// memory and reset whenever Playwright replaced the worker after a failure, so a retried run
// skipped the check without a word. `state: true` entries cover a journey state no page load
// reaches (the keyboard spec exercises those), so they are skipped. Today's allowlist holds only
// such an entry, so this test passes trivially until a page entry is added.
test("every allowlist entry still matches a violation", async ({ browser }) => {
  test.setTimeout(120_000)
  const stale: Array<AllowEntry & { why: string }> = []
  for (const entry of ALLOWLIST.filter((e) => !e.state)) {
    let pages = 0
    let covered = false
    for (const candidate of A11Y_PAGES) {
      // Only an admin detail page's route depends on a run-time id; every other one is static.
      const known = `${candidate.app}:${candidate.path.split("?")[0]}`
      if (!candidate.setup && !routeMatches(entry.route, known)) continue
      const { context, page, route } = await openEntry(browser, candidate, "light")
      if (routeMatches(entry.route, route)) {
        pages += 1
        await page.waitForLoadState("networkidle")
        covered = applyAllowlist(await axeViolations(page), [entry], route).matched.length > 0
      }
      await context.close()
      if (covered) break
    }
    if (!covered) stale.push({ ...entry, why: pages ? "no violation left" : "no manifest page" })
  }
  expect(stale, `stale a11y.allowlist.json entries:\n${JSON.stringify(stale, null, 2)}`).toEqual([])
})
