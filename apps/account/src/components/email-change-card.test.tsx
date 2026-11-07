import { describe, expect, mock, test } from "bun:test"
import { renderIn } from "@/test-intl"

// The card imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
// The action's last answer, as `useActionState` would hand it back after a submit (a server
// render alone only ever sees the initial state). Null: the real hook.
const React = { ...(await import("react")) }
const realUseActionState = React.useActionState
let answered: unknown = null
mock.module("react", () => ({
  ...React,
  useActionState: (...args: Parameters<typeof realUseActionState>) =>
    answered === null ? realUseActionState(...args) : [answered, () => {}, false],
}))
const { EmailChangeCard } = await import("./email-change-card")

const base = {
  email: "ada@example.com",
  emailVerified: true,
  pending: null,
  hasPassword: true,
  twoFactorEnabled: false,
  isImpersonating: false,
  locale: "en" as const,
}

describe("EmailChangeCard, server render (before hydration)", () => {
  test("shows the address, its verified badge, and the change form", () => {
    const html = renderIn("en", <EmailChangeCard {...base} />)
    expect(html).toContain("ada@example.com")
    expect(html).toContain(">Verified</span>")
    expect(html).toContain(">New email address</label>")
    expect(html).toContain(">Current password</label>")
    expect(html).toContain(">Change email</button>")
    expect(html).not.toContain(">Code</label>")
  })

  test("unverified shows the unverified badge", () => {
    const html = renderIn("en", <EmailChangeCard {...base} emailVerified={false} />)
    expect(html).toContain(">Unverified</span>")
  })

  test("a passwordless account has no current-password field", () => {
    const html = renderIn("en", <EmailChangeCard {...base} hasPassword={false} />)
    expect(html).not.toContain(">Current password</label>")
    expect(html).toContain(">New email address</label>")
  })

  test("two-step on adds the code field", () => {
    const html = renderIn("en", <EmailChangeCard {...base} twoFactorEnabled={true} />)
    expect(html).toContain(">Code</label>")
  })

  test("a pending change shows as a status notice and relabels the button Send again", () => {
    const html = renderIn(
      "en",
      <EmailChangeCard
        {...base}
        pending={{ maskedEmail: "n***@example.com", expiresAt: "2026-01-02T12:00:00.000Z" }}
      />
    )
    expect(html).toContain("Check n***@example.com")
    expect(html).toContain(">Send again</button>")
    expect(html).not.toContain(">Change email</button>")
  })

  test("no pending change: the status region is mounted but empty", () => {
    const html = renderIn("en", <EmailChangeCard {...base} />)
    expect(html).toMatch(/<p role="status" aria-live="polite" class="[^"]*"><\/p>/)
  })

  test("while impersonating there is no form, just a read-only notice", () => {
    const html = renderIn("en", <EmailChangeCard {...base} isImpersonating={true} />)
    expect(html).not.toContain(">Change email</button>")
    expect(html).not.toContain("<form")
    expect(html).toContain("Not available while impersonating.")
    // The current address and its badge still show.
    expect(html).toContain("ada@example.com")
  })

  test("in Swedish, the labels and the pending notice are Swedish", () => {
    const html = renderIn(
      "sv",
      <EmailChangeCard
        {...base}
        locale="sv"
        pending={{ maskedEmail: "n***@example.com", expiresAt: "2026-01-02T12:00:00.000Z" }}
      />
    )
    expect(html).toContain(">Ny e-postadress</label>")
    expect(html).toContain(">Skicka igen</button>")
    expect(html).toContain("Kontrollera n***@example.com")
  })
})

describe("EmailChangeCard, after an answer", () => {
  const field = (html: string, name: string) =>
    html.match(new RegExp(`<input[^>]*name="${name}"[^>]*>`))?.[0] ?? ""

  test("a refusal keeps the typed address, never the password or the code", () => {
    answered = {
      ok: false,
      fieldErrors: { code: "That code didn't work." },
      values: { newEmail: "new@example.com" },
    }
    try {
      const html = renderIn("en", <EmailChangeCard {...base} twoFactorEnabled={true} />)
      expect(field(html, "newEmail")).toContain('value="new@example.com"')
      expect(field(html, "currentPassword")).not.toContain("value=")
      expect(field(html, "code")).not.toContain("value=")
    } finally {
      answered = null
    }
  })

  test("after a success the address stays, so Send again resends the same request", () => {
    answered = {
      ok: true,
      pending: { maskedEmail: "n***@example.com", expiresAt: "2026-01-02T12:00:00.000Z" },
      values: { newEmail: "new@example.com" },
    }
    try {
      const html = renderIn("en", <EmailChangeCard {...base} />)
      expect(field(html, "newEmail")).toContain('value="new@example.com"')
      expect(html).toContain(">Send again</button>")
    } finally {
      answered = null
    }
  })
})
