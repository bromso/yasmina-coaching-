import { describe, expect, mock, test } from "bun:test"
import { renderIn } from "@/test-intl"

mock.module("server-only", () => ({}))

// No `mock.module` of the form (see email-revert-view.test.tsx): the real one is rendered.
const { EmailUnsubscribeView, notificationSettingsUrl } = await import("./email-unsubscribe-view")

describe("EmailUnsubscribeView", () => {
  test("computes the account Notifications url server-side", () => {
    expect(notificationSettingsUrl()).toBe("http://account.brand.localhost:3003/notifications")
  })

  test("a recognised link: the real form carrying the token", () => {
    const html = renderIn(
      "en",
      <EmailUnsubscribeView token="a-token" link={{ status: "valid", type: "plan.changed" }} />
    )
    expect(html).toContain('value="a-token"')
    expect(html).toContain(">Turn off these emails</button>")
  })

  test("an unrecognised link: only the neutral note, no form", () => {
    const html = renderIn(
      "en",
      <EmailUnsubscribeView token="a-token" link={{ status: "invalid" }} />
    )
    expect(html).toContain("This link isn&#x27;t valid any more.")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("a-token")
  })
  test("the api could not answer: the try-again note, never the invalid one, and no form", () => {
    const html = renderIn(
      "en",
      <EmailUnsubscribeView token="a-token" link={{ status: "unavailable" }} />
    )
    expect(html).toContain("We couldn&#x27;t load this right now. Try again in a few minutes.")
    expect(html).not.toContain("valid any more")
    expect(html).not.toContain("<form")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("a-token")
  })
})
