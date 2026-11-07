import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

test("create an API key, call /v1/notes with it, see it on /notes, then revoke it on Free", async ({
  page,
  request,
}) => {
  await signUpVerified(page, uniqueEmail("apikeys"))
  await createWorkspace(page, "API Key Co")

  // Creating a key needs a plan with the `api` feature (Pro or Team) — same mock-provider upgrade
  // path as billing.spec.ts.
  await page.goto(`${URLS.account}/payments`)
  await page.getByRole("radio", { name: /Pro/ }).check()
  await page.getByRole("button", { name: "Continue to checkout" }).click()
  await expect(page).toHaveURL(/checkout=success/)
  await expect(page.getByText("You're on Pro.")).toBeVisible()

  await page.goto(`${URLS.account}/workspace`)
  const keyName = `e2e-key-${Date.now()}`
  await page.getByLabel("Key name", { exact: true }).fill(keyName)
  await page.getByLabel("Read notes", { exact: true }).check()
  await page.getByLabel("Create and delete notes", { exact: true }).check()
  // Expiry left at its default (90 days).
  await page.getByRole("button", { name: "Create key" }).click()

  await expect(page.getByText("Your new API key")).toBeVisible()
  const keyInput = page.getByLabel("API key", { exact: true })
  const apiKey = await keyInput.inputValue()
  // bb_live_<8-char prefix>_<secret> — see apps/api/src/api-keys.ts's API_KEY_PATTERN.
  expect(apiKey).toMatch(/^bb_live_[0-9A-Za-z]{8}_[A-Za-z0-9_-]+$/) // gitleaks:allow
  // Done is a link back to /workspace (so it works without JavaScript); hydrated, it remounts the
  // create form in place. Either way the key is gone, and a reload never brings it back.
  await page.getByRole("link", { name: "Done" }).click()
  await expect(keyInput).toHaveCount(0)
  await expect(page.locator("#api-keys-heading")).toBeFocused()
  await expect(page.getByRole("button", { name: "Create key" })).toBeVisible()
  await page.reload()
  await expect(keyInput).toHaveCount(0)
  await expect(page.getByText("Your new API key")).toHaveCount(0)

  const title = `Note via API key ${Date.now()}`
  const created = await request.post(`${URLS.api}/v1/notes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
    data: { title },
  })
  expect(created.status()).toBe(201)
  const createdNote = await created.json()
  expect(createdNote.title).toBe(title)
  expect(createdNote.author.type).toBe("api_key")
  expect(createdNote.author.name).toBe(keyName)

  const listed = await request.get(`${URLS.api}/v1/notes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  expect(listed.status()).toBe(200)
  const { items } = await listed.json()
  expect(items.some((note: { title: string }) => note.title === title)).toBe(true)

  await page.goto(`${URLS.app}/notes`)
  const note = page.getByRole("listitem").filter({ hasText: title })
  await expect(note).toBeVisible()
  await expect(note.getByText(`via API key ${keyName}`)).toBeVisible()

  // Downgrade to Free: the key stops working at once, but stays listed and revocable.
  await page.goto(`${URLS.account}/payments`)
  await page.getByRole("button", { name: "Cancel subscription" }).click()
  await expect(page.getByText("Subscription cancelled.")).toBeVisible()
  const onFree = await request.get(`${URLS.api}/v1/notes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  expect(onFree.status()).toBe(401)

  await page.goto(`${URLS.account}/workspace`)
  await expect(page.getByText("API access is on the Pro and Team plans.")).toBeVisible()
  await expect(page.getByRole("button", { name: "Create key" })).toHaveCount(0)
  const keyRow = page.locator("li").filter({ hasText: keyName })
  await keyRow.getByRole("button", { name: "Revoke" }).click()
  await keyRow.getByRole("button", { name: "Confirm revoke" }).click()
  await expect(page.getByText("API key revoked.")).toBeVisible()
  await expect(keyRow.getByText("Revoked", { exact: true })).toBeVisible()
  // The row's button unmounted; focus went to the card's title, not <body>.
  await expect(page.locator("#api-keys-heading")).toBeFocused()

  const afterRevoke = await request.get(`${URLS.api}/v1/notes`, {
    headers: { Authorization: `Bearer ${apiKey}` },
  })
  expect(afterRevoke.status()).toBe(401)
  const revokedBody = await afterRevoke.json()
  expect(revokedBody.error.code).toBe("unauthorized")

  // The note keeps the key's name as its author after the key is revoked.
  await page.goto(`${URLS.app}/notes`)
  const noteAfter = page.getByRole("listitem").filter({ hasText: title })
  await expect(noteAfter.getByText(`via API key ${keyName}`)).toBeVisible()
})
