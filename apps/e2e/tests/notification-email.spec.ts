import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { expectAccessible } from "../fixtures/a11y"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { assertNoMail, latestMail, linkIn } from "../fixtures/mail"

const WORKSPACE = "Notify Mail Co"
const MEMBER_NAME = "Notify Mail Member"

/**
 * Member turns off `member.role_changed` email; an owner's role change then reaches the inbox but
 * not the mailbox. Separately, a real optional-type mail's RFC 8058 `List-Unsubscribe` is posted
 * one-click, turning that type off (checked on the settings page), and the same token's body link
 * is confirmed a second time, idempotently.
 *
 * `plan.changed` is not the mail this test delivers, on purpose — see the comment at the mock
 * billing step below for why this stack (mock billing) never mails it. `member.removed` stands in
 * for it: also optional, on by default, and (unlike `plan.changed` under mock billing)
 * deliverable by one real account acting on a different one, so the RFC 8058 mechanics this test
 * exists to prove — the header, the one-click POST, the settings reflection, the idempotent body
 * link — are exercised against a mail that genuinely arrives.
 */
test("member turns off role-change email, then one-click unsubscribes from the next optional mail", async ({
  browser,
  request,
}) => {
  const ownerCtx = await browser.newContext()
  const memberCtx = await browser.newContext()
  try {
    const owner = await ownerCtx.newPage()
    const member = await memberCtx.newPage()
    const ownerEmail = uniqueEmail("notify-mail-owner")
    const memberEmail = uniqueEmail("notify-mail-member")

    // 1. The owner invites a member by email; the member signs up, verifies and accepts — the
    // same pattern notifications.spec.ts uses.
    await signUpVerified(owner, ownerEmail)
    await createWorkspace(owner, WORKSPACE)
    await owner.goto(`${URLS.account}/workspace`)
    const invitedAt = Date.now()
    await owner.getByLabel("Email", { exact: true }).fill(memberEmail)
    await owner.getByLabel("Role").selectOption("member")
    await owner.getByRole("button", { name: "Send invitation" }).click()
    await expect(owner.getByText(`Invitation sent to ${memberEmail}.`)).toBeVisible()
    const inviteLink = linkIn(
      await latestMail(memberEmail, /invite|join/i, { after: invitedAt }),
      /\/invitations\//
    )
    await signUpVerified(member, memberEmail, MEMBER_NAME)
    await member.goto(inviteLink)
    await member.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(member).toHaveURL(/\/notes/)

    // 2. The member turns off the role-change email, scoped to the Email card.
    await member.goto(`${URLS.account}/notifications`)
    const emailCard = member
      .locator("article")
      .filter({ has: member.locator("#notification-email-heading") })
    // The card's heading by id: unambiguous whatever else on the page reads "Email". (The form's
    // sr-only legend names the choice, "Also send me an email", not the card's title.)
    await expect(member.locator("#notification-email-heading")).toHaveText("Email")
    await emailCard.locator("#notification-email-member-role-changed").uncheck()
    await emailCard.getByRole("button", { name: "Save email settings" }).click()
    await expect(emailCard.getByText("Email settings saved.", { exact: true })).toBeVisible()

    // 3. The owner changes the member's role. The in-app notification lands either way; the mail
    // does not, because the member just turned it off.
    await owner.goto(`${URLS.account}/workspace`)
    const roleChangedAt = Date.now()
    await owner.getByLabel(`Role for ${MEMBER_NAME}`, { exact: true }).selectOption("admin")
    await owner.getByRole("button", { name: "Save role" }).click()
    await expect(owner.getByText("Role updated.", { exact: true })).toBeVisible()

    await member.goto(`${URLS.account}/notifications`)
    const notificationsCard = member
      .locator("article")
      .filter({ has: member.locator("#notifications-heading") })
    const roleChangedRow = notificationsCard.locator('li[data-notification-id][data-read="false"]')
    await expect(roleChangedRow).toContainText(`Your role in ${WORKSPACE} changed to Admin.`)
    await assertNoMail(memberEmail, new RegExp(`^Your role in ${WORKSPACE} changed$`), {
      after: roleChangedAt,
    })

    // 4. The owner changes the workspace plan via the mock billing form (billing.spec.ts's own
    // flow). The billing mirror never mails the actor (`mirror.ts`: "Each owner but the one who
    // made the change"), and a workspace has exactly one owner at a time — `transferOwnership`
    // always swaps, never adds, and `ASSIGNABLE_ROLES` excludes `owner` — so under mock billing,
    // which this stack runs, the sole owner is the actor and nobody is mailed. That is specific
    // to the mock: under `BILLING_PROVIDER=stripe` an in-app checkout goes through Stripe's
    // webhook, whose actor is `{}`, so every owner is mailed, the one who paid included
    // (`apps/api/src/notifications.test.ts` covers that path). So: exercise the real feature (the
    // plan does change), and confirm mock billing's behaviour (no mail to the acting owner).
    await owner.goto(`${URLS.account}/payments`)
    const checkoutAt = Date.now()
    await owner.getByRole("radio", { name: /Pro/ }).check()
    await owner.getByRole("button", { name: "Continue to checkout" }).click()
    await expect(owner).toHaveURL(/checkout=success/)
    await expect(owner.getByText("You're on Pro.")).toBeVisible()
    await assertNoMail(ownerEmail, new RegExp(`^${WORKSPACE} is now on the Pro plan$`), {
      after: checkoutAt,
    })

    // 5. The owner removes the member from the workspace — a real, deliverable optional mail
    // (`member.removed`): the recipient (the member) is not the actor (the owner), so it is not
    // excluded the way the mock's `plan.changed` is above. This is the mail whose `List-Unsubscribe` the
    // rest of this test one-click unsubscribes from.
    await owner.goto(`${URLS.account}/workspace`)
    const membersCard = owner
      .locator("article")
      .filter({ has: owner.getByText("Members", { exact: true }) })
    const removedAt = Date.now()
    await membersCard
      .locator("li")
      .filter({ hasText: MEMBER_NAME })
      .getByRole("button", { name: "Remove" })
      .click()
    await expect(owner.getByText("Member removed.", { exact: true })).toBeVisible()

    const removedMail = await latestMail(
      memberEmail,
      new RegExp(`^You were removed from ${WORKSPACE}$`),
      { after: removedAt }
    )
    const listUnsubscribe = removedMail.headers?.["List-Unsubscribe"]
    const oneClickUrl = listUnsubscribe?.match(/^<(.+)>$/)?.[1]
    if (!oneClickUrl) throw new Error(`malformed or missing List-Unsubscribe: ${listUnsubscribe}`)
    expect(removedMail.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")

    // POST the one-click endpoint as a mail client would (RFC 8058): any body (here the
    // conventional one) works, since the token in the query string is all it reads.
    const oneClickResponse = await request.post(oneClickUrl, {
      form: { "List-Unsubscribe": "One-Click" },
    })
    expect(oneClickResponse.status()).toBe(200)
    expect(await oneClickResponse.body()).toHaveLength(0)

    // 6. The settings page reflects the one-click: the member-removed checkbox is now off.
    await member.goto(`${URLS.account}/notifications`)
    const emailCardAfter = member
      .locator("article")
      .filter({ has: member.locator("#notification-email-heading") })
    await expect(emailCardAfter.locator("#notification-email-member-removed")).not.toBeChecked()

    // 7. The body link from the same mail: the confirm state, then the idempotent success state
    // (the token was already spent by the one-click POST above), each checked for accessibility.
    const bodyLink = linkIn(removedMail, /\/email\/unsubscribe\?token=/)
    await member.goto(bodyLink)
    await expect(member.getByRole("button", { name: "Turn off these emails" })).toBeVisible()
    await expectAccessible(member, {
      label: "auth /email/unsubscribe confirm",
      route: "auth:/email/unsubscribe",
    })
    await member.getByRole("button", { name: "Turn off these emails" }).click()
    await expect(
      member.getByText(
        "You won't get these emails any more. You can change this any time in your notification settings.",
        { exact: true }
      )
    ).toBeVisible()
    await expectAccessible(member, {
      label: "auth /email/unsubscribe success",
      route: "auth:/email/unsubscribe",
    })
  } finally {
    await ownerCtx.close()
    await memberCtx.close()
  }
})
