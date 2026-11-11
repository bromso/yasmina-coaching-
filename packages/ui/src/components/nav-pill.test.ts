import { describe, expect, test } from "bun:test"
import { navPill } from "./nav-pill"

describe("navPill", () => {
  test("is the header's pill link: rounded-full, muted until hovered", () => {
    const link = navPill().split(" ")
    expect(link).toContain("rounded-full")
    expect(link).toContain("text-muted-foreground")
    expect(link).toContain("hover:bg-muted")
    expect(link).not.toContain("rounded-md")
  })

  test("the current item is filled and in the foreground colour", () => {
    const current = navPill({ current: true }).split(" ")
    expect(current).toContain("bg-muted")
    expect(current).toContain("text-foreground")
    expect(current).not.toContain("text-muted-foreground")
  })

  test("is not a flex box, so the space between a label and its count survives", () => {
    expect(
      navPill()
        .split(" ")
        .some((c) => c.endsWith("flex"))
    ).toBe(false)
  })

  test("merges a caller's className", () => {
    expect(navPill({ className: "tabular-nums" })).toContain("tabular-nums")
  })
})
