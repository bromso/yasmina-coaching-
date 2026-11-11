import { describe, expect, test } from "bun:test"
import { BRAND_NAME } from "@repo/sites/brand"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteFooter, SiteFooterLegal } from "./site-footer"

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

describe("SiteFooterLegal", () => {
  const links = [
    { label: "Terms", href: "https://www.example.com/terms" },
    { label: "Privacy", href: "https://www.example.com/privacy" },
    { label: "Contact", href: "https://www.example.com/kontakt" },
  ]
  /** The text a reader sees: tags and React's text-node comments dropped. */
  const text = (html: string) => html.replace(/<!-- -->/g, "").replace(/<[^>]+>/g, "")

  test("is www's copyright line: the year, the owner, then each link after a middle dot", () => {
    const html = renderToStaticMarkup(<SiteFooterLegal owner="Brand" year={2026} links={links} />)
    expect(text(html)).toBe("© 2026 Brand · Terms · Privacy · Contact")
    expect(html.startsWith('<p class="text-muted-foreground text-xs">')).toBe(true)
  })
  test("each link keeps its label and href, underlined like www's", () => {
    const html = renderToStaticMarkup(<SiteFooterLegal owner="Brand" year={2026} links={links} />)
    for (const link of links) {
      expect(html).toContain(
        `<a href="${link.href}" class="underline underline-offset-4 hover:text-foreground">${link.label}</a>`
      )
    }
  })
  test("defaults to this year and the brand name", () => {
    const html = renderToStaticMarkup(<SiteFooterLegal links={[]} />)
    expect(text(html)).toBe(`© ${new Date().getFullYear()} ${BRAND_NAME}`)
  })
  test("in SiteFooter's legal row, inside the one footer landmark", () => {
    const html = renderToStaticMarkup(
      <SiteFooter
        brand={<span>B</span>}
        groups={groups}
        legal={<SiteFooterLegal owner="Brand" year={2026} links={links} />}
      />
    )
    expect(html.match(/<footer/g)).toHaveLength(1)
    expect(html).toMatch(/data-slot="site-footer-legal"[^>]*><p class="text-muted-foreground/)
    expect(html.indexOf("Contact")).toBeLessThan(html.indexOf("</footer>"))
  })
})
