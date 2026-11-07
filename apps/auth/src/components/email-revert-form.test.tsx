import { describe, expect, mock, test } from "bun:test"
import { EMAIL_REVERT_HEADING_ID } from "@/lib/email-change-focus"
import { renderIn } from "@/test-intl"

// The form imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { EmailRevertForm, EmailRevertSuccess } = await import("./email-revert-form")

const securityUrl = "http://account.brand.localhost:3003/security"

describe("EmailRevertForm, server render (before hydration)", () => {
  test("shows the title, a button and the token as a hidden field, never submitted on load", () => {
    const html = renderIn("en", <EmailRevertForm token="a-token" securityUrl={securityUrl} />)
    expect(html).toContain("Restore your email")
    expect(html).toContain(">Restore my email</button>")
    expect(html).toContain('<input type="hidden" name="token" value="a-token"')
    expect(html).toMatch(/<form[^>]*action=/)
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailRevertForm token="a-token" securityUrl={securityUrl} />)
    expect(html).toContain("Återställ din e-post")
    expect(html).toContain(">Återställ min e-post</button>")
  })
})

describe("EmailRevertSuccess", () => {
  test("the heading carries the id focusEmailRevertHeading looks up, as a script-only focus target", () => {
    const html = renderIn(
      "en",
      <EmailRevertSuccess passwordReset={false} securityUrl={securityUrl} />
    )
    expect(html).toMatch(new RegExp(`<p id="${EMAIL_REVERT_HEADING_ID}"[^>]*tabindex="-1"[^>]*>`))
    expect(html).toContain(
      "Your email is restored. Every session was signed out, passkeys removed and anything set up after the change undone."
    )
    expect(html).not.toContain("Check your email for a link to set a new password.")
    expect(html).toContain("Review your connected sign-in providers")
    expect(html).toContain("Security settings</a>")
    expect(html).toContain(`href="${securityUrl}"`)
    expect(html).toContain(">Sign in</a>")
  })

  test("mentions the password-reset mail only when passwordReset is true", () => {
    const html = renderIn(
      "en",
      <EmailRevertSuccess passwordReset={true} securityUrl={securityUrl} />
    )
    expect(html).toContain("Check your email for a link to set a new password.")
  })

  test("renders whatever securityUrl it is given, never computing its own", () => {
    const html = renderIn(
      "en",
      <EmailRevertSuccess passwordReset={false} securityUrl="https://example.com/security" />
    )
    expect(html).toContain('href="https://example.com/security"')
  })

  test("in Swedish", () => {
    const html = renderIn(
      "sv",
      <EmailRevertSuccess passwordReset={true} securityUrl={securityUrl} />
    )
    expect(html).toContain("Din e-post är återställd.")
    expect(html).toContain("Titta i din e-post efter en länk för att skapa ett nytt lösenord.")
    expect(html).toContain("Säkerhet</a>")
    expect(html).toContain(">Logga in</a>")
  })
})
