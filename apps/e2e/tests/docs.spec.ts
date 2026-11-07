import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"

/**
 * Opens the ⌘K/Ctrl K dialog. The hint on the search button already says which modifier this
 * browser answers to (`DocsSearch`'s own `isMacPlatform` reads `navigator.userAgent`, which the
 * "Desktop Chrome" device profile pins to a fixed, non-Mac string regardless of the host running
 * the suite) — read it rather than assuming a modifier, so this works the same on every host.
 */
async function openSearch(page: Page) {
  const trigger = page.getByRole("button", { name: "Search docs" })
  await expect(trigger).toBeVisible()
  const hint = await trigger.locator("kbd").textContent()
  await page.keyboard.press(hint?.includes("⌘") ? "Meta+k" : "Control+k")
  await expect(page.getByRole("dialog")).toBeVisible()
}

test("the landing page shows the intro and the sidebar", async ({ page }) => {
  await page.goto(`${URLS.docs}/`)
  await expect(page.getByRole("heading", { level: 1, name: "Documentation" })).toBeVisible()
  const sidebar = page.getByRole("navigation", { name: "Docs", exact: true })
  await expect(sidebar).toBeVisible()
  await expect(sidebar.getByRole("link", { name: "Getting started", exact: true })).toBeVisible()
})

test("a sidebar link opens its page with breadcrumbs, and a TOC link jumps to its heading", async ({
  page,
}) => {
  await page.goto(`${URLS.docs}/`)
  const sidebar = page.getByRole("navigation", { name: "Docs", exact: true })
  await sidebar.getByRole("link", { name: "Getting started", exact: true }).click()
  await expect(page).toHaveURL(`${URLS.docs}/getting-started`)
  await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible()

  const breadcrumbs = page.getByRole("navigation", { name: "breadcrumb" })
  await expect(breadcrumbs).toContainText("Docs")
  await expect(breadcrumbs).toContainText("Getting started")

  const toc = page.getByRole("navigation", { name: "On this page" })
  await expect(toc).toBeVisible()
  const link = toc.getByRole("link").first()
  const href = await link.getAttribute("href")
  expect(href).toContain("#")
  await link.click()
  await expect(page).toHaveURL(`${URLS.docs}/getting-started${href}`)
})

test("the table of contents marks the section being read", async ({ page }) => {
  await page.goto(`${URLS.docs}/authentication`)
  const toc = page.getByRole("navigation", { name: "On this page" })
  const workspaces = toc.locator('a[href="#workspaces"]')
  // Put the heading 100px below the top of the viewport: inside the reading band (below the
  // sticky header's 64px, above the top 30%).
  await page
    .locator("#workspaces")
    .evaluate((heading) =>
      window.scrollTo(0, heading.getBoundingClientRect().top + window.scrollY - 100)
    )
  await expect(workspaces).toHaveAttribute("aria-current", "location")
  await expect(toc.locator('[aria-current="location"]')).toHaveCount(1)
})

test("the TOC highlight follows jumps: a hash link, then a scroll back past a heading", async ({
  page,
}) => {
  await page.goto(`${URLS.docs}/authentication`)
  const toc = page.getByRole("navigation", { name: "On this page" })
  const current = toc.locator('[aria-current="location"]')

  // A TOC link jumps straight to the last heading: no heading crosses the band on the way.
  await toc.locator('a[href="#environment"]').click()
  await expect(page).toHaveURL(`${URLS.docs}/authentication#environment`)
  await expect(toc.locator('a[href="#environment"]')).toHaveAttribute("aria-current", "location")
  await expect(current).toHaveCount(1)

  // One jump back up: the previous heading just above the band (64px), the last one below it
  // (30% of the viewport).
  const below = await page.evaluate(() => {
    const previous = document.getElementById("two-step-verification") as HTMLElement
    window.scrollTo(0, previous.getBoundingClientRect().top + window.scrollY - 20)
    const last = document.getElementById("environment") as HTMLElement
    return last.getBoundingClientRect().top - window.innerHeight * 0.3
  })
  expect(below).toBeGreaterThan(0)
  await expect(toc.locator('a[href="#two-step-verification"]')).toHaveAttribute(
    "aria-current",
    "location"
  )
  await expect(current).toHaveCount(1)
})

test("Next moves to the following page", async ({ page }) => {
  await page.goto(`${URLS.docs}/getting-started`)
  const neighbours = page.getByRole("navigation", { name: "Docs pages" })
  await neighbours.getByRole("link", { name: /^Next/ }).click()
  await expect(page).toHaveURL(`${URLS.docs}/architecture`)
  await expect(page.getByRole("heading", { level: 1, name: "Architecture" })).toBeVisible()
})

/** The heading every search test looks for: `## Workspaces` on the starter Authentication page.
 * Found by its href, so neither the ranking of the hits nor the case of their text matters. */
const WORKSPACES_HREF = "/authentication#workspaces"

/** The result option whose link goes to `href`. */
function optionFor(page: Page, href: string) {
  // Each result is the link itself (role="option" on the <a>): a link inside an option would be
  // nested interactive content.
  return page.locator(`[role="option"][href="${href}"]`)
}

test("the search shortcut opens the dialog, and Enter opens the selected result", async ({
  page,
}) => {
  await page.goto(`${URLS.docs}/`)
  await openSearch(page)
  const dialog = page.getByRole("dialog")
  await page.getByPlaceholder("Search docs...").fill("workspaces")
  const option = optionFor(page, WORKSPACES_HREF)
  await expect(option).toBeVisible()
  await expectAccessible(page, { label: "docs search dialog with results", route: "docs:/" })
  // Walk the selection down to that option, however the hits are ranked (cmdk loops at the end).
  const count = await page.getByRole("option").count()
  for (let step = 0; step < count; step++) {
    if ((await option.getAttribute("aria-selected")) === "true") break
    await page.keyboard.press("ArrowDown")
  }
  await expect(option).toHaveAttribute("aria-selected", "true")
  await page.keyboard.press("Enter")
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(`${URLS.docs}${WORKSPACES_HREF}`)
})

test("clicking a heading hit navigates straight to that heading", async ({ page }) => {
  await page.goto(`${URLS.docs}/`)
  await openSearch(page)
  await page.getByPlaceholder("Search docs...").fill("workspaces")
  const link = optionFor(page, WORKSPACES_HREF)
  await expect(link).toBeVisible()
  await link.click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).toHaveURL(`${URLS.docs}${WORKSPACES_HREF}`)
})

test("a nonsense query shows No results", async ({ page }) => {
  await page.goto(`${URLS.docs}/`)
  await openSearch(page)
  const dialog = page.getByRole("dialog")
  await page.getByPlaceholder("Search docs...").fill("qxzzynomatch123")
  await expect(dialog).toContainText("No results")
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("the body and sidebar render, and the search control is a link to /all", async ({
    page,
  }) => {
    await page.goto(`${URLS.docs}/getting-started`)
    await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible()
    await expect(
      page.getByText("Install the dependencies, run every app", { exact: false })
    ).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Docs", exact: true })).toBeVisible()

    const searchLink = page.getByRole("link", { name: "Search docs" })
    await expect(searchLink).toHaveAttribute("href", "/all")
    await searchLink.click()
    await expect(page).toHaveURL(`${URLS.docs}/all`)
    await expect(page.getByRole("heading", { level: 1, name: "All pages" })).toBeVisible()
    await expect(
      page.locator("main").getByRole("link", { name: "Getting started", exact: true })
    ).toBeVisible()
    await expect(
      page.locator("main").getByRole("link", { name: "Architecture", exact: true })
    ).toBeVisible()
  })
})
