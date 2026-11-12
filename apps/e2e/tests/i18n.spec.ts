import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { PASSWORD, signIn, uniqueEmail } from "../fixtures/accounts"
import { latestMailTo, linkIn } from "../fixtures/mail"

/** The header's language menu trigger, named "Language: <current>" / "Språk: <current>". */
function localeMenu(page: Page) {
  return page.getByRole("button", { name: /^(Language|Språk): / })
}

/** Opens the header's language menu and activates a language: it applies at once (no button). */
async function chooseLanguage(page: Page, name: "English" | "Svenska") {
  await localeMenu(page).click()
  await page.getByRole("menuitem", { name, exact: true }).click()
}

/** Picks Svenska in the language menu (with JavaScript, by keyboard) or its disclosure (without). */
async function switchToSwedish(page: Page, { javaScript = true } = {}) {
  if (javaScript) {
    // By keyboard: Enter opens the menu on its first item (English, the current one), ArrowDown
    // moves to Svenska without changing anything, Enter activates it.
    await localeMenu(page).focus()
    await page.keyboard.press("Enter")
    await expect(page.getByRole("menuitem", { name: "English", exact: true })).toBeFocused()
    await page.keyboard.press("ArrowDown")
    await expect(page.getByRole("menuitem", { name: "Svenska", exact: true })).toBeFocused()
    await expect(page.locator("html")).toHaveAttribute("lang", "en")
    await page.keyboard.press("Enter")
  } else {
    // The server-rendered shell: a <details> whose languages are submit buttons in a form.
    await page.getByRole("banner").locator("summary").click()
    await page.getByRole("banner").getByRole("button", { name: "Svenska", exact: true }).click()
  }
  await expect(page.locator("html")).toHaveAttribute("lang", "sv")
}

/**
 * Personal info's Language card: a select (a settings field, unlike the header's menu) labelled
 * "Language" / "Språk", found inside the form with its own "Save language" / "Spara språk" button.
 */
function languageCard(page: Page) {
  return page.locator("form", {
    has: page
      .getByRole("button", { name: "Save language", exact: true })
      .or(page.getByRole("button", { name: "Spara språk", exact: true })),
  })
}

function languageCardSelect(page: Page) {
  return languageCard(page)
    .getByLabel("Language", { exact: true })
    .or(languageCard(page).getByLabel("Språk", { exact: true }))
}

function languageCardSubmit(page: Page) {
  return languageCard(page)
    .getByRole("button", { name: "Save language", exact: true })
    .or(languageCard(page).getByRole("button", { name: "Spara språk", exact: true }))
}

