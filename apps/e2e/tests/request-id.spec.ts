import { expect, test } from "@playwright/test"
import { URLS } from "../e2e.env"
import { createWorkspace, signUpVerified, uniqueEmail } from "../fixtures/accounts"

// 16 random bytes, base64url: 22 characters (see `@repo/log`'s `newRequestId`).
const REQUEST_ID = /^[A-Za-z0-9_-]{22}$/

test.describe("request id", () => {
  test("www / carries a valid x-request-id, different on each load", async ({ page }) => {
    const first = await page.goto(URLS.www)
    const second = await page.goto(URLS.www)
    const a = first?.headers()["x-request-id"]
    const b = second?.headers()["x-request-id"]
    expect(a).toMatch(REQUEST_ID)
    expect(b).toMatch(REQUEST_ID)
    expect(a).not.toBe(b)
  })

  test("auth /login carries a valid x-request-id, different on each load", async ({ page }) => {
    const first = await page.goto(`${URLS.auth}/login`)
    const second = await page.goto(`${URLS.auth}/login`)
    const a = first?.headers()["x-request-id"]
    const b = second?.headers()["x-request-id"]
    expect(a).toMatch(REQUEST_ID)
    expect(b).toMatch(REQUEST_ID)
    expect(a).not.toBe(b)
  })

  test("app /notes (signed in) carries a valid x-request-id, different on each load", async ({
    page,
  }) => {
    await signUpVerified(page, uniqueEmail("reqid"))
    await createWorkspace(page, "Request Id")
    const first = await page.goto(`${URLS.app}/notes`)
    const second = await page.goto(`${URLS.app}/notes`)
    const a = first?.headers()["x-request-id"]
    const b = second?.headers()["x-request-id"]
    expect(a).toMatch(REQUEST_ID)
    expect(b).toMatch(REQUEST_ID)
    expect(a).not.toBe(b)
  })
})
