import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("create, list and delete a note", async ({ page }) => {
  await signUpVerified(page, uniqueEmail("notes"))
  await createWorkspace(page, "Notes team")
  await page.getByLabel("Title").fill("First note")
  await page.getByLabel("Body").fill("Hello from e2e")
  await page.getByRole("button", { name: "Add note" }).click()
  const note = page.getByRole("listitem").filter({ hasText: "First note" })
  await expect(note).toBeVisible()
  await note.getByRole("button", { name: /delete/i }).click()
  // The button always opens the confirm dialog with JavaScript on (see delete-note-button.tsx):
  // its onClick calls preventDefault + setOpen(true), so the native submit never fires here.
  const confirm = page.getByRole("alertdialog")
  await expect(confirm).toBeVisible()
  await confirm.getByRole("button", { name: "Delete" }).click()
  await expect(page.getByText("First note")).toHaveCount(0)
  await expect(page).toHaveURL(`${URLS.app}/notes`)
})
