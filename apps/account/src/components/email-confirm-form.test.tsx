import { describe, expect, mock, test } from "bun:test"
import { EMAIL_CONFIRM_HEADING_ID } from "@/lib/email-confirm"
import { renderIn } from "@/test-intl"

// The form imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { EmailConfirmForm, EmailConfirmSuccess } = await import("./email-confirm-form")

describe("EmailConfirmForm, server render (before hydration)", () => {
  test("shows a button and the token as a hidden field, never submitted on load", () => {
    const html = renderIn("en", <EmailConfirmForm token="a-token" />)
    expect(html).toContain(">Confirm new email</button>")
    expect(html).toContain('<input type="hidden" name="token" value="a-token"')
    expect(html).toMatch(/<form[^>]*action=/)
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailConfirmForm token="a-token" />)
    expect(html).toContain(">Bekräfta ny e-post</button>")
  })
})

describe("EmailConfirmSuccess", () => {
  test("the heading carries the id focusEmailConfirmHeading looks up, as a script-only focus target", () => {
    const html = renderIn("en", <EmailConfirmSuccess email="new@example.com" />)
    expect(html).toMatch(new RegExp(`<p id="${EMAIL_CONFIRM_HEADING_ID}"[^>]*tabindex="-1"[^>]*>`))
    expect(html).toContain("Your email is now new@example.com.")
    expect(html).toContain(">Back to Personal info</a>")
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailConfirmSuccess email="new@example.com" />)
    expect(html).toContain("Din e-postadress är nu new@example.com.")
    expect(html).toContain(">Tillbaka till Personuppgifter</a>")
  })
})
