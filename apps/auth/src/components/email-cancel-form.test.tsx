import { describe, expect, mock, test } from "bun:test"
import { EMAIL_CANCEL_HEADING_ID } from "@/lib/email-change-focus"
import { renderIn } from "@/test-intl"

// The form imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { EmailCancelForm, EmailCancelSuccess } = await import("./email-cancel-form")

describe("EmailCancelForm, server render (before hydration)", () => {
  test("shows the title, a button and the token as a hidden field, never submitted on load", () => {
    const html = renderIn("en", <EmailCancelForm token="a-token" />)
    expect(html).toContain("Cancel email change")
    expect(html).toContain(">Cancel this change</button>")
    expect(html).toContain('<input type="hidden" name="token" value="a-token"')
    expect(html).toMatch(/<form[^>]*action=/)
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailCancelForm token="a-token" />)
    expect(html).toContain("Avbryt e-postadressändring")
    expect(html).toContain(">Avbryt den här ändringen</button>")
  })
})

describe("EmailCancelSuccess", () => {
  test("the heading carries the id focusEmailCancelHeading looks up, as a script-only focus target", () => {
    const html = renderIn("en", <EmailCancelSuccess message="The change was cancelled." />)
    expect(html).toMatch(new RegExp(`<p id="${EMAIL_CANCEL_HEADING_ID}"[^>]*tabindex="-1"[^>]*>`))
    expect(html).toContain("The change was cancelled.")
    expect(html).toContain(">Sign in</a>")
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailCancelSuccess message="Det är avbrutet." />)
    expect(html).toContain("Det är avbrutet.")
    expect(html).toContain(">Logga in</a>")
  })
})
