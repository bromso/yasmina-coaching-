import { expect, type Page, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

/**
 * A hydration mismatch in a production build is a minified React error (#418, #419, #421, #422,
 * #423, #425) rather than the word "hydration", so both are matched.
 */
const HYDRATION = /hydrat|react\.dev\/errors\/(418|419|421|422|423|425)/i

/** Collects console errors and uncaught page errors that look like a hydration mismatch. */
function watchHydration(page: Page): string[] {
  const found: string[] = []
  page.on("console", (message) => {
    if (message.type() === "error" && HYDRATION.test(message.text())) found.push(message.text())
  })
  page.on("pageerror", (error) => {
    if (HYDRATION.test(`${error.message}\n${error.stack ?? ""}`)) found.push(error.message)
  })
  return found
}

test("live notes and who's here across two members", async ({ browser }) => {
  const ownerCtx = await browser.newContext()
  // A non-UTC zone: the notes list prints dates in UTC on purpose, so the server render and the
  // client's hydration (and a live-inserted note) agree whatever the browser's own zone is.
  const memberCtx = await browser.newContext({ timezoneId: "America/Los_Angeles" })
  try {
    const a = await ownerCtx.newPage()
    const b = await memberCtx.newPage()
    const aHydration = watchHydration(a)
    const bHydration = watchHydration(b)
    const bEmail = uniqueEmail("live-member")

    await signUpVerified(a, uniqueEmail("live-owner"), "Ada Owner")
    await createWorkspace(a, "Live Co")
    await a.goto(`${URLS.account}/workspace`)
    await a.getByLabel("Email", { exact: true }).fill(bEmail)
    await a.getByLabel("Role").selectOption("member")
    const before = Date.now()
    await a.getByRole("button", { name: "Send invitation" }).click()
    await expect(a.getByText(`Invitation sent to ${bEmail}.`)).toBeVisible()
    const link = linkIn(
      await latestMail(bEmail, /invite|join/i, { after: before }),
      /\/invitations\//
    )

    await signUpVerified(b, bEmail, "Bea Member")
    await b.goto(link)
    // "Accept" is a substring of the cookie banner's "Accept all": match it exactly.
    await b.getByRole("button", { name: "Accept", exact: true }).click()
    await expect(b).toHaveURL(/\/notes/)

    await a.goto(`${URLS.app}/notes`)
    await expect(a.getByText("2 people here")).toBeVisible()
    await expect(b.getByText("2 people here")).toBeVisible()

    // A creates a note through the form: it appears for B without a reload, and A's own
    // re-render after the action keeps "Here now" (presence survives the list's re-seed).
    await a.getByLabel("Title").fill("Live hello")
    await a.getByLabel("Body").fill("Sent while you watch")
    await a.getByRole("button", { name: "Add note" }).click()
    const aNote = a.getByRole("listitem").filter({ hasText: "Live hello" })
    await expect(aNote).toBeVisible()
    await expect(b.getByRole("listitem").filter({ hasText: "Live hello" })).toBeVisible()
    await expect(a.getByText("2 people here")).toBeVisible()
    await expect(b.getByText("2 people here")).toBeVisible()

    // B reloads with the note on the page: its server-rendered date must hydrate unchanged in
    // B's non-UTC zone (checked by the hydration watchers below), and B rejoins "Here now".
    await b.reload()
    await expect(b.getByRole("listitem").filter({ hasText: "Live hello" })).toBeVisible()
    await expect(b.getByText("2 people here")).toBeVisible()
    await expect(a.getByText("2 people here")).toBeVisible()

    // A deletes it: it disappears for B, again without a reload.
    await aNote.getByRole("button", { name: /delete/i }).click()
    const confirm = a.getByRole("alertdialog")
    await expect(confirm).toBeVisible()
    await confirm.getByRole("button", { name: "Delete" }).click()
    await expect(a.getByText("Live hello")).toHaveCount(0)
    await expect(b.getByText("Live hello")).toHaveCount(0)
    await expect(a.getByText("2 people here")).toBeVisible()

    // B leaves: the browser's disconnect reaches the api through app's /api/events relay, and
    // the api's presence snapshot tells A.
    await b.close()
    // Not the default 5 s: the leave travels B's socket close → Next's relay abort → the api's
    // stream close → a presence snapshot, and a slow CI runner can take longer than that.
    await expect(a.getByText("1 person here")).toBeVisible({ timeout: 10_000 })

    expect(aHydration, "hydration errors on the owner's pages").toEqual([])
    expect(bHydration, "hydration errors on the member's pages (non-UTC zone)").toEqual([])
  } finally {
    await ownerCtx.close()
    await memberCtx.close()
  }
})
