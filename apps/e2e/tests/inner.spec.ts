import { expect, test } from "@playwright/test"
import { shared, URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"
import { calendarDay, needsEarlyStart } from "../fixtures/booking"

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
  // Whether this private client must consent to an early start depends on the day picked.
  const earlyStart = needsEarlyStart(await calendarDay(day))
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
  await page.getByRole("checkbox", { name: /jag har läst villkoren/i }).check()
  // Inside the withdrawal period (`withdrawalLastDay`) the private client consents; past it, no box.
  const earlyStartBox = page.getByRole("checkbox", { name: /tjänsten börjar inom ångerfristen/i })
  if (earlyStart) await earlyStartBox.check()
  else await expect(earlyStartBox).toBeHidden()
  await page.getByRole("button", { name: /fortsätt till betalning/i }).click()

  // Payment: the start call has a fixed price, so all four methods are offered. Pay with the
  // Swish mock: the number is checked in the browser and never posted with the booking.
  await expect(page.getByRole("heading", { name: "Betalning", level: 2 })).toBeFocused()
  await expect(page.getByText(/testläge: ingen betalning dras/i)).toBeVisible()
  for (const method of ["Apple Pay", "Google Pay", "Swish", "Faktura"]) {
    await expect(page.getByRole("radio", { name: new RegExp(`^${method}`) })).toBeVisible()
  }
  await page.getByRole("radio", { name: /^Swish/ }).check()
  const pay = page.getByRole("button", { name: /betala 2\s250\skr med swish/i })
  await pay.click()
  await expect(page.getByText(/fyll i ett svenskt mobilnummer/i)).toBeVisible()
  await page.getByLabel("Mobilnummer för Swish").fill("070 123 45 67")
  await pay.click()
  await expect(page.getByText(/öppna swish-appen/i)).toBeVisible()

  await expect(page).toHaveURL(/\/book\/done\?.*paid=swish/, { timeout: 15_000 })
  await expect(page.getByText(/BK-\d+/)).toBeVisible()
  await expect(page.getByText("Betalt med Swish (testläge).")).toBeVisible()
  expect(page.url()).not.toContain("0701234567")
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
  // One calendar: two events may not overlap, and a retry or rerun must not hit this run's own
  // events. So a day in 2099 that differs per run, and two hours apart on it.
  const day = new Date(Date.UTC(2099, 0, 1) + (Date.now() % 360) * 86_400_000)
  const startsAt = { group: 9, inner_group: 13 } as const
  for (const offering of ["group", "inner_group"] as const) {
    const response = await page.request.post(`${URLS.api}/openapi/admin/bookings/group-events`, {
      headers,
      data: {
        title: titles[offering],
        offering,
        startsAt: new Date(day.getTime() + startsAt[offering] * 3_600_000).toISOString(),
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
