import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Eyebrow } from "./eyebrow"

describe("Eyebrow", () => {
  test("renders its label as a small uppercase span", () => {
    const html = renderToStaticMarkup(<Eyebrow>Om mig</Eyebrow>)
    expect(html).toMatch(/^<span class="[^"]*uppercase[^"]*">Om mig<\/span>$/)
    expect(html).toContain("tracking-[0.18em]")
  })

  test("merges a className", () => {
    const html = renderToStaticMarkup(<Eyebrow className="text-foreground">Steg</Eyebrow>)
    expect(html).toContain("text-foreground")
    expect(html).not.toContain("text-muted-foreground")
  })
})
