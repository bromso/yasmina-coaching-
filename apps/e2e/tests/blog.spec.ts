import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"

// The blog is Swedish at the root and English under /en, each with its own <html lang>.

test("the Swedish index opens on its hero, in Swedish", async ({ page }) => {
  await page.goto(URLS.blog)
  await expect(page.locator("html")).toHaveAttribute("lang", "sv")
  await expect(
    page.getByRole("heading", { level: 1, name: "Anteckningar om ledarskap" })
  ).toBeVisible()
})

test("the header links home to www, to Ledarskap inifrån, to booking and to English", async ({
  page,
}) => {
  await page.goto(URLS.blog)
  const nav = page.getByRole("navigation", { name: "Webbplats" })
  await expect(nav.getByRole("link", { name: "Yasmina Petersson" })).toHaveAttribute(
    "href",
    URLS.www
  )
  await expect(nav.getByRole("link", { name: "Ledarskap inifrån" })).toHaveAttribute(
    "href",
    `${URLS.www}/inifran`
  )
  await expect(nav.getByRole("link", { name: "Boka" })).toHaveAttribute("href", `${URLS.www}/book`)
  await nav.getByRole("link", { name: "Read in English" }).click()
  await expect(page).toHaveURL(`${URLS.blog}/en`)
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(page.getByRole("heading", { level: 1, name: "Notes on leadership" })).toBeVisible()
  await page
    .getByRole("navigation", { name: "Site" })
    .getByRole("link", { name: "Läs på svenska" })
    .click()
  await expect(page).toHaveURL(`${URLS.blog}/`)
})

test("the language link saves the choice for www: English blog, English www", async ({
  page,
  context,
}) => {
  await page.goto(URLS.blog)
  await page
    .getByRole("navigation", { name: "Webbplats" })
    .getByRole("link", { name: "Read in English" })
    .click()
  await expect(page).toHaveURL(`${URLS.blog}/en`)
  const cookies = await context.cookies(URLS.www)
  expect(cookies.find((cookie) => cookie.name === "locale")?.value).toBe("en")
  await page.getByRole("navigation", { name: "Site" }).getByRole("link", { name: "Book" }).click()
  await expect(page).toHaveURL(`${URLS.www}/book`)
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
})

test("each language has its own RSS feed", async ({ request }) => {
  for (const [path, language] of [
    ["/rss.xml", "sv"],
    ["/en/rss.xml", "en"],
  ] as const) {
    const res = await request.get(`${URLS.blog}${path}`)
    expect(res.ok()).toBe(true)
    expect(res.headers()["content-type"]).toContain("application/rss+xml")
    expect(await res.text()).toContain(`<language>${language}</language>`)
  }
})

test("an unknown address is a Swedish 404 with the blog's chrome", async ({ page }) => {
  const res = await page.goto(`${URLS.blog}/finns-inte`)
  expect(res?.status()).toBe(404)
  await expect(page.locator("html")).toHaveAttribute("lang", "sv")
  await expect(page.getByRole("heading", { level: 1, name: "Sidan finns inte" })).toBeVisible()
  await expect(page.getByRole("navigation", { name: "Webbplats" })).toBeVisible()
})

test("the newest post opens with its title and links to its translation", async ({ page }) => {
  await page.goto(URLS.blog)
  const title = "Att leda genom en kris, på jobbet och hemma"
  await page.getByRole("link", { name: title }).first().click()
  await expect(page).toHaveURL(`${URLS.blog}/att-leda-genom-en-kris`)
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible()
  await expect(page.locator("html")).toHaveAttribute("lang", "sv")
  await expect(
    page.getByRole("link", { name: "Be om ett kostnadsfritt introsamtal" })
  ).toHaveAttribute("href", `${URLS.www}/#contact`)
  await page.getByRole("link", { name: "Read in English" }).click()
  await expect(page).toHaveURL(`${URLS.blog}/en/leading-through-a-crisis`)
  await expect(page.locator("html")).toHaveAttribute("lang", "en")
  await expect(
    page.getByRole("heading", { level: 1, name: "Leading through a crisis, at work and at home" })
  ).toBeVisible()
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the index renders its hero and header nav without scripts", async ({ page }) => {
    await page.goto(URLS.blog)
    await expect(
      page.getByRole("heading", { level: 1, name: "Anteckningar om ledarskap" })
    ).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Webbplats" })).toBeVisible()
  })
})
