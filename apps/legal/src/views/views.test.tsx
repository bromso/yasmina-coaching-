import { describe, expect, test } from "bun:test"
import { createLegal, type LegalDoc } from "@repo/content/legal"
import { LEGAL_PAGES, type LegalPageId, legalPath } from "@repo/sites/legal"
import type { mdxComponents } from "@repo/ui/components/mdx"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { UI } from "@/content/ui"
import { allInputs } from "@/lib/fixtures"
import { IndexView } from "./index-view"
import { LegalView, type LegalViewProps } from "./legal-view"

const legal = createLegal(allInputs(), LEGAL_PAGES, { rootLocale: "sv" })
const pages = Object.keys(LEGAL_PAGES) as LegalPageId[]

/** The compiled MDX as fumadocs hands it over: its `mark` (the placeholder plugin's output) and
 * `p` come from the components it is given. */
function Body({ components = {} }: { components?: typeof mdxComponents }) {
  const P = (components.p ?? "p") as ComponentType<{ children: ReactNode }>
  const Mark = (components.mark ?? "mark") as ComponentType<{ children: ReactNode }>
  return (
    <P>
      Org.nr <Mark>[ATT FYLLA: x]</Mark>.
    </P>
  )
}

function render(doc: LegalDoc, props: Partial<LegalViewProps> = {}): string {
  return renderToStaticMarkup(
    <LegalView
      doc={doc}
      Body={Body}
      toc={[
        { title: "Vem vi är", url: "#vem-vi-ar", depth: 2 },
        { title: "Kakor", url: "#kakor", depth: 3 },
        { title: "Dina rättigheter", url: "#dina-rattigheter", depth: 2 },
      ]}
      ui={UI[doc.locale]}
      draft
      {...props}
    />
  )
}

describe("LegalView", () => {
  const sv = legal.doc("privacy", "sv")

  test("a www:/ link in the body points at the marketing site's absolute URL", () => {
    function LinkBody({ components = {} }: { components?: typeof mdxComponents }) {
      const A = (components.a ?? "a") as ComponentType<{ href: string; children: ReactNode }>
      return (
        <p>
          <A href="www:/inifran">Priser</A> <A href="/integritet">Integritet</A>
        </p>
      )
    }
    const html = render(sv, { Body: LinkBody })
    expect(html).toContain('href="http://www.brand.localhost:3000/inifran"')
    expect(html).toContain('href="/integritet"')
    expect(html).not.toContain('href="www:')
  })

  test("the title as the page's h1, its last update and its change log", () => {
    const html = render(sv)
    expect(html).toContain(">privacy (sv)</h1>")
    expect(html).toMatch(
      /Senast uppdaterad[^<]*<time dateTime="2026-11-12"[^>]*>12 nov. 2026<\/time>/
    )
    // Its own id, which no body heading can take (the build gate refuses one that would).
    expect(html).toContain('<section aria-labelledby="andringslogg"')
    expect(html).toContain('<h2 id="andringslogg"')
    expect(html).toContain(">Ändringslogg</h2>")
    expect(html).toContain("Första utkastet.")
  })

  test("one table of contents: each h2/h3 of the body, then the change log, following the reader", () => {
    const html = render(sv)
    // One nav only: the contents list inline below lg is the same element as the right-hand
    // column from lg up, never a second copy.
    expect(html.match(/<nav /g)).toHaveLength(1)
    const toc = html.slice(html.indexOf('<div data-slot="toc-active"'), html.indexOf("</nav>"))
    expect(toc).toContain('<nav data-slot="toc" aria-label="Innehåll"')
    const hrefs = [...toc.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs).toEqual(["#vem-vi-ar", "#kakor", "#dina-rattigheter", "#andringslogg"])
    // The h3 nests under its h2.
    expect(toc).toMatch(/Vem vi är<\/a><ul class="[^"]*pl-4/)
    // Nothing in it animates (prefers-reduced-motion).
    expect(toc).not.toMatch(/transition|animate-/)
  })

  test("the contents sit inline on narrow screens and in a sticky column below the header from lg", () => {
    const html = render(sv)
    expect(html).toMatch(/class="[^"]*lg:grid-cols-\[minmax\(0,1fr\)_14rem\]/)
    const column = html.match(/<div class="([^"]*)"><div data-slot="toc-active"/)?.[1] ?? ""
    expect(column).toContain("lg:sticky")
    expect(column).toContain("lg:top-(--sticky-header-offset)")
    expect(column).toContain("lg:col-start-2")
    expect(column).not.toMatch(/(^|\s)(hidden|sticky)(\s|$)/)
  })

  test("shows the draft notice only while in draft", () => {
    expect(render(sv)).toContain('role="note"')
    expect(render(sv)).toContain("Utkast – granskas juridiskt")
    expect(render(sv, { draft: false })).not.toContain("Utkast – granskas juridiskt")
  })

  test("marks a placeholder", () => {
    expect(render(sv)).toMatch(/<mark data-placeholder=""[^>]*>\[ATT FYLLA: x\]<\/mark>/)
  })

  test("in English, the English words and notice", () => {
    const html = render(legal.doc("privacy", "en"))
    expect(html).toContain("Draft – under legal review")
    expect(html).toMatch(/Last updated[^<]*<time dateTime="2026-11-12"[^>]*>12 Nov 2026<\/time>/)
    expect(html).toContain('<h2 id="change-log"')
    expect(html).toContain(">Change log</h2>")
    expect(html).not.toContain("Senast uppdaterad")
  })
})

