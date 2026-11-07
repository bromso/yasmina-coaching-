import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

const WORKSPACE = "Notify Co"
const MEMBER_NAME = "Notify Member"

test("owner changes a member's role; the member's bell, the notifications list and Mark all as read all reflect it, and a second change arrives live on app /notes", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const memberCtx = await browser.newContext()
  try {
    const owner = await ownerCtx.newPage()
    const member = await memberCtx.newPage()
    const memberEmail = uniqueEmail("notif-member")

    // 1. The owner invites a member by email; the member signs up, verifies and accepts — the
    // same pattern invitations.spec.ts, invite-domains.spec.ts and workspace-require-2fa.spec.ts
    // use. No account exists yet when the invite is sent, so no `invitation.received`
    // notification is created (see the design spec §2) — the member's only notification below is
    // the role change.
    await signUpVerified(owner, uniqueEmail("notif-owner"), "Notify Owner")
    await createWorkspace(owner, WORKSPACE)
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
    await signUpVerified(member, memberEmail, MEMBER_NAME)
    await member.goto(link)
    // "Accept" is a substring of the cookie banner's "Accept all": match it exactly.
    await member.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(member).toHaveURL(/\/notes/)

    // 2. The owner changes the member's role to Admin from the Workspace page's members list
    // (the role select's accessible name is "Role for <name>" — see members-list.tsx).
    await owner.goto(`${URLS.account}/workspace`)
    await owner.getByLabel(`Role for ${MEMBER_NAME}`, { exact: true }).selectOption("admin")
    await owner.getByRole("button", { name: "Save role" }).click()
    await expect(owner.getByText("Role updated.", { exact: true })).toBeVisible()

    // 3. The member's bell shows 1 unread, both server-rendered — on account /notifications...
    await member.goto(`${URLS.account}/notifications`)
    const accountHeader = member.getByRole("banner")
    const accountBell = accountHeader.locator('[data-slot="notification-bell"] a')
    await expect(accountBell).toHaveAccessibleName("1 unread notification")
    await expect(accountHeader.locator('[data-slot="notification-bell-badge"]')).toBeVisible()

    // ...and on app /notes, after a reload (the count renders per request; apps/app's live
    // refresh over /api/events/me is exercised separately in step 6 below).
    await member.goto(`${URLS.app}/notes`)
    await member.reload()
    const appHeader = member.getByRole("banner")
    const appBell = appHeader.locator('[data-slot="notification-bell"] a')
    await expect(appBell).toHaveAccessibleName("1 unread notification")
    await expect(appHeader.locator('[data-slot="notification-bell-badge"]')).toBeVisible()

    // 4. On account /notifications, the unread row names the change.
    await member.goto(`${URLS.account}/notifications`)
    const card = member.locator("article").filter({ has: member.locator("#notifications-heading") })
    const unreadRow = card.locator('li[data-notification-id][data-read="false"]')
    await expect(unreadRow).toContainText(`Your role in ${WORKSPACE} changed to Admin.`)

    // 5. Mark all as read clears the bell and the row.
    await card.getByRole("button", { name: "Mark all as read" }).click()
    await expect(accountBell).toHaveAccessibleName("No unread notifications")
    await expect(accountHeader.locator('[data-slot="notification-bell-badge"]')).toBeHidden()
    await expect(card.locator('li[data-notification-id][data-read="false"]')).toHaveCount(0)
    await expect(card.locator('li[data-notification-id][data-read="true"]')).toBeVisible()

    // 6. Live: with the member already watching app /notes, a second role change arrives over
    // /api/events/me and updates the bell without a manual reload (LiveNotificationRefresh calls
    // router.refresh() on `notification.created`, debounced 1 s — see
    // apps/app/src/components/live-notification-refresh.tsx), the same mechanism
    // realtime.spec.ts proves for live notes.
    await member.goto(`${URLS.app}/notes`)
    await expect(appBell).toHaveAccessibleName("No unread notifications")
    await owner.goto(`${URLS.account}/workspace`)
    await owner.getByLabel(`Role for ${MEMBER_NAME}`, { exact: true }).selectOption("member")
    await owner.getByRole("button", { name: "Save role" }).click()
    await expect(owner.getByText("Role updated.", { exact: true })).toBeVisible()
    await expect(appBell).toHaveAccessibleName("1 unread notification", { timeout: 10_000 })
  } finally {
    await ownerCtx.close()
    await memberCtx.close()
  }
})
