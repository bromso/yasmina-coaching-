import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { signOut, signUp, uniqueEmail } from "../fixtures/accounts"

// Service workers on production builds (they are disabled in `next dev`). The rules being checked
// live in @repo/ui/lib/service-worker-rules.

/** Waits until a service worker controls the page (the first visit installs it; a reload hands it over). */
async function controlled(page: Page) {
  await page.evaluate(() => navigator.serviceWorker.ready)
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller))) await page.reload()
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true)
}

/** Every Cache Storage entry on the page's origin: cache name, path, and whether a needle is in it. */
const cachedBodies = (page: Page, needles: string[]) =>
  page.evaluate(async (needles) => {
    const found: { cache: string; path: string; hit: boolean }[] = []
    for (const name of await caches.keys()) {
      const cache = await caches.open(name)
      for (const request of await cache.keys()) {
        const body = await ((await cache.match(request))?.text() ?? "")
        found.push({
          cache: name,
          path: new URL(request.url).pathname,
          hit: needles.some((needle) => body.includes(needle)),
        })
      }
    }
    return found
  }, needles)

test("each app registers a service worker scoped to its own origin", async ({ page }) => {
  for (const origin of [URLS.www, URLS.app, URLS.auth]) {
    await page.goto(`${origin}/`)
    const scope = await page.evaluate(async () => (await navigator.serviceWorker.ready).scope)
    expect(scope).toBe(`${new URL(origin).origin}/`)
  }
})

/** The names in the origin's Cache Storage, empty caches included. */
const cacheKeys = (page: Page) => page.evaluate(() => caches.keys())

test("a signed-in app never puts the user in Cache Storage, signed in or after sign-out", async ({
  page,
}) => {
  const email = uniqueEmail("pwa")
  const name = "Cache Probe"
  await signUp(page, email, name)
  await controlled(page)
  // A full navigation, then a client-side one through next/link (an RSC fetch).
  await page.goto(`${URLS.app}/`)
  await page.getByRole("link", { name: "Notes", exact: true }).click()
  await expect(page).toHaveURL(/\/(notes|workspaces\/new)$/)
  await expect(page.getByText(email)).toBeVisible()

  // The invariant is "never cached", so check while still signed in…
  expect((await cachedBodies(page, [email, name])).filter((e) => e.hit)).toEqual([])
  // …a private app keeps only its precache and the static cache…
  for (const cache of await cacheKeys(page)) {
    expect(cache.startsWith("serwist-") || cache === "static").toBe(true)
  }
  // …and again after sign-out, back on the app's origin.
  await signOut(page)
  await page.goto(`${URLS.app}/manifest.webmanifest`)
  expect((await cachedBodies(page, [email, name])).filter((e) => e.hit)).toEqual([])
})

test("offline: an uncached page shows the offline page; a visited public page still opens", async ({
  page,
  context,
}) => {
  // www is Swedish by default (`apps/www/src/content/contact.ts` and `inner.tsx`).
  await page.goto(`${URLS.www}/kontakt`)
  await controlled(page)
  await page.goto(`${URLS.www}/kontakt`) // now through the worker, so it lands in the pages cache
  await context.setOffline(true)
  try {
    await page.goto(`${URLS.www}/kontakt`)
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Berätta var du står, så hör Yasmina av sig"
    )
    await page.goto(`${URLS.www}/inifran`)
    await expect(page.getByRole("heading", { name: "You're offline" })).toBeVisible()
  } finally {
    await context.setOffline(false)
  }
  // Back online, "Try again" (an inline handler: the shared CSP must allow it) loads the real page.
  await page.getByRole("button", { name: "Try again" }).click()
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Starkt ledarskap börjar från insidan"
  )
})
