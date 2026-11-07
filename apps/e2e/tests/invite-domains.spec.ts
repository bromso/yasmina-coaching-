import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

/**
 * `uniqueEmail` has no domain parameter (it always builds `@e2e.test`), so this builds an address
 * in the same unique-per-run style but on `example.com`, the domain this journey allowlists.
 */
const exampleEmail = (prefix: string) => uniqueEmail(prefix).replace("@e2e.test", "@example.com")

/** A real, valid domain long enough (44 characters) to overflow a 320 px card unless it wraps. */
const LONG_DOMAIN = "stockholms-universitet-studentkar-exempel.se"

/**
 * Scopes to the one `<article>` (`SettingsCard` renders as one) whose `CardTitle` is exactly
 * `title` — the same scoping `workspace-require-2fa.spec.ts` uses for its Security card, needed
 * here since the Security card's own Invitation domains section echoes the word "Invitations"
 * back once a domain is saved.
 */
function cardByTitle(page: Page, title: string) {
  return page
    .locator("article")
    .filter({ has: page.locator('[data-slot="card-title"]').getByText(title, { exact: true }) })
}

test("owner limits invitations to a domain; an outside address is refused, an allowed one succeeds, Activity shows the change", async ({
  page,
}) => {
  await signUpVerified(page, uniqueEmail("invite-domain-owner"))
  await createWorkspace(page, "Domain Co")
  await page.goto(`${URLS.account}/workspace`)

  // 1. The owner saves `example.com` from the Security card's Invitation domains section.
  const securityCard = cardByTitle(page, "Security")
  await expect(
    securityCard.getByRole("heading", { name: "Invitation domains", level: 3 })
  ).toBeVisible()
  await securityCard.getByLabel("Allowed invitation domains").fill("example.com")
  await securityCard.getByRole("button", { name: "Save invitation domains" }).click()
  await expect(
    securityCard.getByText("Invitations are now limited to: example.com.", { exact: true })
  ).toBeVisible()

  // The Invitations card re-renders with the hint naming the new allowlist (a server action's
  // `revalidatePath("/workspace")`, no reload needed).
  const invitationsCard = cardByTitle(page, "Invitations")
  await expect(invitationsCard.locator("#invite-email-hint")).toHaveText(
    "Invitations are limited to: example.com."
  )

  // A second, long domain: every place that names the list must wrap it (checked at 320 px below).
  await securityCard.getByLabel("Allowed invitation domains").fill(`example.com\n${LONG_DOMAIN}`)
  await securityCard.getByRole("button", { name: "Save invitation domains" }).click()
  await expect(
    securityCard.getByText(`Invitations are now limited to: example.com and ${LONG_DOMAIN}.`, {
      exact: true,
    })
  ).toBeVisible()
  await expect(invitationsCard.locator("#invite-email-hint")).toHaveText(
    `Invitations are limited to: example.com and ${LONG_DOMAIN}.`
  )

  // 2. Inviting an address on another domain shows the refusal.
  const outsideEmail = uniqueEmail("invite-domain-outside")
  await invitationsCard.locator("#invite-email").fill(outsideEmail)
  await invitationsCard.getByLabel("Role").selectOption("member")
  await invitationsCard.getByRole("button", { name: "Send invitation" }).click()
  await expect(
    invitationsCard.getByText(
      `Invitations to this workspace are limited to: example.com and ${LONG_DOMAIN}.`,
      { exact: true }
    )
  ).toBeVisible()

  // At 320 × 640 (WCAG 1.4.10) the save confirmation, the hint and the refusal all wrap the long
  // domain: nothing widens the document (the way a11y-reflow.spec.ts checks every manifest page),
  // and nothing is clipped inside the two cards either (`SettingsCard` hides its overflow, so
  // a card whose content is wider than itself would cut the domain off rather than scroll).
  const viewport = page.viewportSize()
  await page.setViewportSize({ width: 320, height: 640 })
  const overflow = await page.evaluate(() => {
    const doc = document.documentElement
    if (doc.scrollWidth <= doc.clientWidth) return null
    const wide = [...document.querySelectorAll<HTMLElement>("body *")]
      .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
      .slice(0, 5)
      .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))
    return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide }
  })
  expect(overflow, `scrolls sideways at 320 px: ${JSON.stringify(overflow)}`).toBeNull()
  for (const card of [securityCard, invitationsCard]) {
    const clipped = await card.evaluate((el) =>
      el.scrollWidth > el.clientWidth + 1
        ? { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth }
        : null
    )
    expect(clipped, `content clipped at 320 px: ${JSON.stringify(clipped)}`).toBeNull()
  }
  if (viewport) await page.setViewportSize(viewport)

  // 3. Inviting an `@example.com` address succeeds.
  const allowedEmail = exampleEmail("invite-domain-allowed")
  await invitationsCard.locator("#invite-email").fill(allowedEmail)
  await invitationsCard.getByLabel("Role").selectOption("member")
  await invitationsCard.getByRole("button", { name: "Send invitation" }).click()
  await expect(invitationsCard.getByText(`Invitation sent to ${allowedEmail}.`)).toBeVisible()

  // 4. The owner's Activity card shows the change.
  const activityCard = page.locator("article").filter({ has: page.locator("#activity-heading") })
  await expect(
    activityCard.getByText("Changed the allowed invitation domains: added example.com.", {
      exact: true,
    })
  ).toBeVisible()
  await expect(
    activityCard.getByText(`Changed the allowed invitation domains: added ${LONG_DOMAIN}.`, {
      exact: true,
    })
  ).toBeVisible()
})
