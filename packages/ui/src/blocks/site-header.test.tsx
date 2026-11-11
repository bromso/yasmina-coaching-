import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SiteHeader } from "./site-header"
import { SiteHeaderShell, siteHeaderBar } from "./site-header-shell"

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
    test("the bar's row wraps below sm and stays one row from sm up", () => {
      const row = (
        html.match(/<div data-slot="site-header-bar" class="([^"]*)">/)?.[1] ?? ""
      ).split(" ")
      for (const c of ["flex-wrap", "min-h-14", "sm:flex-nowrap"]) {
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

  describe("www's look: a floating pill inside the shell", () => {
    const classesOf = (html: string, re: RegExp) => (html.match(re)?.[1] ?? "").split(" ")
    test("the header is the shell: centred, padded off the edges, transparent", () => {
      const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
      const header = classesOf(html, /<header data-slot="site-header" class="([^"]*)"/)
      for (const c of ["flex", "justify-center", "px-2.5", "pt-2.5", "lg:px-4"]) {
        expect(header).toContain(c)
      }
      expect(header).not.toContain("border-b")
      expect(header).not.toContain("bg-background")
      expect(header).not.toContain("sticky")
    })
    test("the bar is www's rounded, translucent, hairline-ringed pill", () => {
      const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
      const bar = classesOf(html, /<div data-slot="site-header-bar" class="([^"]*)"/)
      for (const c of siteHeaderBar.split(" ")) expect(bar).toContain(c)
      for (const c of [
        "rounded-[18px]",
        "bg-background/85",
        "shadow-[0_0_0_1px_var(--border)]",
        "backdrop-blur-xl",
        "max-w-[1024px]",
        "py-3",
      ]) {
        expect(siteHeaderBar.split(" ")).toContain(c)
      }
    })
    test("the brand is set in the display face", () => {
      const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
      const brand = classesOf(html, /<div data-slot="site-header-brand" class="([^"]*)">/)
      for (const c of ["font-display", "text-xl", "leading-tight"]) expect(brand).toContain(c)
    })
    test("sticky pins the shell to the top, above the page", () => {
      const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={[]} sticky />)
      const header = classesOf(html, /<header data-slot="site-header" class="([^"]*)"/)
      for (const c of ["sticky", "top-0", "z-50"]) expect(header).toContain(c)
    })
    test("nav links are pills", () => {
      const html = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
      expect(html).toMatch(/<a href="https:\/\/app.example.com" class="[^"]*rounded-full/)
    })
  })
  describe("the nav slot: an app's own navigation", () => {
    const html = renderToStaticMarkup(
      <SiteHeader
        brand={<a href="/">Brand</a>}
        links={[]}
        nav={<a href="/inner">Inner</a>}
        controls={<button type="button">Theme</button>}
        end={<a href="/book">Book</a>}
        navLabel="Webbplats"
      />
    )
    test("the bar becomes the one labelled nav landmark holding everything", () => {
      expect(html.match(/<nav/g)).toHaveLength(1)
      const nav = html.slice(html.indexOf('<nav aria-label="Webbplats"'), html.indexOf("</nav>"))
      expect(nav).toContain('data-slot="site-header-bar"')
      for (const text of [">Brand<", ">Inner<", ">Theme<", ">Book<"]) expect(nav).toContain(text)
    })
    test("the slot sits after the brand and before the controls", () => {
      expect(html.indexOf(">Brand<")).toBeLessThan(html.indexOf(">Inner<"))
      expect(html.indexOf(">Inner<")).toBeLessThan(html.indexOf(">Theme<"))
    })
    test("cross-app links next to it are a list in that landmark, not a second nav", () => {
      const both = renderToStaticMarkup(
        <SiteHeader brand={<span>B</span>} links={links} nav={<span>own</span>} />
      )
      expect(both.match(/<nav/g)).toHaveLength(1)
      expect(both).toContain('href="https://app.example.com"')
      expect(both).toContain(">own<")
    })
    test("without it the bar is no landmark and the links keep their own nav", () => {
      const without = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={links} />)
      expect(without).toMatch(/<div data-slot="site-header-bar"/)
      expect(without.match(/<nav/g)).toHaveLength(1)
    })
  })
  describe("SiteHeaderShell: the shell around a bar an app draws itself", () => {
    test("renders the same header as SiteHeader, around its children", () => {
      const shell = renderToStaticMarkup(
        <SiteHeaderShell sticky>
          <nav aria-label="Site" className={siteHeaderBar}>
            own
          </nav>
        </SiteHeaderShell>
      )
      const header = renderToStaticMarkup(<SiteHeader brand={<span>B</span>} links={[]} sticky />)
      const open = (html: string) => html.slice(0, html.indexOf(">") + 1)
      expect(open(shell)).toBe(open(header))
      expect(shell).toContain(">own</nav></header>")
    })
  })
})
