import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

test("invite by email, accept, address mismatch refused, viewer cannot write", async ({
  browser,
}) => {
  const ownerCtx = await browser.newContext()
  const inviteeCtx = await browser.newContext()
  const strangerCtx = await browser.newContext()
  try {
    const owner = await ownerCtx.newPage()
    const invitee = await inviteeCtx.newPage()
    const stranger = await strangerCtx.newPage()
    const bEmail = uniqueEmail("invitee")

    await signUpVerified(owner, uniqueEmail("owner"))
    await createWorkspace(owner, "Invite Co")
    await owner.goto(`${URLS.account}/workspace`)
    await owner.getByLabel("Email", { exact: true }).fill(bEmail)
    await owner.getByLabel("Role").selectOption("viewer")
    const before = Date.now()
    await owner.getByRole("button", { name: "Send invitation" }).click()
    await expect(owner.getByText(`Invitation sent to ${bEmail}.`)).toBeVisible()
    const link = linkIn(
      await latestMail(bEmail, /invite|join/i, { after: before }),
      /\/invitations\//
    )

    // A stranger signed in with a different address holds the link but is not who it was sent to.
    await signUpVerified(stranger, uniqueEmail("stranger"))
    await stranger.goto(link)
    // "Accept" is a substring of the cookie banner's "Accept all": match it exactly.
    await stranger.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(
      stranger.getByText(/This invitation was sent to .+\. Sign in with that address/)
    ).toBeVisible()

    await signUpVerified(invitee, bEmail)
    await invitee.goto(link)
    await invitee.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(invitee).toHaveURL(/\/notes/)
    await expect(invitee.getByRole("heading", { name: /invite co/i })).toBeVisible()

    // The api's refusal of a viewer's write is covered by apps/api's tests; this checks the UI.
    // A viewer sees the notes but notes-view never renders the add-note form below the member role
    // (see notes-view.tsx), so this is deterministic rather than conditional on the DOM.
    await expect(invitee.getByLabel("Title")).toHaveCount(0)
    await expect(invitee.getByRole("button", { name: "Add note" })).toHaveCount(0)
  } finally {
    await ownerCtx.close()
    await inviteeCtx.close()
    await strangerCtx.close()
  }
})
