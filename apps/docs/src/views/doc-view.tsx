import { Breadcrumbs, type BreadcrumbsItem } from "@repo/ui/blocks/breadcrumbs"
import type { DocsNavNode } from "@repo/ui/blocks/docs-sidebar"
import { PrevNext, type PrevNextProps } from "@repo/ui/blocks/prev-next"
import { Toc, type TocItem } from "@repo/ui/blocks/toc"
import { TocActive } from "@repo/ui/blocks/toc-active"
import { mdxComponents } from "@repo/ui/components/mdx"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import type { ComponentType, ReactNode } from "react"
import { DocsFrame } from "./docs-frame"

export type DocViewProps = {
  title: string
  description: string
  /** The compiled MDX body. */
  Body: ComponentType<{ components?: typeof mdxComponents }>
  toc: TocItem[]
  nav: DocsNavNode[]
  currentHref: string
  /** The search control, passed through to the frame (the page passes `<Search />`). */
  search: ReactNode
  breadcrumbs: BreadcrumbsItem[]
  neighbours: PrevNextProps
  /** The frontmatter's `updated`, shown as "Last updated". */
  updated?: Date
  /** "Edit on GitHub"'s target; omitted (no `CONTENT_REPO_URL`), there is no link. */
  editUrl?: string
}

/**
 * One docs page: breadcrumbs, title and description, the body, "Last updated" and "Edit on
 * GitHub" when known, and the previous and next pages, in the docs frame. A page with headings gets
 * a table of contents beside it on large screens; one without has no third column at all.
 */
export function DocView({
  title,
  description,
  Body,
  toc,
  nav,
  currentHref,
  search,
  breadcrumbs,
  neighbours,
  updated,
  editUrl,
}: DocViewProps) {
  const hasFooter = Boolean(updated || editUrl)
  return (
    <DocsFrame
      nav={nav}
      currentHref={currentHref}
      search={search}
      aside={
        toc.length > 0 ? (
          <TocActive>
            <Toc items={toc} />
          </TocActive>
        ) : undefined
      }
    >
      <article className="flex max-w-3xl flex-col gap-8">
        <header className="flex flex-col gap-3">
          <Breadcrumbs items={breadcrumbs} />
          <h1 className="font-semibold text-4xl tracking-tight">{title}</h1>
          <p className="text-lg text-muted-foreground">{description}</p>
        </header>
        {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
        <div className="flex flex-col gap-5">
          <Body components={mdxComponents} />
        </div>
        {hasFooter && (
          <footer className="flex flex-wrap items-center justify-between gap-3 text-muted-foreground text-sm">
            {updated && (
              <p>
                Last updated <time dateTime={toISODate(updated)}>{formatPostDate(updated)}</time>
              </p>
            )}
            {editUrl && (
              <a href={editUrl} className="underline underline-offset-4 hover:text-foreground">
                Edit on GitHub
              </a>
            )}
          </footer>
        )}
        <PrevNext {...neighbours} label="Docs pages" />
      </article>
    </DocsFrame>
  )
}
