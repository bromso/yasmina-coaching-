import { expect, test } from "bun:test"
import { parseCursor } from "./pagination"

test("a positive integer is a cursor", () => {
  expect(parseCursor("42")).toBe(42)
})

test("anything else means the first page", () => {
  for (const value of [
    undefined,
    "",
    "abc",
    "0",
    "-3",
    "1.5",
    "1e3x",
    "99999999999999999999",
    ["4", "5"],
  ]) {
    expect(parseCursor(value)).toBeUndefined()
  }
})
