import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"
import { latestMailTo } from "../fixtures/mail"

// www is Swedish by default: the copy below is `apps/www/src/content/contact.ts`.

test("a visitor contacts Yasmina and gets a tailored next step; the admin sees the lead", async ({
  page,
}) => {
  const email = uniqueEmail("contact")
  const name = `Ada ${email.split("@")[0]}`
  const started = Date.now()
  await page.goto(`${URLS.www}/kontakt`)
  await expect(
    page.getByRole("heading", { level: 1, name: "Berätta var du står, så hör Yasmina av sig" })
  ).toBeVisible()
  await expect(page.getByText("Du får svar inom två arbetsdagar.")).toBeVisible()
  await expectAccessible(page, { label: "www /kontakt step 1", route: "www:/kontakt" })

  // Step 1 refuses to move on without an answer, then takes one.
  await page.getByRole("button", { name: "Fortsätt" }).click()
  await expect(page.getByText("Välj vem du skriver för.")).toBeVisible()
  await page.getByRole("radio", { name: /^Mig själv/ }).check()
  await page.getByRole("button", { name: "Fortsätt" }).click()

  // Step 2: what and how soon.
  await expect(page.getByRole("heading", { level: 2, name: "Vad behöver du?" })).toBeFocused()
  await page.getByRole("radio", { name: "Ledarskap inifrån: coachning" }).check()
  await page.getByRole("radio", { name: "Inom en månad" }).check()
  await page
    .getByLabel("Berätta kort om din situation (valfritt)")
    .fill("Jag har nyss blivit chef och vill hitta mitt eget sätt att leda.")
  await page.getByRole("button", { name: "Fortsätt" }).click()

  // Step 3: details; the consent box is required, the newsletter box is not.
  await expect(page.getByRole("heading", { level: 2, name: "Dina uppgifter" })).toBeFocused()
  await page.getByLabel("Namn", { exact: true }).fill(name)
  await page.getByLabel("E-post", { exact: true }).fill(email)
  await expect(page.getByLabel("Organisation", { exact: true })).toBeHidden()
  await page.getByRole("button", { name: "Skicka" }).click()
  await expect(page.getByText("Kryssa i rutan så att Yasmina kan svara dig.")).toBeVisible()
  await page.getByRole("checkbox", { name: "Yasmina får kontakta mig om det här ärendet." }).check()
  await expectAccessible(page, { label: "www /kontakt step 3", route: "www:/kontakt" })
  await page.getByRole("button", { name: "Skicka" }).click()

  // The done page: the reference and the next step the answers lead to.
  await expect(page).toHaveURL(/\/kontakt\/tack\?ref=LEAD-\d+&for=private&need=inner_coaching/)
  await expect(
    page.getByRole("heading", { level: 1, name: "Tack, nu vet Yasmina var du står" })
  ).toBeVisible()
  const reference = new URL(page.url()).searchParams.get("ref") ?? ""
  await expect(page.getByText(reference, { exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Boka ett startsamtal" })).toHaveAttribute(
    "href",
    "/book/inner_start_coaching"
  )
  await expect(page.getByRole("heading", { level: 2, name: "Vad händer nu" })).toBeVisible()
  await expectAccessible(page, { label: "www /kontakt/tack", route: "www:/kontakt/tack" })

  // The confirmation is Swedish (the action sends x-locale) and carries the next step's link.
  const mail = await latestMailTo(email, { after: started })
  expect(mail.subject).toBe(`Tack för att du hörde av dig (${reference})`)
  expect(mail.text).toContain("/book/inner_start_coaching")
  expect(mail.text).not.toContain("nyss blivit chef")

  // Yasmina's admin: the lead is in the pipeline; she marks it contacted with a note.
  await ensureAdmin(page, "admin@e2e.test")
  await page.goto(`${URLS.auth}/admin/leads`)
  await expect(page.getByRole("link", { name: /^All/ })).toHaveAttribute("aria-current", "page")
  await expectAccessible(page, { label: "auth /admin/leads", route: "auth:/admin/leads" })
  await page.getByRole("link", { name: name, exact: true }).click()
  await expect(page).toHaveURL(/\/admin\/leads\/\d+$/)
  await expect(page.getByText("Ledarskap inifrån: coaching", { exact: true })).toBeVisible()
  await expect(page.getByText("Jag har nyss blivit chef", { exact: false })).toBeVisible()
  await expect(page.getByRole("link", { name: email.toLowerCase() })).toHaveAttribute(
    "href",
    `mailto:${email.toLowerCase()}`
  )
  await expectAccessible(page, { label: "auth /admin/leads/[id]", route: "auth:/admin/leads/[id]" })
  await page.getByLabel("Status").selectOption("contacted")
  await page.getByLabel("Notes").fill("Ringde på tisdagen, startsamtal bokas.")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByRole("status").filter({ hasText: "Saved." })).toBeVisible()
  await page.goto(`${URLS.auth}/admin/leads?status=contacted`)
  await expect(page.getByRole("link", { name: name, exact: true })).toBeVisible()
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("an organisation's workshop request shows every step at once and gets a proposal", async ({
    page,
  }) => {
    await page.goto(`${URLS.www}/kontakt`)
    // Every step's heading is on the page at once; the Continue buttons are not.
    for (const heading of ["Vem skriver du för?", "Vad behöver du?", "Dina uppgifter"]) {
      await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible()
    }
    await expect(page.getByRole("button", { name: "Fortsätt" }).first()).toBeHidden()
    await page.getByRole("radio", { name: /^En organisation/ }).check()
    await page.getByRole("radio", { name: "Workshop, föreläsning eller keynote" }).check()
    await page.getByRole("radio", { name: "Inom tre månader" }).check()
    await page.getByLabel("Namn", { exact: true }).fill("Bo Ek")
    await page.getByLabel("Organisation", { exact: true }).fill("Varbergs kommun")
    await page
      .getByRole("checkbox", { name: "Yasmina får kontakta mig om det här ärendet." })
      .check()
    const field = page.getByLabel("E-post", { exact: true })
    await field.fill(uniqueEmail("contact-nojs"))
    // Enter submits the form natively (a click never settles with scripts off).
    await field.press("Enter")
    await expect(page).toHaveURL(/\/kontakt\/tack\?ref=LEAD-\d+&for=organisation&need=talk/)
    await expect(page.getByRole("link", { name: "Föreslå datum" })).toHaveAttribute(
      "href",
      "/book/keynote"
    )
  })
})
