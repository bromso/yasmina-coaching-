import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

/**
 * Opens the ⌘K/Ctrl K dialog exactly as `docs.spec.ts` does: read the modifier off the search
 * button's own hint (`navigator.userAgent` is pinned to a fixed, non-Mac string by the "Desktop
 * Chrome" device profile, regardless of the host actually running the suite).
 */
async function openSearch(page: Page) {
  const trigger = page.getByRole("button", { name: "Search docs" })
  await expect(trigger).toBeVisible()
  const hint = await trigger.locator("kbd").textContent()
  await page.keyboard.press(hint?.includes("⌘") ? "Meta+k" : "Control+k")
  await expect(page.getByRole("dialog")).toBeVisible()
}

/** The first search result option whose href starts with `prefix` — a page-level hit lands
 * exactly on it, a heading-level hit on it plus a `#anchor`; either is "a result that leads to"
 * the page. */
function optionLeadingTo(page: Page, prefix: string) {
  return page.locator(`[role="option"][href^="${prefix}"]`).first()
}

test("the create-note reference page shows the method, path, scope and an example request", async ({
  page,
}) => {
  await page.goto(`${URLS.docs}/developers/reference/create-note`)
  await expect(page.getByRole("heading", { level: 1, name: "Create a note" })).toBeVisible()

  // The method badge ("Method: " is a visually-hidden prefix before the visible "POST") is the
  // one place this exact phrase appears; its parent is the whole <Endpoint> widget, which also
  // holds the path and the scope line — scoping there rules out the intro prose's own
  // `` `notes:write` `` mention and the curl example's highlighted URL string.
  const endpoint = page.getByText("Method: POST").locator("..")
  await expect(endpoint).toContainText("/v1/notes")
  await expect(endpoint).toContainText("Required scope:")
  await expect(endpoint).toContainText("notes:write")

  await expect(page.getByRole("heading", { name: "Example request" })).toBeVisible()
  await expect(page.locator("pre").filter({ hasText: "Authorization" })).toBeVisible()
})

test("the search finds the webhook signature guide", async ({ page }) => {
  await page.goto(`${URLS.docs}/`)
  await openSearch(page)
  await page.getByPlaceholder("Search docs...").fill("webhook signature")
  const option = optionLeadingTo(page, "/developers/webhooks/verifying-signatures")
  await expect(option).toBeVisible()
  await option.click()
  await expect(page.getByRole("dialog")).toBeHidden()
  await expect(page).toHaveURL(new RegExp(`^${URLS.docs}/developers/webhooks/verifying-signatures`))
})

test("the Developers sidebar group lists the reference pages in curated order", async ({
  page,
}) => {
  await page.goto(`${URLS.docs}/developers`)
  const sidebar = page.getByRole("navigation", { name: "Docs", exact: true })
  await expect(sidebar.getByRole("link", { name: "Developers", exact: true })).toBeVisible()

  // "API reference" is a folder with no index page of its own, so it starts collapsed unless the
  // current page is inside it — open it to read its children's order.
  await sidebar.getByText("API reference", { exact: true }).click()

  const order = [
    "Get the workspace",
    "List members",
    "List notes",
    "Get a note",
    "Create a note",
    "Delete a note",
  ]
  for (const title of order) {
    await expect(sidebar.getByRole("link", { name: title, exact: true })).toBeVisible()
  }
  const texts = await sidebar.getByRole("link").allTextContents()
  const indices = order.map((title) => texts.indexOf(title))
  expect(indices.every((index) => index !== -1)).toBe(true)
  expect(indices).toEqual([...indices].sort((a, b) => a - b))
})

test("the account Workspace page links both cards to the developer docs", async ({ page }) => {
  await signUpVerified(page, uniqueEmail("devdocs"))
  await createWorkspace(page, "Dev Docs Co")

  // Same mock-provider upgrade path as api-keys.spec.ts / webhooks.spec.ts.
  await page.goto(`${URLS.account}/payments`)
  await page.getByRole("radio", { name: /Pro/ }).check()
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await expect(page).toHaveURL(/checkout=success/)
  await expect(page.getByText("You're on Pro.")).toBeVisible()

  await page.goto(`${URLS.account}/workspace`)
  const apiKeysCard = page.locator("article").filter({ hasText: "API keys" })
  const webhooksCard = page.locator("article").filter({ hasText: "Webhooks" })
  await expect(apiKeysCard.getByRole("link", { name: "Read the API key docs" })).toHaveAttribute(
    "href",
    `${URLS.docs}/developers/authentication`
  )
  await expect(webhooksCard.getByRole("link", { name: "Read the webhook docs" })).toHaveAttribute(
    "href",
    `${URLS.docs}/developers/webhooks`
  )
})
