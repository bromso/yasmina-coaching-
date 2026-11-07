import type { DocsNavNode } from "@repo/ui/blocks/docs-sidebar"
import type { ReactNode } from "react"
import { DocsFrame } from "./docs-frame"

export type AllPagesSection = {
  /** The separator's or folder's title; none for the pages before the first separator. */
  title?: string
  pages: { href: string; title: string; description: string }[]
}

export type AllPagesViewProps = {
  nav: DocsNavNode[]
  sections: AllPagesSection[]
  /** The search control, passed through to the frame (the page passes `<Search />`). */
  search: ReactNode
}

function PageList({ pages }: { pages: AllPagesSection["pages"] }) {
  return (
    <ul className="flex flex-col gap-4">
      {pages.map((page) => (
        <li key={page.href} className="flex flex-col gap-1">
          <a href={page.href} className="font-medium underline-offset-4 hover:underline">
            {page.title}
          </a>
          <p className="text-muted-foreground text-sm">{page.description}</p>
        </li>
      ))}
    </ul>
  )
}

/**
 * `/all`: every docs page in sidebar order, grouped under its section, with its description — plain
 * links, the search control's no-JavaScript fallback.
 */
export function AllPagesView({ nav, sections, search }: AllPagesViewProps) {
  return (
    <DocsFrame nav={nav} currentHref="/all" search={search}>
      <div className="flex max-w-3xl flex-col gap-10">
        <header className="flex flex-col gap-3">
          <h1 className="font-semibold text-4xl tracking-tight">All pages</h1>
          <p className="text-lg text-muted-foreground">Every page of the docs, in sidebar order.</p>
        </header>
        {sections.map((section, index) =>
          section.title ? (
            <section
              key={section.pages[0]?.href}
              aria-labelledby={`section-${index}`}
              className="flex flex-col gap-4"
            >
              <h2 id={`section-${index}`} className="font-semibold text-2xl tracking-tight">
                {section.title}
              </h2>
              <PageList pages={section.pages} />
            </section>
          ) : (
            <PageList key={section.pages[0]?.href} pages={section.pages} />
          )
        )}
      </div>
    </DocsFrame>
  )
}
