import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { ArrowLink } from "./arrow-link"

describe("ArrowLink", () => {
  test("links with its label as the accessible name, the arrow hidden", () => {
    const html = renderToStaticMarkup(<ArrowLink href="/kontakt" label="Boka ett samtal" />)
    expect(html).toMatch(/^<a href="\/kontakt" class="[^"]*arrow-link[^"]*">/)
    expect(html).toContain('<span aria-hidden="true"')
    expect(html).toMatch(/<\/span>Boka ett samtal<\/a>$/)
  })

  test("merges a className", () => {
    const html = renderToStaticMarkup(<ArrowLink href="/" label="Hem" className="mt-8" />)
    expect(html).toMatch(/^<a href="\/" class="[^"]*mt-8/)
  })
})
