import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { PASSWORD, signOut, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { totpCode } from "../fixtures/totp"

const SECURITY = `${URLS.account}/security`

/**
 * Must run before any WebAuthn call on this page — the virtual authenticator belongs to the CDP
 * target (the tab), not an origin, so it stays attached across the auth/account navigations below.
 * Returns the session and id so a test can later flip `automaticPresenceSimulation` itself: with
 * it always on, the quiet autofill ceremony `PasskeySignIn` starts on every `/login` mount answers
 * itself the instant the page loads, racing an explicit click for the same button (see the first
 * test below).
 */
async function addVirtualAuthenticator(page: Page) {
  const client = await page.context().newCDPSession(page)
  await client.send("WebAuthn.enable")
  const { authenticatorId } = await client.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  })
  return { client, authenticatorId }
}

/** Scoped to the "Add a passkey" form's own button, since "Current password" also labels a field
 * on the change-password and two-step setup forms on this same page. */
async function addPasskey(page: Page, name: string) {
  await page.goto(SECURITY)
  const form = page.locator("form", { has: page.getByRole("button", { name: "Add a passkey" }) })
  await form.getByLabel("Current password", { exact: true }).fill(PASSWORD)
  await form.getByLabel("Name (optional)", { exact: true }).fill(name)
  await form.getByRole("button", { name: "Add a passkey" }).click()
  await expect(page.getByText("Passkey added.", { exact: true })).toBeVisible()
}

/** The same steps `two-factor.spec.ts` uses to turn two-step verification on, scoped to its own
 * "Turn on" button (the same label the add-passkey and change-password forms don't share). */
async function turnOnTwoStep(page: Page) {
  const setupForm = page.locator("form", { has: page.getByRole("button", { name: "Turn on" }) })
  await setupForm.getByLabel("Current password", { exact: true }).fill(PASSWORD)
  await setupForm.getByRole("button", { name: "Turn on" }).click()
  const key = page.getByText(/^[A-Z2-7]{4}( [A-Z2-7]{1,4})+$/)
  await expect(key).toBeVisible()
  const secret = (await key.textContent()) ?? ""
  await page.getByLabel("Code", { exact: true }).fill(totpCode(secret))
  await page.getByRole("button", { name: "Turn on" }).click()
  await expect(page.getByText("Your recovery codes", { exact: true })).toBeVisible()
  await page.getByRole("link", { name: "Done" }).click()
  await expect(page.getByText("Two-step verification is on.", { exact: true })).toBeVisible()
}

test("add a passkey, turn on two-step verification, then sign in with just the passkey", async ({
  page,
}) => {
  await addVirtualAuthenticator(page)
  const email = uniqueEmail("passkey")
  await signUpVerified(page, email)

  await addPasskey(page, "E2E passkey")
  await expect(page.getByLabel("Rename E2E passkey", { exact: true })).toHaveValue("E2E passkey")
  await expectAccessible(page, {
    label: "account /security passkey added",
    route: "account:/security",
  })

  // Two-step is on for this account from here on; a passkey sign-in must still skip its code step
  // (the api never returns a two-factor challenge for one — see task-2's unit test), unlike a
  // password sign-in for the same account.
  await turnOnTwoStep(page)
  await signOut(page)

  // `PasskeySignIn` starts a quiet, conditional-mediation ceremony the instant `/login` mounts,
  // via `browserSupportsWebAuthnAutofill()` → `PublicKeyCredential.isConditionalMediationAvailable()`.
  // With `automaticPresenceSimulation` on, the virtual authenticator can answer that silent
  // request as soon as it starts — racing this test's explicit click for the same button. The
  // controller's first run toggled presence off before the click and back on after, hoping the
  // explicit `startAuthentication` call (which aborts the still-pending quiet one) would pick up
  // the renewed presence once its own request reached the authenticator. On CI the trace showed
  // that never happens: a request started while presence is off is never resolved (per the CDP
  // WebAuthn domain's own docs), so turning presence back on afterwards does nothing for a
  // request that already began — only two `passkeyOptions` calls and no `passkeySignIn`, where
  // local runs happened to let the enable land first. Instead, make the browser believe
  // conditional mediation is unavailable before `/login` loads, so the quiet ceremony never
  // starts at all and only the explicit click's `startAuthentication` call ever runs — leaving
  // `automaticPresenceSimulation` on throughout, so that one resolves like a real tap.
  await page.addInitScript(() => {
    Object.defineProperty(window.PublicKeyCredential, "isConditionalMediationAvailable", {
      configurable: true,
      value: () => Promise.resolve(false),
    })
  })
  await page.goto(`${URLS.auth}/login?next=${encodeURIComponent(SECURITY)}`)
  await page.getByRole("button", { name: "Sign in with a passkey" }).click()
  await expect(page).toHaveURL(SECURITY)
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole("button", { name: /^Account menu for/ })).toBeVisible()
})

test("a registered passkey signs a visitor in through autofill alone, with no click", async ({
  page,
}) => {
  // Documents the virtual authenticator's own behaviour (the controller's first run surfaced it):
  // with `automaticPresenceSimulation` left on — the default `addVirtualAuthenticator` sets —
  // `PasskeySignIn`'s quiet, conditional-mediation ceremony on `/login` resolves on its own the
  // moment the page mounts, with nothing clicked.
  await addVirtualAuthenticator(page)
  const email = uniqueEmail("passkey-autofill")
  await signUpVerified(page, email)
  await addPasskey(page, "Autofill passkey")
  await signOut(page)

  await page.goto(`${URLS.auth}/login?next=${encodeURIComponent(SECURITY)}`)
  await expect(page).toHaveURL(SECURITY)
  await expect(page).not.toHaveURL(/\/login/)
  await expect(page.getByRole("button", { name: /^Account menu for/ })).toBeVisible()
})

test("rename a passkey, then remove it", async ({ page }) => {
  await addVirtualAuthenticator(page)
  const email = uniqueEmail("passkey-manage")
  await signUpVerified(page, email)
  await addPasskey(page, "Original name")

  // Rename: the row's own label and value carry the old name until the save succeeds.
  const renameInput = page.getByLabel("Rename Original name", { exact: true })
  await renameInput.fill("Renamed passkey")
  await page.getByRole("button", { name: "Save" }).click()
  await expect(page.getByText("Passkey renamed.", { exact: true })).toBeVisible()
  // A reload proves the new name is the server's, not just what the input was left showing.
  await page.reload()
  await expect(page.getByLabel("Rename Renamed passkey", { exact: true })).toHaveValue(
    "Renamed passkey"
  )

  // Remove: a first click only arms the row's own button; a second confirms it.
  const removeButton = page.getByRole("button", { name: "Remove" })
  await removeButton.click()
  const confirmButton = page.getByRole("button", { name: "Confirm removal" })
  await expect(confirmButton).toBeVisible()
  await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible()
  await confirmButton.click()
  await expect(page.getByText("Passkey removed.", { exact: true })).toBeVisible()
  await expect(page.getByText("You don't have any passkeys yet.", { exact: true })).toBeVisible()
})
