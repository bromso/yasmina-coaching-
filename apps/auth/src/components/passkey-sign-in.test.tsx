import { describe, expect, mock, test } from "bun:test"
import { renderIn } from "@/test-intl"

// Reaches @repo/session through @/app/login/actions: `server-only` throws outside a
// react-server bundle, so stub it before the dynamic import below.
mock.module("server-only", () => ({}))
const { PasskeySignIn } = await import("./passkey-sign-in")

describe("PasskeySignIn, server render (before hydration)", () => {
  test("an invisible, inert placeholder of the same button, message area and divider", () => {
    const html = renderIn("en", <PasskeySignIn dividerLabel="Or sign in with your email" />)
    // Same content as the real block, so nothing shifts in size once it appears…
    expect(html).toContain(">Sign in with a passkey</button>")
    expect(html).toContain("Or sign in with your email")
    // …but out of the accessibility tree and never focusable…
    expect(html).toMatch(/^<div aria-hidden="true" inert(="")? class="invisible /)
    // …and, without JavaScript at all, gone with no reserved gap.
    expect(html).toContain("[@media(scripting:none)]:hidden")
  })

  test("in Swedish, the same placeholder shows the Swedish button text and divider", () => {
    const html = renderIn("sv", <PasskeySignIn dividerLabel="Eller logga in med din e-post" />)
    expect(html).toContain(">Logga in med en passkey</button>")
    expect(html).toContain("Eller logga in med din e-post")
  })
})
