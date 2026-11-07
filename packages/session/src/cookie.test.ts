import { describe, expect, test } from "bun:test"
import {
  ADMIN_SESSION_COOKIE,
  adminSessionCookieOptions,
  localeCookieOptions,
  readSessionCookie,
  SESSION_COOKIE,
  sessionCookieOptions,
} from "./cookie"

describe("sessionCookieOptions", () => {
  test("production: secure, parent domain, lax, 30 days", () => {
    expect(sessionCookieOptions({ domain: ".brand.com", production: true })).toEqual({
      name: SESSION_COOKIE,
      httpOnly: true,
      path: "/",
      sameSite: "lax",
      secure: true,
      domain: ".brand.com",
      maxAge: 30 * 24 * 3600,
    })
  })
  test("development differs only in secure", () => {
    const dev = sessionCookieOptions({ domain: ".brand.localhost", production: false })
    expect(dev.secure).toBe(false)
    expect({ ...dev, secure: true, domain: ".brand.com" }).toEqual(
      sessionCookieOptions({ domain: ".brand.com", production: true })
    )
  })
})

describe("readSessionCookie", () => {
  test("finds the session among other cookies", () => {
    expect(readSessionCookie("theme=dark; session=abc; lang=en")).toBe("abc")
  })
  test("keeps an = inside the value", () => {
    expect(readSessionCookie("session=a=b==")).toBe("a=b==")
  })
  test("a cookie that merely starts with the name is not the session", () => {
    expect(readSessionCookie("session2=abc")).toBeNull()
  })
  test("decodes a URL-encoded value", () => {
    expect(readSessionCookie("session=a%2Fb%3D")).toBe("a/b=")
  })
  test("a malformed escape reads as no session, not a thrown error", () => {
    expect(readSessionCookie("session=abc%E0%A4%A")).toBeNull()
  })
  test("the last duplicate wins, as in Next's cookies()", () => {
    expect(readSessionCookie("session=first; session=second")).toBe("second")
  })
  test("missing header or empty value is null", () => {
    expect(readSessionCookie(null)).toBeNull()
    expect(readSessionCookie("")).toBeNull()
    expect(readSessionCookie("session=")).toBeNull()
  })
})

test("admin_session is host-only, Path=/admin, an hour, Secure only in production", () => {
  expect(adminSessionCookieOptions({ production: true })).toEqual({
    name: ADMIN_SESSION_COOKIE,
    httpOnly: true,
    path: "/admin",
    sameSite: "lax",
    secure: true,
    maxAge: 3600,
  })
  expect(adminSessionCookieOptions({ production: false }).secure).toBe(false)
  expect(adminSessionCookieOptions({ production: false })).not.toHaveProperty("domain")
})

describe("localeCookieOptions", () => {
  test("Next's cookie options for @repo/i18n's localeCookie: one year, lax, not HttpOnly", () => {
    expect(localeCookieOptions("sv", { domain: ".brand.com", production: true })).toEqual({
      name: "locale",
      value: "sv",
      options: {
        path: "/",
        maxAge: 31_536_000,
        sameSite: "lax",
        domain: ".brand.com",
        secure: true,
        httpOnly: false,
      },
    })
  })

  test("outside production: not Secure", () => {
    expect(
      localeCookieOptions("en", { domain: ".brand.localhost", production: false }).options.secure
    ).toBe(false)
  })
})
