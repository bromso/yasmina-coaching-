import { expect, type Locator, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { PNG_1X1 } from "../fixtures/images"

// Sign-up leaves the browser signed in (as in notes.spec), so no separate signIn: `/login` with a
// live session shows no form to fill.

// `IMAGE_UPLOAD_MESSAGE` in @repo/api-contract; spelled out so e2e stays outside the workspace graph.
const IMAGE_UPLOAD_MESSAGE = "Upload a PNG, JPEG or WebP image up to 2 MB."

const png = (name: string) => ({ name, mimeType: "image/png", buffer: PNG_1X1 })
const menuTrigger = (page: Page) => page.getByRole("button", { name: /^Account menu for/ })
/** The account page's own card image (the header's avatar sits outside `#main`). */
const cardImage = (page: Page) => page.locator("#main img")

/** The image actually loaded: its bytes came back through the app's /files route. */
async function expectServed(img: Locator, prefix: string) {
  await expect(img).toHaveAttribute("src", new RegExp(`^${prefix}`))
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBe(1)
}

async function upload(page: Page, label: string, file: ReturnType<typeof png>) {
  await page.getByLabel(label, { exact: true }).setInputFiles(file)
  await page.getByRole("button", { name: "Upload", exact: true }).click()
}

test("a profile photo shows in every app's header and goes on remove", async ({ page }) => {
  const email = uniqueEmail("avatar")
  await signUpVerified(page, email)
  await createWorkspace(page, "Photo team")

  await page.goto(`${URLS.account}/personal-info`)
  await upload(page, "Profile photo", png("me.png"))
  await expect(page.getByText("Profile photo updated.")).toBeVisible()
  await expectServed(menuTrigger(page).locator("img"), "/files/avatars/")

  await page.goto(`${URLS.app}/notes`)
  await expectServed(menuTrigger(page).locator("img"), "/files/avatars/")

  await page.goto(`${URLS.account}/personal-info`)
  await page.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(page.getByText("Profile photo removed.")).toBeVisible()
  await expect(menuTrigger(page).locator("img")).toHaveCount(0)
  await expect(menuTrigger(page)).toContainText("EU") // "E2E User"'s initials
})

test("a workspace logo shows in the switcher", async ({ page }) => {
  const email = uniqueEmail("logo")
  await signUpVerified(page, email)
  await createWorkspace(page, "Logo Co")

  await page.goto(`${URLS.account}/workspace`)
  await upload(page, "Logo", png("logo.png"))
  await expect(page.getByText("Logo updated.")).toBeVisible()

  await menuTrigger(page).click()
  const item = page.getByRole("menuitem", { name: "Logo Co" })
  await expect(item).toBeVisible()
  await expectAccessible(page, { label: "account UserMenu open", route: "account:/workspace" })
  await expectServed(item.locator("img"), "/files/logos/")
})

test("upload then remove on the same page leaves the initials, not the photo", async ({ page }) => {
  const email = uniqueEmail("same-page")
  await signUpVerified(page, email)

  await page.goto(`${URLS.account}/personal-info`)
  await upload(page, "Profile photo", png("me.png"))
  await expect(page.getByText("Profile photo updated.")).toBeVisible()
  await expectServed(cardImage(page), "/files/avatars/")

  // No page.goto in between: the card's local preview must not outlive the remove.
  await page.getByRole("button", { name: "Remove", exact: true }).click()
  await expect(page.getByText("Profile photo removed.")).toBeVisible()
  await expect(cardImage(page)).toHaveCount(0)
  await expect(page.locator("#main")).toContainText("EU") // "E2E User"'s initials
  await expect(menuTrigger(page).locator("img")).toHaveCount(0)
})

test("a file that is not an image is refused and the current photo stays", async ({ page }) => {
  const email = uniqueEmail("svg")
  await signUpVerified(page, email)

  await page.goto(`${URLS.account}/personal-info`)
  await upload(page, "Profile photo", png("me.png"))
  await expect(page.getByText("Profile photo updated.")).toBeVisible()
  await expectServed(cardImage(page), "/files/avatars/")

  await upload(page, "Profile photo", { ...png("x.png"), buffer: Buffer.from("<svg/>") })
  await expect(page.getByText(IMAGE_UPLOAD_MESSAGE)).toBeVisible()
  // The refused file is neither stored nor left on screen as a preview: the saved photo stays.
  await expectServed(cardImage(page), "/files/avatars/")
  await expectServed(menuTrigger(page).locator("img"), "/files/avatars/")
})