describe("IndexView", () => {
  test("four cards in the blog's look, each a heading link to its page with its last update", () => {
    const html = renderToStaticMarkup(<IndexView locale="sv" docs={legal.inLocale("sv")} draft />)
    const cards = html.split('<article data-slot="page-card"').slice(1)
    expect(cards).toHaveLength(4)
    const hrefs = cards.map((card) => card.match(/<h3 [^>]*><a href="([^"]+)"/)?.[1])
    expect(hrefs).toEqual(pages.map((page) => legalPath(page, "sv")))
    expect(hrefs).toEqual(["/integritet", "/villkor", "/tillganglighet", "/foretaget"])
    for (const card of cards) {
      expect(card).toMatch(
        /Senast uppdaterad <time dateTime="2026-11-12"[^>]*>12 nov. 2026<\/time>/
      )
      expect(card).toContain("rounded-3xl")
      expect(card).toContain("font-display")
    }
    expect(html).toContain(">privacy (sv)</a></h3>")
    expect(html).toContain('data-slot="card-description"')
  })

  test("in English, under /en", () => {
    const html = renderToStaticMarkup(<IndexView locale="en" docs={legal.inLocale("en")} draft />)
    const hrefs = [...html.matchAll(/<h3 [^>]*><a href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs).toEqual(pages.map((page) => legalPath(page, "en")))
    expect(html).toContain('Last updated <time dateTime="2026-11-12"')
  })

  test("the draft notice sits above the cards", () => {
    const html = renderToStaticMarkup(<IndexView locale="sv" docs={legal.inLocale("sv")} draft />)
    expect(html.indexOf('role="note"')).toBeGreaterThan(-1)
    expect(html.indexOf('role="note"')).toBeLessThan(html.indexOf('data-slot="page-card"'))
  })

  test("shows the draft notice in both languages only while in draft", () => {
    const sv = (draft: boolean) =>
      renderToStaticMarkup(<IndexView locale="sv" docs={legal.inLocale("sv")} draft={draft} />)
    const en = (draft: boolean) =>
      renderToStaticMarkup(<IndexView locale="en" docs={legal.inLocale("en")} draft={draft} />)
    expect(sv(true)).toMatch(/<div role="note"[^>]*>Utkast – granskas juridiskt<\/div>/)
    expect(en(true)).toMatch(/<div role="note"[^>]*>Draft – under legal review<\/div>/)
    expect(sv(false)).not.toContain('role="note"')
    expect(en(false)).not.toContain('role="note"')
  })
})