test("picking Svenska switches the page, carries to sign-up mail, and the saved choice wins over a cookie", async ({
  page,
  browser,
}) => {
  await page.goto(`${URLS.auth}/login`)
  await expect(page.getByText("Welcome back", { exact: true })).toBeVisible()

  await switchToSwedish(page)
  await expect(page.getByText("Välkommen tillbaka", { exact: true })).toBeVisible()
  await expect(page.getByLabel("Lösenord", { exact: true })).toBeVisible()

  // A wrong password's error is translated too: the api answers in the cookie's language.
  const form = page.locator("form", { has: page.getByRole("button", { name: "Logga in" }) })
  await form.getByLabel("E-post", { exact: true }).fill(uniqueEmail("sv-wrong"))
  await form.getByLabel("Lösenord", { exact: true }).fill("fel lösenord")
  await form.getByRole("button", { name: "Logga in" }).click()
  await expect(form.getByRole("alert")).toContainText("Fel e-postadress eller lösenord")

  // Sign up with the Swedish cookie still set: the new account's saved locale, and its
  // verification mail, are both Swedish — read by recipient, never by an English subject regex.
  const email = uniqueEmail("sv-signup")
  const before = Date.now()
  await page.goto(`${URLS.auth}/signup`)
  await page.getByLabel("Namn", { exact: true }).fill("Astrid Lindgren")
  await page.getByLabel("E-post", { exact: true }).fill(email)
  await page.getByLabel("Lösenord", { exact: true }).fill(PASSWORD)
  await page.getByRole("button", { name: "Skapa konto" }).click()
  await expect(page).not.toHaveURL(/\/signup/)

  const mail = await latestMailTo(email, { after: before })
  expect(mail.subject).toBe("Verifiera din e-postadress")
  expect(mail.text).toContain("Länken är giltig i 24 timmar")

  await page.goto(linkIn(mail, /\/verify-email\?token=/))
  await expect(page.getByText("E-postadressen är verifierad", { exact: true })).toBeVisible()

  // A fresh browser context with an English cookie: the saved preference (set at sign-up, above)
  // outranks it, so even a signed-in page with no locale cookie of its own reads Swedish.
  const fresh = await browser.newContext()
  try {
    await fresh.addCookies([{ name: "locale", value: "en", domain: ".brand.localhost", path: "/" }])
    const tab = await fresh.newPage()
    await signIn(tab, email)
    await tab.goto(`${URLS.auth}/login`)
    await expect(tab.locator("html")).toHaveAttribute("lang", "sv")
    await expect(tab.getByText("Du är inloggad", { exact: true })).toBeVisible()
  } finally {
    await fresh.close()
  }

  // app: the saved Swedish preference (from sign-up, above) carries over with no locale cookie
  // of its own — a fresh workspace and a note, both in Swedish.
  await page.goto(`${URLS.app}/workspaces/new`)
  await page.getByLabel("Arbetsytans namn", { exact: true }).fill("Astrids arbetsyta")
  await page.getByRole("button", { name: "Skapa", exact: true }).click()
  await expect(page).toHaveURL(/\/notes/)
  const heading = page.getByRole("heading", { level: 1 })
  await expect(heading).toContainText("Anteckningar")
  await expect(heading).toContainText("Astrids arbetsyta")

  await page.getByLabel("Titel", { exact: true }).fill("Första anteckningen")
  await page.getByLabel("Text", { exact: true }).fill("Hej från e2e")
  await page.getByRole("button", { name: "Lägg till anteckning", exact: true }).click()
  await expect(page.getByRole("listitem").filter({ hasText: "Första anteckningen" })).toBeVisible()

  // account: the sidebar and Personal info are Swedish; changing the name shows the Swedish
  // success message; the Language card switches to English and the page re-renders in English,
  // then switching back works.
  await page.goto(`${URLS.account}/personal-info`)
  await expect(page.getByRole("link", { name: "Personuppgifter", exact: true })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Personuppgifter", exact: true })).toBeVisible()

  await page.getByLabel("Namn", { exact: true }).fill("Astrid Lindgren Andersson")
  await page.getByRole("button", { name: "Spara namn", exact: true }).click()
  await expect(
    page.getByRole("status").filter({ hasText: "Namnet har uppdaterats." })
  ).toBeVisible()

  await languageCardSelect(page).selectOption("en")
  await languageCardSubmit(page).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByRole("status").filter({ hasText: "Language saved." })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Personal info", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Personal info", exact: true })).toBeVisible()

  await languageCardSelect(page).selectOption("sv")
  await languageCardSubmit(page).click()
  await expect(page.locator("html")).toHaveAttribute("lang", "sv")
  await expect(page.getByRole("status").filter({ hasText: "Språket har sparats." })).toBeVisible()
  await expect(page.getByRole("heading", { name: "Personuppgifter", exact: true })).toBeVisible()
  await expect(page.getByRole("link", { name: "Personuppgifter", exact: true })).toBeVisible()

  // www: Swedish by default; the language menu (in the navigation's panel, behind "Utforska")
  // writes the shared cookie and reloads, and the page comes back in English — then back in Swedish.
  // The choice sits on the shared cookie domain, so a fresh visit of the sign-in link already
  // arrives Swedish.
  const visitor = await browser.newContext()
  try {
    const tab = await visitor.newPage()
    await tab.goto(URLS.www)
    await expect(tab.locator("html")).toHaveAttribute("lang", "sv")
    await expect(
      tab.getByRole("heading", { level: 1, name: "Led så som du själv skulle vilja bli ledd" })
    ).toBeVisible()

    await tab.getByRole("button", { name: "Utforska" }).click()
    await chooseLanguage(tab, "English")
    await expect(tab.locator("html")).toHaveAttribute("lang", "en")
    await expect(
      tab.getByRole("heading", { level: 1, name: "Lead the way you would want to be led" })
    ).toBeVisible()
    await expect(tab.getByRole("button", { name: "Explore", exact: true })).toBeVisible()

    await tab.getByRole("button", { name: "Explore", exact: true }).click()
    await chooseLanguage(tab, "Svenska")
    await expect(tab.locator("html")).toHaveAttribute("lang", "sv")
    await expect(tab.getByRole("button", { name: "Utforska", exact: true })).toBeVisible()

    // The footer has its own "Logga in" link too — the header's is the one next to the switcher.
    await tab.getByRole("button", { name: "Utforska" }).click()
    await tab.getByRole("banner").getByRole("link", { name: "Logga in", exact: true }).click()
    await expect(tab).toHaveURL(`${URLS.auth}/login`)
    await expect(tab.locator("html")).toHaveAttribute("lang", "sv")
    await expect(tab.getByText("Välkommen tillbaka", { exact: true })).toBeVisible()
  } finally {
    await visitor.close()
  }
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the switcher's disclosure posts the form and changes the language", async ({ page }) => {
    await page.goto(`${URLS.auth}/login`)
    await expect(page.getByText("Welcome back", { exact: true })).toBeVisible()
    await switchToSwedish(page, { javaScript: false })
    await expect(page.getByText("Välkommen tillbaka", { exact: true })).toBeVisible()
  })
})

test.describe("at phone width", () => {
  test.use({ viewport: { width: 390, height: 844 } })

  test("the header's menu, the cross-app links and the footer are Swedish", async ({
    page,
    context,
  }) => {
    await context.addCookies([
      { name: "locale", value: "sv", domain: ".brand.localhost", path: "/" },
    ])
    await page.goto(`${URLS.auth}/login`)
    await expect(page.locator("html")).toHaveAttribute("lang", "sv")

    const footer = page.getByRole("navigation", { name: "Sidfot", exact: true })
    await expect(footer.getByRole("heading", { name: "Produkt", exact: true })).toBeVisible()
    await expect(footer.getByRole("link", { name: "Dokumentation", exact: true })).toBeVisible()

    await page.getByRole("button", { name: "Öppna menyn", exact: true }).click()
    const sheet = page.getByRole("dialog", { name: "Meny", exact: true })
    await expect(sheet).toBeVisible()
    const nav = sheet.getByRole("navigation", { name: "Webbplats", exact: true })
    await expect(nav.getByRole("link", { name: "Blogg", exact: true })).toBeVisible()
    await sheet.getByRole("button", { name: "Stäng", exact: true }).click()
    await expect(sheet).toBeHidden()
  })
})
