import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { TwoFactorRequiredNotice } from "./two-factor-required-notice"

const base = {
  title: "Two-step verification required",
  body: "Acme requires two-step verification. Turn it on, or add a passkey, to continue.",
  setupHref: "http://account.brand.localhost:3003/security",
  setupLabel: "Set up two-step verification",
}

describe("TwoFactorRequiredNotice", () => {
  test("renders the title as the section's heading, the body and the setup link", () => {
    const html = renderToStaticMarkup(<TwoFactorRequiredNotice {...base} />)
    const id = html.match(/<section[^>]*aria-labelledby="([^"]+)"/)?.[1]
    expect(id).toBeTruthy()
    expect(html).toMatch(new RegExp(`<h1 id="${id}"[^>]*>Two-step verification required</h1>`))
    expect(html).toContain(
      "Acme requires two-step verification. Turn it on, or add a passkey, to continue."
    )
    expect(html).toMatch(
      /<a href="http:\/\/account\.brand\.localhost:3003\/security"[^>]*>Set up two-step verification<\/a>/
    )
  })

  test("renders the switch and leave slots when given", () => {
    const html = renderToStaticMarkup(
      <TwoFactorRequiredNotice
        {...base}
        switchSlot={<button type="submit">Switch to Beta</button>}
        leaveSlot={<button type="submit">Leave Acme</button>}
      />
    )
    expect(html).toContain('data-slot="two-factor-required-notice-switch"')
    expect(html).toContain("Switch to Beta")
    expect(html).toContain('data-slot="two-factor-required-notice-leave"')
    expect(html).toContain("Leave Acme")
  })

  test("omits the slots' wrappers when not given, and merges className", () => {
    const html = renderToStaticMarkup(<TwoFactorRequiredNotice {...base} className="extra" />)
    expect(html).not.toContain("two-factor-required-notice-switch")
    expect(html).not.toContain("two-factor-required-notice-leave")
    expect(html).toMatch(/<section[^>]*class="[^"]*extra[^"]*"/)
  })
})
