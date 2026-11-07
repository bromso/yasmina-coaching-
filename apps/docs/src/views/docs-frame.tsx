import { type DocsNavNode, DocsSidebar } from "@repo/ui/blocks/docs-sidebar"
import type { ReactNode } from "react"

export type DocsFrameProps = {
  /** The sidebar's nodes, in sidebar order. */
  nav: DocsNavNode[]
  /** The current page's URL, marked `aria-current` in the sidebar. */
  currentHref: string
  /** The search control above the content (the page passes `<Search />`): without JavaScript it
   * must work as a link to `/all`. A slot, so the views hold no client component or router. */
  search: ReactNode
  /** The main column: the page's own content. */
  children: ReactNode
  /** The right-hand column on large screens (the table of contents); omitted, there is none. */
  aside?: ReactNode
}

/**
 * Every docs page's frame, no JavaScript needed: the search control above the content, then on
 * large screens the sidebar (sticky, scrolling on its own), the page and, when given, an aside; on
 * narrow screens the sidebar sits above the page in a closed "Menu" disclosure.
 */
export function DocsFrame({ nav, currentHref, search, children, aside }: DocsFrameProps) {
  const sidebar = <DocsSidebar items={nav} currentHref={currentHref} />
  return (
    <div className="container flex flex-col gap-6 py-10">
      <div className="flex items-center gap-3">
        <div className="w-full lg:max-w-xs">{search}</div>
      </div>
      <details className="rounded-md border lg:hidden">
        <summary className="cursor-pointer px-3 py-2 font-medium text-sm">Menu</summary>
        <div className="border-t px-1 py-2">{sidebar}</div>
      </details>
      <div
        className={
          aside
            ? "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)_14rem] lg:gap-10"
            : "lg:grid lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10"
        }
      >
        {/* A plain column, not an <aside>: the sidebar's own <nav> is its landmark. */}
        <div className="hidden lg:block">
          <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto pr-2">
            {sidebar}
          </div>
        </div>
        <main id="main" className="min-w-0">
          {children}
        </main>
        {aside && (
          <aside data-docs="toc" className="hidden lg:block">
            <div className="sticky top-6 max-h-[calc(100dvh-3rem)] overflow-y-auto">{aside}</div>
          </aside>
        )}
      </div>
    </div>
  )
}
