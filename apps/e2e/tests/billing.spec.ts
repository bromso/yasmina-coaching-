import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("chat is locked on Free, unlocked after the mock upgrade, and answers", async ({ page }) => {
  await signUpVerified(page, uniqueEmail("billing"))
  await createWorkspace(page, "Pay Co")

  await page.goto(`${URLS.app}/chat`)
  await expect(page.getByRole("heading", { name: "Chat is on the Pro plan" })).toBeVisible()

  // The mock provider's Change-plan card is native radios (plan-picker.tsx), not a <select>; on
  // Free the only form is "Continue to checkout", which the mock activates at once.
  await page.goto(`${URLS.account}/payments`)
  await page.getByRole("radio", { name: /Pro/ }).check()
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await expect(page).toHaveURL(/checkout=success/)
  await expect(page.getByText("You're on Pro.")).toBeVisible()

  await page.goto(`${URLS.app}/chat`)
  const input = page.getByRole("textbox", { name: "Message" })
  await input.fill("ping from e2e")
  await input.press("Enter")
  // The user's own bubble also says "ping from e2e", and a separate sr-only role="status"
  // announcer repeats the latest assistant reply (chat-view.tsx) — scope to the assistant's
  // list item (its sr-only "Assistant: " prefix) rather than loosen the text match.
  await expect(
    page
      .getByRole("list")
      .getByRole("listitem")
      .filter({ hasText: "Assistant:" })
      .filter({ hasText: "Echo: ping from e2e" })
  ).toBeVisible()
})
