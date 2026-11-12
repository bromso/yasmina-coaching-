import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DashedLine } from "./dashed-line"

describe("DashedLine", () => {
  test("is horizontal by default", () => {
    const html = renderToStaticMarkup(<DashedLine />)
    expect(html).toMatch(/^<div class="[^"]*h-px w-full/)
    expect(html).toContain("repeating-linear-gradient(90deg")
  })

  test("runs vertically on request, with a className", () => {
    const html = renderToStaticMarkup(<DashedLine orientation="vertical" className="mx-4" />)
    expect(html).toMatch(/^<div class="[^"]*h-full w-px[^"]*mx-4/)
    expect(html).toContain("repeating-linear-gradient(180deg")
  })
})
