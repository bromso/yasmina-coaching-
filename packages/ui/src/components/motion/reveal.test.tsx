import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Reveal, RevealItem, revealClass } from "./reveal"

describe("Reveal", () => {
  test("server HTML is static: plainly visible, no reveal class", () => {
    const html = renderToStaticMarkup(
      <Reveal as="section" id="om" className="grid" delay={120}>
        <p>Hej</p>
      </Reveal>
    )
    expect(html).toBe(
      '<section id="om" class="grid" style="--reveal-delay:120ms"><p>Hej</p></section>'
    )
  })

  test("a staggered group renders its items static too", () => {
    const html = renderToStaticMarkup(
      <Reveal as="ul" stagger={80}>
        <RevealItem as="li" index={0}>
          a
        </RevealItem>
        <RevealItem as="li" index={1} className="b">
          b
        </RevealItem>
      </Reveal>
    )
    expect(html).not.toContain("reveal")
    expect(html).not.toContain("--reveal-delay")
    expect(html).toMatch(/^<ul[^>]*><li[^>]*>a<\/li><li class="b">b<\/li><\/ul>$/)
  })

  test("revealClass maps the phases", () => {
    expect(revealClass("static")).toBe(false)
    expect(revealClass("hidden")).toBe("reveal reveal-hidden")
    expect(revealClass("shown")).toBe("reveal")
  })
})
