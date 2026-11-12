import { describe, expect, test } from "bun:test"
import { localeFromCookie } from "./site-locale"

describe("localeFromCookie", () => {
  test("English only when the cookie says so; anything else is Swedish", () => {
    expect(localeFromCookie("en")).toBe("en")
    expect(localeFromCookie("sv")).toBe("sv")
    expect(localeFromCookie(undefined)).toBe("sv")
    expect(localeFromCookie("de")).toBe("sv")
    expect(localeFromCookie("en-US")).toBe("sv")
  })
})
