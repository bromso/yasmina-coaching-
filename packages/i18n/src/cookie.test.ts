import { describe, expect, test } from "bun:test"
import {
  LOCALE_COOKIE,
  LOCALE_MAX_AGE,
  localeCookie,
  localeCookieAttributes,
  parseLocaleCookie,
} from "./cookie"

describe("parseLocaleCookie", () => {
  test("reads the locale cookie among others", () => {
    expect(parseLocaleCookie("foo=bar; locale=sv; baz=qux")).toBe("sv")
  })
  test("is tolerant of missing or empty headers", () => {
    expect(parseLocaleCookie(null)).toBeNull()
    expect(parseLocaleCookie(undefined)).toBeNull()
    expect(parseLocaleCookie("")).toBeNull()
  })
  test("an unsupported value is null, not thrown", () => {
    expect(parseLocaleCookie("locale=xx")).toBeNull()
  })
  test("no locale cookie at all is null", () => {
    expect(parseLocaleCookie("foo=bar; baz=qux")).toBeNull()
  })
  test("the first recognised value wins over a duplicate", () => {
    expect(parseLocaleCookie("locale=en; locale=sv")).toBe("en")
  })
})

describe("localeCookie", () => {
  test("Max-Age, SameSite=Lax, Path=/, no HttpOnly", () => {
    const cookie = localeCookie("sv", { secure: false })
    expect(cookie).toContain(`${LOCALE_COOKIE}=sv`)
    expect(cookie).toContain("Path=/")
    expect(cookie).toContain(`Max-Age=${LOCALE_MAX_AGE}`)
    expect(cookie).toContain("SameSite=Lax")
    expect(cookie).not.toContain("HttpOnly")
  })
  test("Domain only when given", () => {
    expect(localeCookie("en", { secure: false })).not.toContain("Domain=")
    expect(localeCookie("en", { domain: ".brand.localhost", secure: false })).toContain(
      "Domain=.brand.localhost"
    )
  })
  test("Secure only when secure", () => {
    expect(localeCookie("en", { secure: false })).not.toContain("Secure")
    expect(localeCookie("en", { secure: true })).toContain("Secure")
  })
})

describe("localeCookieAttributes", () => {
  test("the structured cookie both forms derive from", () => {
    expect(localeCookieAttributes("sv", { domain: ".brand.com", secure: true })).toEqual({
      name: LOCALE_COOKIE,
      value: "sv",
      maxAge: LOCALE_MAX_AGE,
      path: "/",
      sameSite: "lax",
      domain: ".brand.com",
      secure: true,
      httpOnly: false,
    })
    expect(localeCookieAttributes("en", { secure: false }).domain).toBeUndefined()
  })
})
