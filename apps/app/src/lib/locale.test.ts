import { describe, expect, test } from "bun:test"
import { localeReturnPath } from "./locale"

const APP = "http://app.brand.localhost:3001"

describe("localeReturnPath", () => {
  test("a same-origin referer comes back as its path and query", () => {
    expect(localeReturnPath(`${APP}/notes?cursor=x`, APP)).toBe("/notes?cursor=x")
  })
  test("no referer, another origin or garbage goes to /", () => {
    for (const referer of [
      null,
      "",
      "not a url",
      "https://evil.example/notes",
      "http://app.brand.localhost:3001.evil.example/notes",
      "http://app.brand.localhost:9999/notes",
    ]) {
      expect(localeReturnPath(referer, APP)).toBe("/")
    }
  })
  test("a failure adds locale_error=1; a success drops an earlier one", () => {
    expect(localeReturnPath(`${APP}/notes?cursor=a`, APP, { failed: true })).toBe(
      "/notes?cursor=a&locale_error=1"
    )
    expect(localeReturnPath(`${APP}/notes?locale_error=1&cursor=a`, APP)).toBe("/notes?cursor=a")
    expect(localeReturnPath(null, APP, { failed: true })).toBe("/?locale_error=1")
  })
  test("never a protocol-relative path", () => {
    expect(localeReturnPath(`${APP}//evil.example/x`, APP)).toBe("/")
  })
})
