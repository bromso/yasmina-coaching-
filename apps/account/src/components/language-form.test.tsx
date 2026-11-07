import { describe, expect, mock, test } from "bun:test"
import { renderIn } from "@/test-intl"

// The form imports its server action, which reaches @repo/session (`server-only`).
mock.module("server-only", () => ({}))
const { LanguageFormFields } = await import("./language-form")

const options = [
  { value: "en", label: "English" },
  { value: "sv", label: "Svenska" },
]
const action = () => {}

describe("LanguageForm", () => {
  test("idle: the select is not invalid, the button is enabled", () => {
    const html = renderIn(
      "en",
      <LanguageFormFields
        current="en"
        options={options}
        state={{ ok: false }}
        action={action}
        pending={false}
      />
    )
    expect(html).not.toContain(' aria-invalid="')
    expect(html).not.toMatch(/<button[^>]* disabled=""/)
    expect(html).toMatch(/<button[^>]*>Save language<\/button>/)
  })

  test("a refusal marks the select invalid and points it at the field error", () => {
    const html = renderIn(
      "sv",
      <LanguageFormFields
        current="sv"
        options={options}
        state={{ ok: false, fieldErrors: { locale: "Välj ett av språken i listan." } }}
        action={action}
        pending={false}
      />
    )
    expect(html).toMatch(/<select[^>]* aria-invalid="true"/)
    expect(html).toMatch(/<select[^>]* aria-describedby="language-locale-error"/)
    expect(html).toContain('<p id="language-locale-error"')
    expect(html).toContain("Välj ett av språken i listan.")
  })

  test("pending disables the button", () => {
    const html = renderIn(
      "en",
      <LanguageFormFields
        current="en"
        options={options}
        state={{ ok: false }}
        action={action}
        pending
      />
    )
    expect(html).toMatch(/<button[^>]* type="submit"[^>]* disabled=""/)
  })
})
