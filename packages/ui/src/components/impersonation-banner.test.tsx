import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { formatEndsAt, ImpersonationBanner } from "./impersonation-banner"

describe("ImpersonationBanner", () => {
  test("names the user, the end time and the reason, and links to stopUrl", () => {
    const html = renderToStaticMarkup(
      <ImpersonationBanner
        name="Ada Lovelace"
        email="ada@example.com"
        reason="support ticket #12"
        expiresAt="2026-06-01T13:05:00.000Z"
        stopUrl="https://auth.brand.com/admin/stop"
      />
    )
    expect(html).toContain('role="status"')
    // A fixed top bar: it stays in view on layouts whose header is not sticky.
    expect(html).toMatch(/class="sticky top-0 z-50 /)
    // The name is wrapped in <strong>, so assert on the visible text pieces around it.
    expect(html).toContain(
      'Viewing as <strong class="font-semibold">Ada Lovelace (ada@example.com)</strong>'
    )
    expect(html).toContain('ends <time dateTime="2026-06-01T13:05:00.000Z">13:05 UTC</time>')
    expect(html).toContain("support ticket #12")
    expect(html).toMatch(
      /<a [^>]*href="https:\/\/auth\.brand\.com\/admin\/stop"[^>]*>Stop impersonating<\/a>/
    )
  })

  test("falls back to the email when the user has no name", () => {
    const html = renderToStaticMarkup(
      <ImpersonationBanner
        name=""
        email="zoe@example.com"
        reason="r"
        expiresAt="2026-06-01T13:05:00.000Z"
        stopUrl="/admin/stop"
      />
    )
    expect(html).toContain('Viewing as <strong class="font-semibold">zoe@example.com</strong> ·')
  })

  test("formatEndsAt is fixed to UTC so server and client agree", () => {
    expect(formatEndsAt("2026-06-01T00:07:00.000Z")).toBe("00:07 UTC")
    expect(formatEndsAt("2026-06-01T13:05:00.000Z")).toBe("13:05 UTC")
  })
})
