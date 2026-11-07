import { describe, expect, test } from "bun:test"
import { fingerprint, firstFrame, normaliseMessage } from "./fingerprint"

describe("fingerprint", () => {
  test("normalises digits and hex runs so ids and addresses do not split a group", () => {
    expect(normaliseMessage("Note 42 not found (0x1f3a9c)")).toBe("Note # not found (#)")
    expect(normaliseMessage("Request 8f3c2a9b-11d4 failed after 1500ms")).toBe(
      "Request # failed after #ms"
    )
  })
  test("first frame strips the query string and column noise", () => {
    const stack =
      "Error: boom\n    at render (http://app.brand.localhost:3001/_next/static/chunks/app.js?v=12:10:5)\n    at other (x.js:1:1)"
    expect(firstFrame(stack)).toBe(
      "render (http://app.brand.localhost:3001/_next/static/chunks/app.js)"
    )
    expect(firstFrame(undefined)).toBe("")
  })
  test("is stable across runs and distinct across app, kind and message", () => {
    const a = fingerprint("app", "boundary", "Note 1 missing", "Error\n    at f (a.js:1:1)")
    expect(a).toBe(fingerprint("app", "boundary", "Note 2 missing", "Error\n    at f (a.js:9:9)"))
    expect(a).not.toBe(
      fingerprint("www", "boundary", "Note 1 missing", "Error\n    at f (a.js:1:1)")
    )
    expect(a).not.toBe(
      fingerprint("app", "unhandled", "Note 1 missing", "Error\n    at f (a.js:1:1)")
    )
    expect(a).toMatch(/^[0-9a-f]{64}$/)
  })
  test("a digest is part of the key: one generic message, two digests, two groups", () => {
    const generic = "An error occurred in the Server Components render."
    const a = fingerprint("app", "boundary", generic, undefined, "1234567")
    expect(a).not.toBe(fingerprint("app", "boundary", generic, undefined, "7654321"))
    expect(a).toBe(fingerprint("app", "boundary", generic, undefined, "1234567"))
  })
  test("content-hashed chunk names do not split a group across deploys", () => {
    const at = (chunk: string) => `Error: x\n    at render (/_next/static/chunks/${chunk}:1:1)`
    expect(fingerprint("app", "unhandled", "x", at("app-8f3c2a9b.js"))).toBe(
      fingerprint("app", "unhandled", "x", at("app-1a2b3c4d.js"))
    )
  })
})
