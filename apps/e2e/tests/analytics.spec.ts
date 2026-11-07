import type { Page } from "@playwright/test"
import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { ensureAdmin, signUpVerified, uniqueEmail } from "../fixtures/accounts"

/** Every `<td>` of every table row on the page, read regardless of visibility (a closed `<details>`
 * still holds its content in the DOM) — a plain DOM scan rather than Playwright locators, since a
 * server-rendered table that does not yet hold today's row must not make a locator time out. */
async function tableRows(page: Page): Promise<string[][]> {
  return page.$$eval("table tr", (trs) =>
    trs.map((tr) =>
      Array.from(tr.querySelectorAll("td")).map((td) => (td.textContent ?? "").trim())
    )
  )
}

/** The first row whose leading cells equal `prefix`, or `undefined` while it hasn't landed yet. */
async function findRow(page: Page, ...prefix: string[]): Promise<string[] | undefined> {
  const rows = await tableRows(page)
  return rows.find((cells) => prefix.every((value, i) => cells[i] === value))
}

const todayUtc = () => new Date().toISOString().slice(0, 10)

test("a www pageview and a sign-up show up on the superadmin's analytics dashboard", async ({
  page,
}) => {
  // The browser's <Analytics /> sends in a production build (what e2e runs), with no consent
  // needed for a pageview.
  await page.goto(URLS.www)

  const email = uniqueEmail("analytics")
  await signUpVerified(page, email, "Analytics User")
  // Drop the session the sign-up left behind (visiting /signup signed in would redirect away
  // before the admin form could be filled) without a UI sign-out round trip.
  await page.context().clearCookies()

  await ensureAdmin(page, "admin@e2e.test")
  await page.goto(`${URLS.auth}/admin/analytics`)

  const today = todayUtc()
  // The event jobs (recorded on sign-up and verify, and the pageview's own insert) run on the
  // api's in-process worker and drain on their own — poll by reloading rather than sleeping.
  // The minimum of the two columns reaching 1 proves both today's visitors and today's pageviews
  // are at least 1, the brief's exact requirement.
  await expect
    .poll(
      async () => {
        await page.reload()
        const row = await findRow(page, today)
        return row ? Math.min(Number(row[1]), Number(row[2])) : 0
      },
      { timeout: 15_000, intervals: [1_000] }
    )
    .toBeGreaterThanOrEqual(1)

  await expect
    .poll(
      async () => {
        await page.reload()
        const row = await findRow(page, "Signed up")
        return row ? Number(row[1]) : 0
      },
      { timeout: 15_000, intervals: [1_000] }
    )
    .toBeGreaterThanOrEqual(1)
})
