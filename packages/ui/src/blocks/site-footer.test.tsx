import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteFooter } from "./site-footer"

const groups = [
  {
    title: "Product",
    links: [
      { label: "App", href: "https://app.example.com" },
      { label: "Docs", href: "https://docs.example.com" },
    ],
  },
  { title: "Company", links: [{ label: "Jobs", href: "https://jobs.example.com" }] },
]

describe("SiteFooter", () => {
  test("is a footer landmark with a labelled nav of headed groups", () => {
    const html = renderToStaticMarkup(<SiteFooter brand={<span>Brand</span>} groups={groups} />)
    expect(html).toContain("<footer")
    expect(html).toContain('<nav aria-label="Footer"')
    expect(html).toMatch(/<h2[^>]*>Product<\/h2>/)
    expect(html).toMatch(/<h2[^>]*>Company<\/h2>/)
    expect(html).toContain('href="https://docs.example.com"')
    expect(html).toContain('href="https://jobs.example.com"')
  })
  test("renders the brand", () => {
    const html = renderToStaticMarkup(<SiteFooter brand={<span>Brand</span>} groups={[]} />)
    expect(html).toContain("<span>Brand</span>")
  })
  test("no empty Footer nav landmark when there are no groups", () => {
    const html = renderToStaticMarkup(<SiteFooter brand={<span>B</span>} groups={[]} />)
    expect(html).not.toContain("<nav")
  })
  test("renders legal in the bottom row only when given", () => {
    const withLegal = renderToStaticMarkup(
      <SiteFooter brand={<span>B</span>} groups={groups} legal={<p>© 2026 Brand</p>} />
    )
    expect(withLegal).toMatch(/data-slot="site-footer-legal"[^>]*><p>© 2026 Brand<\/p>/)
    const without = renderToStaticMarkup(<SiteFooter brand={<span>B</span>} groups={groups} />)
    expect(without).not.toContain('data-slot="site-footer-legal"')
  })
})
