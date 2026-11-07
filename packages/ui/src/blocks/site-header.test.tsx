import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteHeader } from "./site-header"

const links = [
  { label: "App", href: "https://app.example.com" },
  { label: "Docs", href: "https://docs.example.com", current: true },
]

describe("SiteHeader", () => {
  test("is a header landmark with a labelled site nav", () => {
    const html = renderToStaticMarkup(<SiteHeader brand={<a href="/">Brand</a>} links={links} />)
    expect(html).toContain("<header")
    expect(html).toContain('<nav aria-label="Site"')
    expect(html).toContain('href="https://app.example.com"')
  })
  test("the current app is text with aria-current, not a link", () => {
    const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
    expect(html).toMatch(/<span[^>]*aria-current="page"[^>]*>Docs<\/span>/)
    expect(html).not.toContain('href="https://docs.example.com"')
  })
  test("renders start and end slots and the sticky variant", () => {
    const html = renderToStaticMarkup(
      <SiteHeader
        brand={<span>B</span>}
        links={[]}
        start={<button type="button">menu</button>}
        end={<span>end</span>}
        sticky
      />
    )
    expect(html).toContain(">menu<")
    expect(html).toContain(">end<")
    expect(html).toMatch(/<header[^>]*class="[^"]*sticky/)
  })
  test("the hamburger is there only when there are links", () => {
    const withLinks = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
    expect(withLinks).toContain('aria-label="Open menu"')
    const without = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={[]} />)
    expect(without).not.toContain('aria-label="Open menu"')
  })
  test("no empty Site nav landmark when there are no links", () => {
    const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={[]} />)
    expect(html).not.toContain("<nav")
  })
  describe("narrow screens (WCAG 1.4.10 reflow at 320 px)", () => {
    const html = renderToStaticMarkup(
      <SiteHeader
        brand={<a href="/">Brand</a>}
        links={links}
        controls={
          <form action="/locale">
            <select name="locale" aria-label="Language" />
            <button type="submit">Change</button>
          </form>
        }
        end={<a href="/app">Open app</a>}
      />
    )
    const controls = html.match(/<div data-slot="site-header-controls" class="([^"]*)">/)
    test("controls get their own full-width row below sm, inline from sm up", () => {
      expect(controls).not.toBeNull()
      const classes = (controls?.[1] ?? "").split(" ")
      for (const c of ["order-last", "basis-full", "flex-wrap", "sm:order-none", "sm:basis-auto"]) {
        expect(classes).toContain(c)
      }
    })
    test("the header row wraps below sm and keeps its single h-14 row from sm up", () => {
      const row = (html.match(/<div class="(container [^"]*)">/)?.[1] ?? "").split(" ")
      for (const c of ["flex-wrap", "min-h-14", "sm:flex-nowrap", "sm:h-14"]) {
        expect(row).toContain(c)
      }
    })
    test("brand, then controls, then the primary action and hamburger: desktop order unchanged", () => {
      const brand = html.indexOf(">Brand<")
      const form = html.indexOf('<form action="/locale"')
      const primary = html.indexOf(">Open app<")
      const hamburger = html.indexOf('aria-label="Open menu"')
      expect(brand).toBeGreaterThan(-1)
      expect(brand).toBeLessThan(form)
      expect(form).toBeLessThan(primary)
      expect(primary).toBeLessThan(hamburger)
      // The primary action and the hamburger share the row-one group, outside the controls row.
      const group = html.slice(html.indexOf("</form></div>"))
      expect(group).toContain(">Open app<")
      expect(group).toContain('aria-label="Open menu"')
    })
    test("the locale form stays a real form in the page, never only inside the sheet", () => {
      expect(html).toContain('<form action="/locale"><select name="locale"')
    })
    test("no controls row when no controls are given", () => {
      const without = renderToStaticMarkup(
        <SiteHeader brand={<span>B</span>} links={links} end={<span>end</span>} />
      )
      expect(without).not.toContain("site-header-controls")
      expect(without).toContain(">end<")
    })
  })
})
