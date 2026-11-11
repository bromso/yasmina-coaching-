import { describe, expect, test } from "bun:test"
import { LOCALE_FLAGS, LOCALES } from "@repo/i18n/locales"
import { circleFlagsBundle } from "@repo/ui/lib/icon-bundle"
import { renderToStaticMarkup } from "react-dom/server"
import { LocaleSwitcher } from "./locale-switcher"

// Each language named in itself, as a caller passes LOCALE_NAMES from @repo/i18n.
const options = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
]
const action = async (_formData: FormData) => {}

describe("LocaleSwitcher, server render (and so without JavaScript)", () => {
  test("with action: a form around a <details> disclosure, every language a submit button", () => {
    const html = renderToStaticMarkup(
      <LocaleSwitcher current="sv" options={options} action={action} />
    )
    expect(html).toMatch(/^<form[^>]*><details/)
    expect(html).toContain("<summary")
    const buttons = html.match(/<button[^>]*>/g) ?? []
    expect(buttons).toHaveLength(2)
    for (const button of buttons) {
      expect(button).toContain('type="submit"')
      expect(button).toContain('name="locale"')
    }
    expect(buttons[0]).toContain('value="en" lang="en"')
    expect(buttons[1]).toContain('value="sv" lang="sv" aria-current="true"')
    expect(html).toContain("<span>English</span></button>")
    // No select, no separate "Change" button: choosing a language is the submit.
    expect(html).not.toContain("<select")
    expect(html).not.toContain("onchange")
  })

  test("the summary names the control and shows the current language, flag decorative", () => {
    const html = renderToStaticMarkup(
      <LocaleSwitcher current="sv" options={options} action={action} label="Språk" />
    )
    const summary = html.match(/<summary[^>]*>(.*?)<\/summary>/)?.[1] ?? ""
    expect(summary).toContain('<span class="sr-only">Språk: </span>')
    expect(summary).toContain('<span lang="sv">Svenska</span>')
    // Rendered server-side from the offline bundle: an inline <svg>, never a network fetch.
    expect(summary).toMatch(/<svg[^>]*aria-hidden="true"/)
    expect(summary).not.toContain("English")
  })

  test("only the current language carries aria-current and the check mark", () => {
    const html = renderToStaticMarkup(
      <LocaleSwitcher current="en" options={options} action={action} />
    )
    expect(html.match(/aria-current="true"/g)).toHaveLength(1)
    expect(html).toMatch(/value="en" lang="en" aria-current="true"/)
    expect(html).not.toMatch(/value="sv" lang="sv" aria-current/)
  })

  test("the label defaults to English", () => {
    const html = renderToStaticMarkup(
      <LocaleSwitcher current="en" options={options} action={action} />
    )
    expect(html).toContain('<span class="sr-only">Language: </span>')
  })

  test("with onChange instead of action: no form, plain buttons, no locale field", () => {
    const html = renderToStaticMarkup(
      <LocaleSwitcher current="en" options={options} onChange={() => {}} />
    )
    expect(html).not.toContain("<form")
    expect(html).toMatch(/<button type="button" lang="en"/)
    expect(html).not.toContain('name="locale"')
  })

  test("an option's own flag wins over the default map", () => {
    const withFlag = renderToStaticMarkup(
      <LocaleSwitcher
        current="en"
        options={[{ value: "en", label: "English", flag: "circle-flags:se" }]}
        action={action}
      />
    )
    const byDefault = renderToStaticMarkup(
      <LocaleSwitcher current="en" options={[{ value: "en", label: "English" }]} action={action} />
    )
    expect(withFlag).not.toBe(byDefault)
  })
})

describe("flags", () => {
  test("every locale has a circle-flags flag, and every one is in the offline bundle", () => {
    for (const locale of LOCALES) {
      const flag = LOCALE_FLAGS[locale]
      expect(flag).toStartWith("circle-flags:")
      expect(Object.keys(circleFlagsBundle.icons)).toContain(flag.slice("circle-flags:".length))
    }
    expect(LOCALE_FLAGS).toEqual({ en: "circle-flags:gb", sv: "circle-flags:se" })
  })

  test("no bundled flag carries an id (Iconify would renumber it: a hydration mismatch)", () => {
    for (const icon of Object.values(circleFlagsBundle.icons)) {
      expect(icon.body).not.toMatch(/\sid="/)
      expect(icon.body).not.toContain("url(#")
    }
  })
})
