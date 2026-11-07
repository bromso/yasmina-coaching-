import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { signUpVerified, uniqueEmail } from "../fixtures/accounts"
import { latestMail, linkIn } from "../fixtures/mail"

test("the mailed link signs in only on Continue", async ({ page, browser }) => {
  const email = uniqueEmail("magic")
  await signUpVerified(page, email)

  const fresh = await browser.newContext()
  try {
    const tab = await fresh.newPage()
    const before = Date.now()
    await tab.goto(`${URLS.auth}/login`)
    const form = tab.getByRole("form", { name: "Email me a sign-in link" })
    await form.getByLabel("Email").fill(email)
    await form.getByRole("button", { name: "Email me a sign-in link" }).click()
    await expect(form.getByRole("status")).toContainText(/check your inbox/i)

    const link = linkIn(
      await latestMail(email, /sign in|sign-in/i, { after: before }),
      /\/magic\?token=/
    )
    await tab.goto(link)
    await tab.goto(`${URLS.account}/`)
    await expect(tab).toHaveURL(/\/login/) // loading the link did not sign in

    await tab.goto(link)
    await tab.getByRole("button", { name: "Continue" }).click()
    await expect(tab).not.toHaveURL(/\/magic|\/login/)
    await tab.goto(`${URLS.account}/`)
    await expect(tab).toHaveURL(`${URLS.account}/`)
  } finally {
    await fresh.close()
  }
})
