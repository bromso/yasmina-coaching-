import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Eyebrow } from "./eyebrow"

describe("Eyebrow", () => {
  test("renders its label as a small uppercase span", () => {
    const html = renderToStaticMarkup(<Eyebrow>Om mig</Eyebrow>)
    expect(html).toMatch(/^<span class="[^"]*uppercase[^"]*">Om mig<\/span>$/)
    expect(html).toContain("tracking-[0.18em]")
  })

  test("renders as the element a caller names, with its own props", () => {
    const html = renderToStaticMarkup(
      <Eyebrow as="h3" id="training">
        Utbildning
      </Eyebrow>
    )
    expect(html).toMatch(/^<h3 [^>]*>Utbildning<\/h3>$/)
    expect(html).toContain('id="training"')
    expect(html).toContain("tracking-[0.18em]")
    expect(renderToStaticMarkup(<Eyebrow as="dt">Pris</Eyebrow>)).toMatch(/^<dt /)
  })

  test("merges a className", () => {
    const html = renderToStaticMarkup(<Eyebrow className="text-foreground">Steg</Eyebrow>)
    expect(html).toContain("text-foreground")
    expect(html).not.toContain("text-muted-foreground")
  })
})
