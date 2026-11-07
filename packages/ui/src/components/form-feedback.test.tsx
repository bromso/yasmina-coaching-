import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { FieldError, FormMessage, fieldAria, fieldErrors } from "./form-feedback"

describe("FormMessage", () => {
  test("an empty failure renders only the empty polite status region, and no alert", () => {
    const html = renderToStaticMarkup(<FormMessage state={{ ok: false }} />)
    expect(html).toMatch(/<div role="status" aria-live="polite"[^>]*><\/div>/)
    expect(html).not.toContain('role="alert"')
  })
  test("a success is announced inside the status region", () => {
    const html = renderToStaticMarkup(<FormMessage state={{ ok: true, message: "Saved" }} />)
    expect(html).toMatch(/role="status" aria-live="polite"[^>]*>.*Saved.*<\/div>/)
    expect(html).not.toContain('role="alert"')
  })
  test("an error is a destructive alert and the status region stays empty", () => {
    const html = renderToStaticMarkup(<FormMessage state={{ ok: false, message: "Nope" }} />)
    expect(html).toMatch(/role="alert"[^>]*>.*Nope/)
    expect(html).toMatch(/<div role="status" aria-live="polite"[^>]*><\/div>/)
  })
  test("a path-less validation issue is shown as the error", () => {
    const html = renderToStaticMarkup(
      <FormMessage state={{ ok: false, fieldErrors: { form: "Whole form" } }} />
    )
    expect(html).toMatch(/role="alert"[^>]*>.*Whole form/)
  })
})

describe("FieldError", () => {
  test("renders the field's message under the id name-error", () => {
    const html = renderToStaticMarkup(
      <FieldError name="email" state={{ ok: false, fieldErrors: { email: "Bad email" } }} />
    )
    expect(html).toContain('id="email-error"')
    expect(html).toContain("Bad email")
  })
  test("idPrefix disambiguates a second form's field of the same name on the same page", () => {
    const html = renderToStaticMarkup(
      <FieldError
        name="email"
        state={{ ok: false, fieldErrors: { email: "Bad email" } }}
        idPrefix="magic-"
      />
    )
    expect(html).toContain('id="magic-email-error"')
    expect(html).not.toContain('id="email-error"')
  })
})

describe("fieldAria", () => {
  test("valid: both attributes undefined; invalid: describedBy joined with the error id", () => {
    expect(fieldAria("email", { ok: false })).toEqual({
      "aria-invalid": undefined,
      "aria-describedby": undefined,
    })
    expect(
      fieldAria("password", { ok: false, fieldErrors: { password: "Too short" } }, "password-hint")
    ).toEqual({
      "aria-invalid": true,
      "aria-describedby": "password-hint password-error",
    })
  })
  test("idPrefix moves the error id it points at to match a prefixed FieldError", () => {
    expect(
      fieldAria("email", { ok: false, fieldErrors: { email: "Bad email" } }, undefined, {
        idPrefix: "magic-",
      })
    ).toEqual({
      "aria-invalid": true,
      "aria-describedby": "magic-email-error",
    })
  })
})

describe("fieldErrors", () => {
  test("keeps the first message per field and keys path-less issues as form", () => {
    expect(
      fieldErrors([
        { path: ["email"], message: "first" },
        { path: ["email"], message: "second" },
        { path: [], message: "whole form" },
      ])
    ).toEqual({ email: "first", form: "whole form" })
  })
})

describe("fieldErrors with a translator", () => {
  test("renders each kept issue through translate, still first per field", () => {
    const issues = [
      { path: ["email"], message: "first", code: "a" },
      { path: ["email"], message: "second", code: "b" },
      { path: [], message: "whole form", code: "c" },
    ]
    expect(fieldErrors(issues, (issue) => `t:${issue.code}`)).toEqual({
      email: "t:a",
      form: "t:c",
    })
  })
  test("without translate the message is used verbatim (unchanged behaviour)", () => {
    expect(fieldErrors([{ path: ["x"], message: "as is" }], undefined)).toEqual({ x: "as is" })
  })
})
