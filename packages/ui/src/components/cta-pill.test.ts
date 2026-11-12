import { describe, expect, test } from "bun:test"
import { ctaPill } from "./cta-pill"

describe("ctaPill", () => {
  test("is the booking call to action: a filled, tracked pill with the shared focus ring", () => {
    const pill = ctaPill().split(" ")
    for (const c of [
      "inline-flex",
      "items-center",
      "rounded-full",
      "bg-primary",
      "text-primary-foreground",
      "hover:bg-primary/90",
      "tracking-[0.035em]",
      "focus-visible:ring-[3px]",
      "focus-visible:ring-ring/50",
    ]) {
      expect(pill).toContain(c)
    }
  })

  test("comes in the three sizes the sites use", () => {
    expect(ctaPill({ size: "sm" }).split(" ")).toEqual(
      expect.arrayContaining(["h-[30px]", "px-3.5", "text-xs"])
    )
    expect(ctaPill().split(" ")).toEqual(expect.arrayContaining(["h-9", "px-4"]))
    expect(ctaPill({ size: "lg" }).split(" ")).toEqual(expect.arrayContaining(["h-11", "px-5"]))
  })

  test("merges a caller's className", () => {
    expect(ctaPill({ className: "shrink-0" })).toContain("shrink-0")
  })
})
