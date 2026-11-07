import { Breadcrumbs } from "@repo/ui/blocks/breadcrumbs"
import { Card, Cards } from "@repo/ui/components/mdx"
import type { HelpCategory } from "@/lib/help-core"
import { categoryBreadcrumbs } from "@/lib/nav"

export type CategoryViewProps = {
  category: HelpCategory
}

/**
 * `/<category>`: breadcrumbs (Help › the category), the category's title and description, and its
 * articles — title and description, in `meta.json` order.
 */
export function CategoryView({ category }: CategoryViewProps) {
  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-10 py-16">
      <Breadcrumbs items={categoryBreadcrumbs(category)} />
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-4xl tracking-tight">{category.title}</h1>
        <p className="text-lg text-muted-foreground">{category.description}</p>
      </header>
      <Cards>
        {category.articles.map((article) => (
          <Card key={article.slug} title={article.title} href={article.path}>
            {article.description}
          </Card>
        ))}
      </Cards>
    </main>
  )
}
