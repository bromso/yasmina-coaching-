import { describe, expect, mock, test } from "bun:test"
import { MAX_PASSKEYS } from "@repo/api-contract"
import { PASSKEYS_HEADING_ID } from "@/lib/passkey"
import { renderIn } from "@/test-intl"

// The card imports its server actions, which reach @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { PasskeysCard } = await import("./passkeys-card")
const { SettingsCard } = await import("./settings-card")

const passkey = {
  id: 7,
  name: "Phone",
  createdAt: "2026-10-01T00:00:00.000Z",
  lastUsedAt: null,
}

describe("PasskeysCard, server render (before hydration)", () => {
  test("Add a passkey is an invisible, inert placeholder of the same form", () => {
    const html = renderIn(
      "en",
      <PasskeysCard passkeys={[]} hasPassword isImpersonating={false} locale="en" />
    )
    // The same form as the real one, so the cards below never shift once it appears…
    const placeholder = html.match(/<div aria-hidden="true" inert(="")? class="([^"]*)"><form/)
    expect(placeholder).not.toBeNull()
    // …out of the accessibility tree and never focusable…
    expect(placeholder?.[2]).toContain("invisible")
    // …and, without JavaScript at all, gone with no reserved gap.
    expect(placeholder?.[2]).toContain("[@media(scripting:none)]:hidden")
    expect(html).toContain(">Add a passkey</button>")
    expect(html).toContain("Current password")
  })

  test("in Swedish, the placeholder carries the Swedish labels", () => {
    const html = renderIn(
      "sv",
      <PasskeysCard passkeys={[]} hasPassword={false} isImpersonating={false} locale="sv" />
    )
    expect(html).toContain(">Lägg till en passkey</button>")
    expect(html).not.toContain("Nuvarande lösenord")
  })

  test("while impersonating there is no form, placeholder or otherwise", () => {
    const html = renderIn(
      "en",
      <PasskeysCard passkeys={[passkey]} hasPassword isImpersonating locale="en" />
    )
    expect(html).not.toContain("inert")
    expect(html).not.toContain(">Add a passkey</button>")
    expect(html).toContain("Not available while impersonating.")
  })

  test("the arming status region is mounted, empty, before any row is armed", () => {
    const html = renderIn(
      "en",
      <PasskeysCard passkeys={[passkey]} hasPassword isImpersonating={false} locale="en" />
    )
    expect(html).toContain('<p role="status" class="sr-only"></p>')
    // The no-JS remove form: a plain submit, labelled Remove, never pre-armed.
    expect(html).toMatch(/<button[^>]*type="submit"[^>]*>Remove<\/button>/)
    expect(html).not.toContain("Confirm removal")
  })
})

describe("PasskeysCard at the per-account cap", () => {
  const full = Array.from({ length: MAX_PASSKEYS }, (_, i) => ({ ...passkey, id: i + 1 }))

  test("explains why there is no Add a passkey, instead of offering it", () => {
    const html = renderIn(
      "en",
      <PasskeysCard passkeys={full} hasPassword isImpersonating={false} locale="en" />
    )
    expect(html).not.toContain(">Add a passkey</button>")
    expect(html).not.toContain("Current password")
    expect(html).toContain(
      `You have ${MAX_PASSKEYS} passkeys, the most an account can have. Remove one to add another.`
    )
  })

  test("in Swedish too", () => {
    const html = renderIn(
      "sv",
      <PasskeysCard passkeys={full} hasPassword isImpersonating={false} locale="sv" />
    )
    expect(html).not.toContain(">Lägg till en passkey</button>")
    expect(html).toContain(`Du har ${MAX_PASSKEYS} passkeys`)
  })

  test("one below the cap still offers the form", () => {
    const html = renderIn(
      "en",
      <PasskeysCard passkeys={full.slice(1)} hasPassword isImpersonating={false} locale="en" />
    )
    expect(html).toContain(">Add a passkey</button>")
    expect(html).not.toContain("the most an account can have")
  })
})

describe("the card's heading as a focus target", () => {
  test("SettingsCard gives a titleId'd title an id and tabindex -1 (focusable, not a tab stop)", () => {
    const html = renderIn(
      "en",
      <SettingsCard title="Passkeys" titleId={PASSKEYS_HEADING_ID}>
        <p>body</p>
      </SettingsCard>
    )
    expect(html).toMatch(new RegExp(`id="${PASSKEYS_HEADING_ID}"[^>]*tabindex="-1"[^>]*>Passkeys<`))
  })

  test("without titleId the title stays an ordinary, unfocusable title", () => {
    const html = renderIn(
      "en",
      <SettingsCard title="Passkeys">
        <p>body</p>
      </SettingsCard>
    )
    expect(html).not.toContain("tabindex")
  })
})
