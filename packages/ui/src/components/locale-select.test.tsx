import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { LocaleSelect } from "./locale-select"

// Each language named in itself, as a caller passes LOCALE_NAMES from @repo/i18n.
const options = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
]
const action = async (_formData: FormData) => {}

describe("LocaleSelect, server render", () => {
  test("a form with a labelled <select name=locale> and a submit button (works without JS)", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect current="sv" options={options} action={action} />
    )
    expect(html).toMatch(/^<form[^>]*>/)
    const id = html.match(/<select[^>]* id="([^"]+)"/)?.[1]
    expect(id).toBeDefined()
    expect(html).toContain(`<label for="${id}"`)
    expect(html).toMatch(/<label[^>]*>Language<\/label>/)
    expect(html).toMatch(/<select[^>]* name="locale"/)
    expect(html).toMatch(/<button[^>]* type="submit"[^>]*>Change<\/button>/)
    expect(html).not.toMatch(/<button[^>]* hidden/)
    // No change handler on the select: arrow keys step through options one change at a time.
    expect(html).not.toContain("onchange")
  })

  test("every option, labelled in its own language, the current one selected", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect current="sv" options={options} action={action} />
    )
    expect(html).toContain('<option value="en" lang="en">English</option>')
    expect(html).toContain('<option value="sv" lang="sv" selected="">Svenska</option>')
  })

  test("the label and the button take their text as props", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect
        current="en"
        options={options}
        action={action}
        label="Språk"
        submitLabel="Byt"
      />
    )
    expect(html).toMatch(/<label[^>]*>Språk<\/label>/)
    expect(html).toMatch(/<button[^>]*>Byt<\/button>/)
  })

  test("with onChange instead of action: no form, the select and its own button", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect current="en" options={options} onChange={() => {}} submitLabel="Apply" />
    )
    expect(html).not.toContain("<form")
    expect(html).toMatch(/<select[^>]* name="locale"/)
    expect(html).toContain('<option value="en" lang="en" selected="">English</option>')
    expect(html).toMatch(/<button[^>]* type="button"[^>]*>Apply<\/button>/)
  })

  test("by default: nothing extra on the select, the button enabled", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect current="en" options={options} action={action} />
    )
    expect(html).not.toContain(' aria-invalid="')
    expect(html).not.toContain(' aria-describedby="')
    expect(html).not.toContain(' disabled="')
  })

  test("selectProps reach the select, so a form can tie it to its field error", () => {
    const html = renderToStaticMarkup(
      <LocaleSelect
        current="en"
        options={options}
        action={action}
        selectProps={{ "aria-invalid": true, "aria-describedby": "locale-error" }}
      />
    )
    expect(html).toMatch(/<select[^>]* aria-invalid="true"/)
    expect(html).toMatch(/<select[^>]* aria-describedby="locale-error"/)
  })

  test("pending disables the button, with a form or without", () => {
    const withForm = renderToStaticMarkup(
      <LocaleSelect current="en" options={options} action={action} pending />
    )
    expect(withForm).toMatch(/<button[^>]* type="submit"[^>]* disabled=""/)
    const withoutForm = renderToStaticMarkup(
      <LocaleSelect current="en" options={options} onChange={() => {}} pending />
    )
    expect(withoutForm).toMatch(/<button[^>]* type="button"[^>]* disabled=""/)
  })
})
