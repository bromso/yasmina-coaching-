import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { createWorkspace, PASSWORD, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"
import { totpCode } from "../fixtures/totp"

/**
 * Turns on two-step verification for whoever `page` is signed in as — `page` must already be on
 * `account/security`. The same flow `two-factor.spec.ts` drives, trimmed to what this journey
 * needs: neither the owner nor the blocked member cares about their recovery codes here, only that
 * the account now satisfies the workspace's requirement.
 */
async function turnOnTwoFactor(page: Page) {
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

// Long on purpose (the name allows 100 characters): the notice's text naming the workspace must
// wrap rather than widen the page at 320 px (WCAG 1.4.10); the "Leave" button itself stays short.
const WORKSPACE = "2FA Co Northwind Traders Customer Success and Partner Enablement"

test("owner requires two-step verification; a blocked member sets it up and the owner sees it in Activity", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const memberCtx = await browser.newContext()
  try {
    const owner = await ownerCtx.newPage()
    const member = await memberCtx.newPage()
    const memberEmail = uniqueEmail("2fa-member")

    // The owner must satisfy the requirement themselves before turning it on, so set that up
    // first, then create the workspace.
    await signUpVerified(owner, uniqueEmail("2fa-owner"), "2FA Owner")
    await owner.goto(`${URLS.account}/security`)
    await turnOnTwoFactor(owner)
    await createWorkspace(owner, WORKSPACE)

    // Invite a member while the requirement is still off, so accepting is unaffected (accepting
    // stays exempt either way, but this keeps the journey closest to a real workspace).
    await owner.goto(`${URLS.account}/workspace`)
    const before = Date.now()
    await owner.getByLabel("Email", { exact: true }).fill(memberEmail)
    await owner.getByLabel("Role").selectOption("member")
    await owner.getByRole("button", { name: "Send invitation" }).click()
    await expect(owner.getByText(`Invitation sent to ${memberEmail}.`)).toBeVisible()
    const link = linkIn(
      await latestMail(memberEmail, /invite|join/i, { after: before }),
      /\/invitations\//
    )
    await signUpVerified(member, memberEmail, "Blocked Member")
    await member.goto(link)
    await member.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(member).toHaveURL(/\/notes/)

    // 1. The owner turns the requirement on from the Workspace page's Security card. Scoped to
    // the card itself (its title is the only "Security" heading on the page) since the checkbox
    // and its confirmation replace each other inside it.
    const securityCard = owner.locator("article").filter({ hasText: "Security" })
    await securityCard.locator("#require-two-factor").check()
    await securityCard.getByRole("button", { name: "Save security setting" }).click()
    await expect(securityCard.locator("#require-two-factor-confirm")).toHaveText(
      "1 member will be blocked until they turn on two-step verification."
    )
    await securityCard.getByRole("button", { name: "Turn on requirement" }).click()
    await expect(
      securityCard.getByText("Two-step verification is now required for all members.", {
        exact: true,
      })
    ).toBeVisible()

    // 2. The member, still without two-step verification, sees the notice instead of /notes.
    await member.goto(`${URLS.app}/notes`)
    const notice = member.locator('section[data-slot="two-factor-required-notice"]')
    await expect(
      notice.getByRole("heading", { name: "Two-step verification required" })
    ).toBeVisible()
    await expect(
      notice.getByText(
        `${WORKSPACE} requires two-step verification. Turn it on, or add a passkey, to continue.`,
        { exact: true }
      )
    ).toBeVisible()
    const setupLink = notice.getByRole("link", { name: "Set up two-step verification" })
    await expect(setupLink).toHaveAttribute("href", `${URLS.account}/security`)
    await expect(
      notice.getByRole("button", { name: `Leave ${WORKSPACE}`, exact: true })
    ).toBeVisible()
    await expectAccessible(member, {
      label: "app /notes blocked by required two-step verification",
      route: "app:/notes",
    })

    // The blocked state reflows at 320 × 640 (WCAG 1.4.10), the way a11y-reflow.spec.ts checks
    // every manifest page: nothing widens the document past the viewport.
    const viewport = member.viewportSize()
    await member.setViewportSize({ width: 320, height: 640 })
    const overflow = await member.evaluate(() => {
      const doc = document.documentElement
      if (doc.scrollWidth <= doc.clientWidth) return null
      const wide = [...document.querySelectorAll<HTMLElement>("body *")]
        .filter((el) => el.getBoundingClientRect().right > doc.clientWidth + 1)
        .slice(0, 5)
        .map((el) => `${el.tagName.toLowerCase()}.${el.className}`.slice(0, 80))
      return { scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth, wide }
    })
    expect(overflow, `scrolls sideways at 320 px: ${JSON.stringify(overflow)}`).toBeNull()
    if (viewport) await member.setViewportSize(viewport)

    // 3. The member sets up two-step verification themselves, from the notice's own link.
    await setupLink.click()
    await expect(member).toHaveURL(`${URLS.account}/security`)
    await turnOnTwoFactor(member)

    // 4. Nothing redirects back to /notes on its own — reload it explicitly, and it shows.
    await member.goto(`${URLS.app}/notes`)
    await expect(member.locator('section[data-slot="two-factor-required-notice"]')).toHaveCount(0)
    await expect(member.getByRole("heading", { name: /2fa co/i })).toBeVisible()

    // 5. The owner's Activity card shows the change.
    const activityCard = owner
      .locator("article")
      .filter({ has: owner.locator("#activity-heading") })
    await expect(
      activityCard.getByText("Required two-step verification for all members.")
    ).toBeVisible()
  } finally {
    await ownerCtx.close()
    await memberCtx.close()
  }
})
