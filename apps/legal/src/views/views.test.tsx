import { describe, expect, test } from "bun:test"
import { createLegal, type LegalDoc } from "@repo/content/legal"
import { LEGAL_PAGES } from "@repo/sites/legal"
import type { mdxComponents } from "@repo/ui/components/mdx"
import type { ComponentType, ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { UI } from "@/content/ui"
import { allInputs } from "@/lib/fixtures"
import { IndexView } from "./index-view"
import { LegalView, type LegalViewProps } from "./legal-view"

const legal = createLegal(allInputs(), LEGAL_PAGES, { rootLocale: "sv" })

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
      toc={[{ title: "Vem vi är", url: "#vem-vi-ar", depth: 2 }]}
      ui={UI[doc.locale]}
      draft
      {...props}
    />
  )
}

describe("LegalView", () => {
  const sv = legal.doc("privacy", "sv")

  test("the title as the page's h1, its last update and its change log", () => {
    const html = render(sv)
    expect(html).toContain(">privacy (sv)</h1>")
    expect(html).toMatch(
      /Senast uppdaterad[^<]*<time dateTime="2026-11-12"[^>]*>12 nov. 2026<\/time>/
    )
    expect(html).toContain('<h2 id="changes"')
    expect(html).toContain(">Ändringar</h2>")
    expect(html).toContain("Första utkastet.")
  })

  test("lists the body's headings and the change log as its contents", () => {
    const html = render(sv)
    expect(html).toContain('aria-label="Innehåll"')
    expect(html).toContain('href="#vem-vi-ar"')
    expect(html).toContain('href="#changes"')
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
    expect(html).toContain(">Changes</h2>")
    expect(html).not.toContain("Senast uppdaterad")
  })
})

describe("IndexView", () => {
  test("links all four pages with their last update, in LEGAL_PAGES order", () => {
    const html = renderToStaticMarkup(<IndexView locale="sv" docs={legal.inLocale("sv")} draft />)
    const hrefs = [...html.matchAll(/<a href="([^"]+)"/g)].map((match) => match[1])
    expect(hrefs).toEqual(["/integritet", "/villkor", "/tillganglighet", "/foretaget"])
    expect(html.match(/<time dateTime="2026-11-12"[^>]*>12 nov. 2026<\/time>/g)).toHaveLength(4)
    expect(html).toContain(">privacy (sv)</a>")
  })

  test("in English, under /en", () => {
    const html = renderToStaticMarkup(<IndexView locale="en" docs={legal.inLocale("en")} draft />)
    expect(html).toContain('<a href="/en/privacy"')
    expect(html).toContain("Last updated")
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
