import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { ensureAdmin, uniqueEmail } from "../fixtures/accounts"

/**
 * Opens the ⌘K/Ctrl K dialog, same technique as `docs.spec.ts`: the trigger's own hint names the
 * modifier this browser answers to (`DocsSearch`'s `isMacPlatform` reads `navigator.userAgent`,
 * which the "Desktop Chrome" device profile pins to a fixed, non-Mac string regardless of the host
 * running the suite).
 */
async function openSearch(page: import("@playwright/test").Page) {
  const trigger = page.getByRole("button", { name: "Search help" })
  await expect(trigger).toBeVisible()
  const hint = await trigger.locator("kbd").textContent()
  await page.keyboard.press(hint?.includes("⌘") ? "Meta+k" : "Control+k")
  await expect(page.getByRole("dialog")).toBeVisible()
}

test("browse a category and article, search finds another, and its contact form reaches support", async ({
  page,
}) => {
  await page.goto(URLS.help)
  await expect(page.getByRole("heading", { level: 1, name: "Help and support" })).toBeVisible()

  await page.getByRole("link", { name: "Getting started", exact: true }).click()
  await expect(page).toHaveURL(`${URLS.help}/getting-started`)
  await expect(page.getByRole("heading", { level: 1, name: "Getting started" })).toBeVisible()

  await page.getByRole("link", { name: "Create an account", exact: true }).click()
  await expect(page).toHaveURL(`${URLS.help}/getting-started/create-an-account`)
  await expect(page.getByRole("heading", { level: 1, name: "Create an account" })).toBeVisible()
  await expect(
    page.getByText("Go to the sign-up page and enter your email and password", { exact: false })
  ).toBeVisible()

  // The search control lives on the help home page only (`/all` is the no-JavaScript fallback
  // elsewhere); search finds an article the browse path above never visited, by body text rather
  // than title.
  await page.goto(URLS.help)
  await openSearch(page)
  const dialog = page.getByRole("dialog")
  await page.getByPlaceholder("Search help…").fill("authenticator app")
  const resultPath = "/account-security/turn-on-two-step-verification"
  const link = dialog.locator(`a[href^="${resultPath}"]`).first()
  await expect(link).toBeVisible()
  await expectAccessible(page, { label: "help search dialog with results", route: "help:/" })
  await link.click()
  await expect(dialog).toBeHidden()
  await expect(
    page.getByRole("heading", { level: 1, name: "Turn on two-step verification" })
  ).toBeVisible()

  // The footer's "Contact us" carries the article's own path as ?from=, read by the form's hidden
  // `page` field — `exact` picks it out from the article body's own lowercase "contact us" link
  // (plain `/contact`, no query), which the default case-insensitive name match would also hit.
  await page.getByRole("link", { name: "Contact us", exact: true }).click()
  await expect(page).toHaveURL(`${URLS.help}/contact?from=${encodeURIComponent(resultPath)}`)

  const email = uniqueEmail("help")
  await page.getByLabel("Email", { exact: true }).fill(email)
  await page.getByLabel("Topic", { exact: true }).selectOption("account")
  await page
    .getByLabel("Message", { exact: true })
    .fill("I can't find the two-step verification setting on my account.")
  await page.getByRole("button", { name: "Send" }).click()

  const status = page.getByRole("status").filter({ hasText: "Your reference is" })
  await expect(status).toBeVisible()
  await expectAccessible(page, { label: "help contact confirmation", route: "help:/contact" })
  const confirmation = (await status.textContent()) ?? ""
  const reference = confirmation.match(/Your reference is ([A-Za-z0-9-]+)/)?.[1]
  expect(reference).toBeTruthy()

  // The request lands on apps/auth's admin, where the e2e superadmin (shared with admin.spec and
  // analytics.spec) can see and resolve it.
  await ensureAdmin(page, "admin@e2e.test")
  await page.goto(`${URLS.auth}/admin/support`)

  // `reference` alone could be a substring of another request's (e.g. "HELP-7" of "HELP-70");
  // match the list item whose own reference span equals it exactly.
  const item = page
    .locator("li")
    .filter({ has: page.getByText(reference as string, { exact: true }) })
  await expect(item).toBeVisible()
  await expect(item).toContainText(email)
  // Resolving revalidates the (default, Open-only) list: the row, its form and the "Marked
  // resolved." message inside it all unmount together, leaving "No support requests."
  await item.getByRole("button", { name: "Mark resolved" }).click()
  await expect(item).toBeHidden()

  await page.goto(`${URLS.auth}/admin/support?status=resolved`)
  const resolved = page
    .locator("li")
    .filter({ has: page.getByText(reference as string, { exact: true }) })
  await expect(resolved).toContainText("resolved")
  await expect(resolved).toContainText("Resolved by admin@e2e.test")
})
