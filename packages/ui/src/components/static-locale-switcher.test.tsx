import { describe, expect, test } from "bun:test"
import { localeCookie } from "@repo/i18n/cookie"
import { renderToStaticMarkup } from "react-dom/server"
import { chooseLocale, StaticLocaleSwitcher, writeLocaleCookie } from "./static-locale-switcher"

const options = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
]

describe("StaticLocaleSwitcher, server render", () => {
  test("an invisible, inert placeholder of the same trigger until hydrated (no form fallback)", () => {
    const html = renderToStaticMarkup(<StaticLocaleSwitcher options={options} />)
    // Same size as the real switcher's trigger, so nothing in the header shifts when it appears…
    expect(html).toContain("<summary")
    expect(html).toContain('<span lang="en">English</span>')
    expect(html).not.toContain("<select")
    // …but out of the accessibility tree and never focusable.
    expect(html).toMatch(/^<div aria-hidden="true" inert="" class="invisible /)
    expect(html).not.toContain('role="status"')
    expect(html).not.toContain("<form")
  })
})

describe("writeLocaleCookie", () => {
  test("writes the exact cookie string localeCookie would build, through the injected writer", () => {
    const calls: string[] = []
    writeLocaleCookie("sv", { domain: ".brand.localhost", secure: true }, (s) => calls.push(s))
    expect(calls).toEqual([localeCookie("sv", { domain: ".brand.localhost", secure: true })])
    expect(calls[0]).toBe(
      "locale=sv; Path=/; Max-Age=31536000; SameSite=Lax; Domain=.brand.localhost; Secure"
    )
  })

  test("without a domain and over http: no Domain, no Secure", () => {
    const calls: string[] = []
    writeLocaleCookie("en", { secure: false }, (s) => calls.push(s))
    expect(calls).toEqual([localeCookie("en", { secure: false })])
    expect(calls[0]).toBe("locale=en; Path=/; Max-Age=31536000; SameSite=Lax")
  })
})

describe("chooseLocale", () => {
  test("by default: writes the cookie, never reloads, and the saved note is due", () => {
    const written: string[] = []
    let reloads = 0
    const note = chooseLocale(
      "sv",
      { secure: false },
      { write: (s) => written.push(s), reload: () => reloads++ }
    )
    expect(written).toEqual([localeCookie("sv", { secure: false })])
    expect(reloads).toBe(0)
    expect(note).toBe(true)
  })

  test("reloadOnChange: writes the cookie first, then reloads once, and shows no note", () => {
    const calls: string[] = []
    const note = chooseLocale(
      "en",
      { domain: ".brand.localhost", secure: true, reloadOnChange: true },
      { write: (s) => calls.push(`write ${s}`), reload: () => calls.push("reload") }
    )
    expect(calls).toEqual([
      `write ${localeCookie("en", { domain: ".brand.localhost", secure: true })}`,
      "reload",
    ])
    expect(note).toBe(false)
  })

  test("reloadOnChange renders the same placeholder on the server", () => {
    const html = renderToStaticMarkup(<StaticLocaleSwitcher options={options} reloadOnChange />)
    expect(html).toMatch(/^<div aria-hidden="true" inert="" class="invisible /)
  })
})
