import { describe, expect, test } from "bun:test"
import { initialsOf } from "./initials"

describe("initialsOf", () => {
  test("two words, one word, none", () => {
    expect(initialsOf({ name: "Ada Lovelace", email: "ada@example.com" })).toBe("AL")
    expect(initialsOf({ name: "ada", email: "ada@example.com" })).toBe("A")
    expect(initialsOf({ name: "", email: "zoe@example.com" })).toBe("Z")
  })
  test("an astral first letter is kept whole", () => {
    const initials = initialsOf({ name: "𝔄da Lovelace", email: "ada@example.com" })
    expect(initials.startsWith("𝔄")).toBe(true)
    expect(initials).toBe("𝔄L")
  })
})
