import { Breadcrumbs, type BreadcrumbsItem } from "@repo/ui/blocks/breadcrumbs"
import { Toc, type TocItem } from "@repo/ui/blocks/toc"
import { TocActive } from "@repo/ui/blocks/toc-active"
import { Card, Cards, mdxComponents } from "@repo/ui/components/mdx"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import { cn } from "@repo/ui/lib/utils"
import type { ComponentType } from "react"
import type { HelpArticle } from "@/lib/help-core"

export type ArticleViewProps = {
  title: string
  description: string
  /** The compiled MDX body. */
  Body: ComponentType<{ components?: typeof mdxComponents }>
  toc: TocItem[]
  breadcrumbs: BreadcrumbsItem[]
  /** The frontmatter's `updated`, shown as "Last updated". */
  updated?: Date
  related: HelpArticle[]
  /** The current article's own path, carried as `/contact?from=<fromPath>`. */
  fromPath: string
}

/** A table of contents shows only once an article has at least two `##` (depth 2) headings — a
 * single heading isn't worth a sidebar of its own. */
function hasToc(toc: TocItem[]): boolean {
  return toc.filter((item) => item.depth === 2).length >= 2
}

/**
 * `/<category>/<article>`: breadcrumbs, the article body, "Last updated" when set, up to three
 * related articles and a link to contact support about this page. An article with two or more
 * `##` headings gets a table of contents beside it on large screens; one without is a single
 * column with no aside at all.
 */
export function ArticleView({
  title,
  description,
  Body,
  toc,
  breadcrumbs,
  updated,
  related,
  fromPath,
}: ArticleViewProps) {
  const showToc = hasToc(toc)

  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-12 py-16">
      <div className={cn(showToc && "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12")}>
        <article className="flex min-w-0 max-w-3xl flex-col gap-8">
          <header className="flex flex-col gap-3">
            <Breadcrumbs items={breadcrumbs} />
            <h1 className="font-semibold text-4xl tracking-tight">{title}</h1>
            <p className="text-lg text-muted-foreground">{description}</p>
          </header>
          {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
          <div className="flex flex-col gap-5">
            <Body components={mdxComponents} />
          </div>
          {updated && (
            <p className="text-muted-foreground text-sm">
              Last updated <time dateTime={toISODate(updated)}>{formatPostDate(updated)}</time>
            </p>
          )}
        </article>
        {showToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TocActive>
                <Toc items={toc} />
              </TocActive>
            </div>
          </aside>
        )}
      </div>

      {related.length > 0 && (
        <section aria-labelledby="related-articles" className="flex flex-col gap-6">
          <h2 id="related-articles" className="font-semibold text-2xl tracking-tight">
            Related articles
          </h2>
          <Cards>
            {related.map((article) => (
              <Card key={article.path} title={article.title} href={article.path}>
                {article.description}
              </Card>
            ))}
          </Cards>
        </section>
      )}

      <p className="border-t pt-6 text-muted-foreground text-sm">
        Still need help?{" "}
        <a
          href={`/contact?from=${encodeURIComponent(fromPath)}`}
          className="underline underline-offset-4 hover:text-foreground"
        >
          Contact us
        </a>
      </p>
    </main>
  )
}
