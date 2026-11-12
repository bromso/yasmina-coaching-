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

  test("sits inline but takes its height from its padding: 32 px, or 36 px at md", () => {
    const sm = navPill().split(" ")
    expect(sm).toContain("inline-block")
    expect(sm).toContain("py-1.5")
    expect(navPill({ size: "md" }).split(" ")).toContain("py-2")
    expect(navPill({ size: "md" }).split(" ")).not.toContain("py-1.5")
  })

  test("the label is regular until current, and focus draws the shared ring", () => {
    expect(navPill().split(" ")).not.toContain("font-medium")
    expect(navPill({ current: true }).split(" ")).toContain("font-medium")
    for (const c of ["outline-none", "focus-visible:ring-[3px]", "focus-visible:ring-ring/50"]) {
      expect(navPill().split(" ")).toContain(c)
    }
  })

  test("merges a caller's className", () => {
    expect(navPill({ className: "tabular-nums" })).toContain("tabular-nums")
  })
})
