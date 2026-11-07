import { expect, test } from "@playwright/test"
import { shared, URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"

/**
 * "Ledarskap inifrån": the hub leads to a service page whose fixed start-call price is shown, the
 * start call is booked from the calendar (the member keys are hidden from /book but bookable by
 * link), and the group page lists only its own offering's events.
 */

test("from the hub to a booked start call", async ({ page }) => {
  const email = uniqueEmail("inner")
  await page.goto(`${URLS.www}/inifran`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await page.getByRole("link", { name: "Transformativ coachning" }).first().click()
  await expect(page).toHaveURL(/\/inifran\/coachning$/)
  await expect(page.getByText("2 250 kr").first()).toBeVisible()
  await page
    .getByRole("link", { name: /^Boka startsamtal/ })
    .first()
    .click()
  await expect(page).toHaveURL(/\/book\/inner_start_coaching/)

  const grid = page.locator(".rdp-root, [data-slot=calendar]").first()
  await expect(grid).toBeVisible()
  const day = grid.locator("button[data-day]:not([disabled])").first()
  await expect(day).toBeVisible({ timeout: 15_000 })
  await day.click()
  const slot = page
    .getByRole("button", { pressed: false })
    .filter({ hasText: /^\d\d:\d\d$/ })
    .first()
  await expect(slot).toBeVisible()
  await slot.click()
  await page.getByRole("button", { name: /vidare till dina uppgifter/i }).click()

  await page.getByLabel("Namn", { exact: true }).fill("Ada Lovelace")
  await page.getByLabel("E-post", { exact: true }).fill(email)
  await page.getByRole("button", { name: /bekräfta bokningen/i }).click()

  await expect(page).toHaveURL(/\/book\/done\?/)
  await expect(page.getByText(/BK-\d+/)).toBeVisible()
})

test("Inifrån group lists only its own events", async ({ page }) => {
  // The admin API wants a session: sign in as the e2e superadmin and forward its cookie.
  await ensureAdmin(page, "admin@e2e.test")
  const session = (await page.context().cookies()).find((c) => c.name === "session")?.value
  expect(session).toBeTruthy()
  const headers = {
    authorization: `Bearer ${shared.API_SERVICE_TOKEN}`,
    "x-api-client-id": "e2e-inner",
    "x-session-token": session ?? "",
  }
  const stamp = Date.now().toString(36)
  const titles = { group: `Plain group ${stamp}`, inner_group: `Inifrån grupp ${stamp}` }
  for (const offering of ["group", "inner_group"] as const) {
    const response = await page.request.post(`${URLS.api}/openapi/admin/bookings/group-events`, {
      headers,
      data: {
        title: titles[offering],
        offering,
        startsAt: "2099-05-04T16:00:00.000Z",
        durationMinutes: 60,
        capacity: 8,
        location: "video",
        repeatWeeks: 1,
      },
    })
    expect(response.ok(), await response.text()).toBe(true)
  }

  await page.goto(`${URLS.www}/book/inner_group`)
  await expect(page.getByText(titles.inner_group)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(titles.group)).toHaveCount(0)
  await expectAccessible(page, {
    label: "www /book/inner_group",
    route: "www:/book/[offering]",
  })

  await page.goto(`${URLS.www}/book/group`)
  await expect(page.getByText(titles.group)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(titles.inner_group)).toHaveCount(0)
})
