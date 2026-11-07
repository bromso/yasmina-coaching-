import { describe, expect, test } from "bun:test"
import { localeReturnPath } from "./locale"

const AUTH = "http://auth.brand.localhost:3002"

describe("localeReturnPath", () => {
  test("a same-origin referer comes back as its path and query", () => {
    expect(localeReturnPath(`${AUTH}/signup?next=x`, AUTH)).toBe("/signup?next=x")
  })
  test("no referer, another origin or garbage goes to /", () => {
    for (const referer of [
      null,
      "",
      "not a url",
      "https://evil.example/login",
      "http://auth.brand.localhost:3002.evil.example/login",
      "http://auth.brand.localhost:9999/login",
    ]) {
      expect(localeReturnPath(referer, AUTH)).toBe("/")
    }
  })
  test("a failure adds locale_error=1; a success drops an earlier one", () => {
    expect(localeReturnPath(`${AUTH}/login?next=a`, AUTH, { failed: true })).toBe(
      "/login?next=a&locale_error=1"
    )
    expect(localeReturnPath(`${AUTH}/login?locale_error=1&next=a`, AUTH)).toBe("/login?next=a")
    expect(localeReturnPath(null, AUTH, { failed: true })).toBe("/?locale_error=1")
  })
  test("never a protocol-relative path", () => {
    expect(localeReturnPath(`${AUTH}//evil.example/x`, AUTH)).toBe("/")
  })
})
