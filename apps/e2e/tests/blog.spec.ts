import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"

test("home lists the starter post", async ({ page }) => {
  await page.goto(URLS.blog)
  await expect(page.getByRole("link", { name: "Welcome to the blog" })).toBeVisible()
})

test("a post shows its heading, a code block and the table of contents", async ({ page }) => {
  await page.goto(URLS.blog)
  await page.getByRole("link", { name: "Welcome to the blog" }).click()
  await expect(page).toHaveURL(`${URLS.blog}/welcome`)
  await expect(page.getByRole("heading", { level: 1, name: "Welcome to the blog" })).toBeVisible()
  await expect(page.locator("pre")).not.toHaveCount(0)
  await expect(page.getByRole("navigation", { name: "On this page" })).toBeVisible()
})

test("switching tabs after hydration shows the second panel", async ({ page }) => {
  await page.goto(`${URLS.blog}/welcome`)
  await page.getByRole("tab", { name: "npm" }).click()
  await expect(page.getByRole("tabpanel")).toContainText("npm install left-pad")
})

test("a tag link opens its tag page listing the post", async ({ page }) => {
  await page.goto(`${URLS.blog}/welcome`)
  // The post header's tag badge, not the inline "tagged [guides](/tags/guides)" link in the body.
  await page.locator('[data-slot="post-header"]').getByRole("link", { name: "guides" }).click()
  await expect(page).toHaveURL(`${URLS.blog}/tags/guides`)
  await expect(page.getByRole("link", { name: "Welcome to the blog" })).toBeVisible()
})

test("an author page lists their post", async ({ page }) => {
  await page.goto(`${URLS.blog}/authors/team`)
  await expect(page.getByRole("link", { name: "Welcome to the blog" })).toBeVisible()
})

test("the RSS feed answers with the post title", async ({ request }) => {
  const res = await request.get(`${URLS.blog}/rss.xml`)
  expect(res.ok()).toBe(true)
  expect(res.headers()["content-type"]).toContain("application/rss+xml")
  const body = await res.text()
  expect(body).toContain("Welcome to the blog")
})

test.describe("without JavaScript", () => {
  test.use({ javaScriptEnabled: false })

  test("a post renders its heading, body and header nav without scripts", async ({ page }) => {
    await page.goto(`${URLS.blog}/welcome`)
    await expect(page.getByRole("heading", { level: 1, name: "Welcome to the blog" })).toBeVisible()
    await expect(
      page.getByText("This is the first post on the blog.", { exact: false })
    ).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Site" })).toBeVisible()
  })
})
