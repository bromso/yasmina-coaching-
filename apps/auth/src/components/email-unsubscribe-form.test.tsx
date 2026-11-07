import { describe, expect, mock, test } from "bun:test"
import { EMAIL_UNSUBSCRIBE_HEADING_ID } from "@/lib/email-change-focus"
import { renderIn } from "@/test-intl"

// The form imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const {
  EmailUnsubscribeForm,
  EmailUnsubscribeInvalid,
  EmailUnsubscribeSuccess,
  EmailUnsubscribeUnavailable,
} = await import("./email-unsubscribe-form")

const settingsUrl = "http://account.brand.localhost:3003/notifications"

describe("EmailUnsubscribeForm, server render (before hydration)", () => {
  test("names the type, shows the button and the token as a hidden field, never submitted on load", () => {
    const html = renderIn(
      "en",
      <EmailUnsubscribeForm token="a-token" type="member.role_changed" settingsUrl={settingsUrl} />
    )
    expect(html).toContain("Notification emails")
    expect(html).toContain("These emails are sent when your role in a workspace changes.")
    expect(html).toContain(">Turn off these emails</button>")
    expect(html).toContain('<input type="hidden" name="token" value="a-token"')
    expect(html).toMatch(/<form[^>]*action=/)
  })

  test("each optional type gets its own sentence", () => {
    const removed = renderIn(
      "en",
      <EmailUnsubscribeForm token="t" type="member.removed" settingsUrl={settingsUrl} />
    )
    expect(removed).toContain("These emails are sent when someone removes you from a workspace.")
    const plan = renderIn(
      "en",
      <EmailUnsubscribeForm token="t" type="plan.changed" settingsUrl={settingsUrl} />
    )
    expect(plan).toContain("These emails are sent when the plan of a workspace you own changes.")
  })

  test("in Swedish", () => {
    const html = renderIn(
      "sv",
      <EmailUnsubscribeForm token="a-token" type="member.role_changed" settingsUrl={settingsUrl} />
    )
    expect(html).toContain("De här mejlen skickas när din roll i en arbetsyta ändras.")
    expect(html).toContain(">Stäng av de här mejlen</button>")
  })
})

describe("EmailUnsubscribeSuccess", () => {
  test("the message is a script-only focus target, with a link to the notification settings", () => {
    const html = renderIn(
      "en",
      <EmailUnsubscribeSuccess message="Done." settingsUrl={settingsUrl} />
    )
    expect(html).toMatch(
      new RegExp(`<p id="${EMAIL_UNSUBSCRIBE_HEADING_ID}"[^>]*tabindex="-1"[^>]*>Done.</p>`)
    )
    expect(html).toContain(`href="${settingsUrl}"`)
    expect(html).toContain(">Notification settings</a>")
  })

  test("in Swedish", () => {
    const html = renderIn(
      "sv",
      <EmailUnsubscribeSuccess message="Klart." settingsUrl={settingsUrl} />
    )
    expect(html).toContain(">Aviseringsinställningar</a>")
  })
})

describe("EmailUnsubscribeInvalid", () => {
  test("one neutral sentence and a sign-in link, no button", () => {
    const html = renderIn("en", <EmailUnsubscribeInvalid />)
    expect(html).toContain("This link isn&#x27;t valid any more.")
    expect(html).toContain('href="/login"')
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<form")
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailUnsubscribeInvalid />)
    expect(html).toContain("Den här länken gäller inte längre.")
    expect(html).toContain(">Logga in</a>")
  })
})

describe("EmailUnsubscribeUnavailable", () => {
  test("a try-again note: no button, no sign-in link, nothing about the token", () => {
    const html = renderIn("en", <EmailUnsubscribeUnavailable />)
    expect(html).toContain("We couldn&#x27;t load this right now. Try again in a few minutes.")
    expect(html).not.toContain("<button")
    expect(html).not.toContain("<a ")
  })

  test("in Swedish", () => {
    const html = renderIn("sv", <EmailUnsubscribeUnavailable />)
    expect(html).toContain("Det gick inte att ladda just nu. Försök igen om några minuter.")
  })
})
