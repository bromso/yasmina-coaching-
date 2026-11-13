import { expect, test } from "@playwright/test"
import { shared, URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"
import { availabilityRange, calendarDay, needsEarlyStart } from "../fixtures/booking"
import { latestMail, linkIn } from "../fixtures/mail"

/**
 * The booking journey end to end: a visitor's request reaches Yasmina's admin calendar, her
 * confirmation reaches the visitor with a fresh manage link, and the visitor can cancel online
 * until the day before. The request is sent through the api's REST surface (the same call the
 * www form makes) so the admin half is exercised on its own; the www calendar journey is below.
 */

const api = (path: string) => `${URLS.api}/openapi${path}`
const headers = {
  authorization: `Bearer ${shared.API_SERVICE_TOKEN}`,
  "x-api-client-id": "e2e-booking",
}

test("a workshop request: admin confirms, the customer gets a new manage link and cancels", async ({
  page,
  request,
}) => {
  const email = uniqueEmail("booking")
  const started = Date.now()
  const response = await request.post(api("/booking/request"), {
    headers,
    data: {
      offering: "workshop",
      customer: { name: "Ada Lovelace", email, organisation: "Varbergs kommun" },
      location: "on_site",
      preferredDates: [
        { date: "2099-03-02", part: "full_day" },
        { date: "2099-03-04", part: "morning" },
      ],
      attendees: 12,
      venue: "Stadshuset",
      message: "A team day for our new preventive unit.",
      termsAccepted: true,
    },
  })
  expect(response.ok()).toBe(true)
  const { reference } = (await response.json()) as { reference: string; manageUrl: string }
  expect(reference).toMatch(/^BK-\d+$/)
  const received = await latestMail(email, /received your request/i, { after: started })
  const firstManage = linkIn(received, /\/book\/manage\//)

  // The pending request is on the admin calendar page, and its detail page has the Confirm form.
  await ensureAdmin(page, "admin@e2e.test")
  await page.goto(`${URLS.auth}/admin/bookings`)
  await expect(page.getByText(reference, { exact: true })).toBeVisible()
  await page.getByRole("link", { name: `Open ${reference}` }).click()
  await expect(page).toHaveURL(/\/admin\/bookings\/\d+$/)
  await expect(page.getByText("Stadshuset")).toBeVisible()
  await expect(page.getByText("A team day for our new preventive unit.")).toBeVisible()
  await expectAccessible(page, {
    label: "auth /admin/bookings/[id] pending",
    route: "auth:/admin/bookings/[id]",
  })
  await page.getByLabel(/start/i).first().fill("2099-03-02T09:00")
  await page.getByRole("button", { name: /^confirm/i }).click()
  await expect(page.getByText(/confirmed/i).first()).toBeVisible()

  // The confirmation carries the Stockholm time and a manage link that differs from the first.
  const confirmed = await latestMail(email, /booking is confirmed/i, { after: started })
  expect(confirmed.text).toContain("2 March 2099")
  expect(confirmed.text).toContain("09:00")
  const manageUrl = linkIn(confirmed, /\/book\/manage\//)
  expect(manageUrl).not.toBe(firstManage)

  // The old link is dead; the new one lists the booking as confirmed and lets the customer cancel.
  // www is Swedish (`apps/www/src/content/booking.tsx`, `src/app/not-found.tsx`).
  await page.context().clearCookies()
  await page.goto(firstManage)
  await expect(page.getByText(/sidan finns inte/i)).toBeVisible()
  await page.goto(manageUrl)
  await expect(page.getByText(new RegExp(reference)).first()).toBeVisible()
  await expect(page.getByText(/bekräftad/i).first()).toBeVisible()
  await expectAccessible(page, {
    label: "www /book/manage/[token]",
    route: "www:/book/manage/[token]",
  })
  // The cancel form sits behind a disclosure, so a stray click never cancels anything.
  await page.getByText("Avboka den här sessionen", { exact: true }).click()
  const confirmBox = page.getByRole("checkbox", { name: /ja, avboka den här sessionen/i })
  await confirmBox.scrollIntoViewIfNeeded()
  await confirmBox.check({ force: true })
  await page.getByRole("button", { name: "Avboka", exact: true }).click()
  await expect(page.getByText(/avbokad/i).first()).toBeVisible()
  // The order was created over REST with no `x-locale`, so the api stored English and this
  // mail stays English — the www cancel action's `x-locale: sv` does not change a stored order.
  const cancelled = await latestMail(email, /booking is cancelled/i, { after: started })
  expect(cancelled.text).toMatch(/as requested/i)
})

test("a visitor books a coaching session from the calendar and gets the confirmation", async ({
  page,
}) => {
  const email = uniqueEmail("session")
  const started = Date.now()
  const consoleErrors: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text())
  })
  page.on("pageerror", (error) => consoleErrors.push(error.message))
  // The calendar's own data source on this origin answers before the page is even opened.
  const { from, to } = availabilityRange()
  const availability = await page.request.get(
    `${URLS.www}/api/booking/availability?offering=session&from=${from}&to=${to}`
  )
  expect(availability.status(), await availability.text()).toBe(200)
  await page.goto(`${URLS.www}/book`)
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
  await expectAccessible(page, { label: "www /book", route: "www:/book" })
  // The first "Välj en tid" card is the single coaching session.
  await page.getByRole("link", { name: "Välj en tid" }).first().click()
  await expect(page).toHaveURL(/\/book\/session/)

  // Step 1: the calendar loads the month's free slots; pick the first bookable day and slot.
  const grid = page.locator(".rdp-root, [data-slot=calendar]").first()
  await expect(grid).toBeVisible()
  const day = grid.locator("button[data-day]:not([disabled])").first()
  await expect(day, consoleErrors.join("\n")).toBeVisible({ timeout: 15_000 })
  // Whether this private client must consent to an early start depends on the day picked.
  const earlyStart = needsEarlyStart(await calendarDay(day))
  await day.click()
  const slot = page
    .getByRole("button", { pressed: false })
    .filter({ hasText: /^\d\d:\d\d$/ })
    .first()
  await expect(slot).toBeVisible()
  const time = (await slot.textContent())?.trim() ?? ""
  await slot.click()
  await expect(page.getByRole("button", { pressed: true }).filter({ hasText: time })).toBeVisible()
  await page.getByRole("button", { name: /vidare till dina uppgifter/i }).click()

  // Step 2: who is booking. "Name" and "Email" are the details form's own (still English) labels.
  await page.getByLabel("Namn", { exact: true }).fill("Ada Lovelace")
  await page.getByLabel("E-post", { exact: true }).fill(email)
  // The terms box: unticked, the next step is refused with its own message; ticked, it opens.
  await page.getByRole("button", { name: /fortsätt till betalning/i }).click()
  await expect(page.getByText("Du behöver godkänna villkoren för att boka.")).toBeVisible()
  await page.getByRole("checkbox", { name: /jag har läst villkoren/i }).check()
  // Inside the withdrawal period (`withdrawalLastDay`), a private client must also ask for the
  // session to take place within it: unticked, refused with its own message. Past it, no box.
  const earlyStartBox = page.getByRole("checkbox", { name: /tjänsten börjar inom ångerfristen/i })
  if (earlyStart) {
    await page.getByRole("button", { name: /fortsätt till betalning/i }).click()
    await expect(
      page.getByText(
        "Bekräfta att tillfället får äga rum inom ångerfristen, eller välj en tid längre fram."
      )
    ).toBeVisible()
    await earlyStartBox.check()
  } else {
    await expect(earlyStartBox).toBeHidden()
  }
  await expectAccessible(page, {
    label: "www /book/session details",
    route: "www:/book/[offering]",
  })
  await page.getByRole("button", { name: /fortsätt till betalning/i }).click()

  // Step 3: payment. A single session is priced in writing, so invoice is the only method and is
  // already chosen; the mock books straight away (`apps/www/src/lib/mock-payment.ts`).
  await expect(page.getByRole("heading", { name: "Betalning", level: 2 })).toBeFocused()
  await expect(page.getByText(/när yasmina har bekräftat priset/i)).toBeVisible()
  await expect(page.getByRole("radio", { name: /^Faktura/ })).toBeChecked()
  await expect(page.getByRole("radio", { name: /^Swish/ })).toHaveCount(0)
  await expectAccessible(page, {
    label: "www /book/session payment",
    route: "www:/book/[offering]",
  })
  await page.getByRole("button", { name: /boka och betala mot faktura/i }).click()

  // Step 4: the confirmation page, the mail with the Stockholm time and the manage link.
  await expect(page).toHaveURL(/\/book\/done\?.*paid=invoice_quote/)
  await expect(page.getByText(/BK-\d+/)).toBeVisible()
  await expect(page.getByText(/du betalar mot faktura/i)).toBeVisible()
  await expectAccessible(page, { label: "www /book/done", route: "www:/book/done" })
  // The www action sends `x-locale: sv`, stored on the order: the confirmation mail is Swedish.
  const confirmed = await latestMail(email, /bokning är bekräftad/i, { after: started })
  // Swedish times are written "kl. 09.00"; the slot button shows "09:00".
  expect(confirmed.text).toContain(time.replace(":", "."))
  // It links the terms the visitor accepted, on the legal app, in the booking's language.
  expect(confirmed.text).toContain(`Villkoren för bokningen: ${URLS.legal}/villkor`)
  const manageUrl = linkIn(confirmed, /\/book\/manage\//)
  await page.goto(manageUrl)
  await expect(page.getByText(/bekräftad/i).first()).toBeVisible()
})
