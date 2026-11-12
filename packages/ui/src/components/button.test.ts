import { expect, test } from "bun:test"
import { buttonVariants } from "./button"

test("the outline button draws its only boundary in --input, the 3:1 control border", () => {
  const outline = buttonVariants({ variant: "outline" }).split(" ")
  expect(outline).toContain("border-input")
  expect(outline).not.toContain("border-border")
})
