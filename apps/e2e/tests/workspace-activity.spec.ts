import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

/** `apps/api/src/mail/mailer.ts`'s `maskEmail`: the first character, then the domain. */
function maskEmail(email: string): string {
  return `${email[0]}***${email.slice(email.indexOf("@"))}`
}

test("owner renames the workspace and invites a member, both show in Activity; a member does not see the card", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const memberCtx = await browser.newContext()
  try {
    const owner = await ownerCtx.newPage()
    const member = await memberCtx.newPage()
    const memberEmail = uniqueEmail("activity-member")

    await signUpVerified(owner, uniqueEmail("activity-owner"))
    await createWorkspace(owner, "Activity Co")
    await owner.goto(`${URLS.account}/workspace`)

    // Rename the workspace.
    await owner.getByLabel("Name", { exact: true }).fill("Activity HQ")
    await owner.getByRole("button", { name: "Save name" }).click()
    await expect(owner.getByText("Workspace renamed.", { exact: true })).toBeVisible()

    // Invite a member.
    const before = Date.now()
    await owner.getByLabel("Email", { exact: true }).fill(memberEmail)
    await owner.getByLabel("Role").selectOption("member")
    await owner.getByRole("button", { name: "Send invitation" }).click()
    await expect(owner.getByText(`Invitation sent to ${memberEmail}.`)).toBeVisible()

    // Both actions show in the owner's Activity card (admin and up, every plan). Scope every
    // assertion to the card itself (the Card component renders as an <article>), so text from
    // another card on the same page can never match.
    const activityCard = owner
      .locator("article")
      .filter({ has: owner.locator("#activity-heading") })
    await expect(activityCard.locator("#activity-heading")).toHaveText("Activity")
    await expect(
      activityCard.getByText("Renamed the workspace from Activity Co to Activity HQ.")
    ).toBeVisible()
    await expect(
      activityCard.getByText(`Invited ${maskEmail(memberEmail)} as Member.`)
    ).toBeVisible()
    await expect(activityCard.getByRole("navigation", { name: "Activity pages" })).toHaveCount(0) // only two rows: no paging yet

    // The invited member accepts and signs in as a plain member — who never sees the card at all.
    const link = linkIn(
      await latestMail(memberEmail, /invite|join/i, { after: before }),
      /\/invitations\//
    )
    await signUpVerified(member, memberEmail)
    await member.goto(link)
    await member.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(member).toHaveURL(/\/notes/)

    await member.goto(`${URLS.account}/workspace`)
    await expect(member.locator("#activity-heading")).toHaveCount(0)
    await expect(member.getByText("Activity", { exact: true })).toHaveCount(0)
  } finally {
    await ownerCtx.close()
    await memberCtx.close()
  }
})
