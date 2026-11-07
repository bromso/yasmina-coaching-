import type { HelpCategory } from "@/lib/help-core"

export type AllViewProps = {
  categories: HelpCategory[]
}

/**
 * `/all`: every help article, grouped under its category in `meta.json` order — plain links, the
 * search dialog's no-JavaScript fallback.
 */
export function AllView({ categories }: AllViewProps) {
  return (
    <main id="main" className="container flex max-w-3xl flex-col gap-10 py-16">
      <header className="flex flex-col gap-3">
        <h1 className="font-semibold text-4xl tracking-tight">All articles</h1>
        <p className="text-lg text-muted-foreground">Every help article, by category.</p>
      </header>
      {categories.map((category) => (
        <section
          key={category.slug}
          aria-labelledby={`category-${category.slug}`}
          className="flex flex-col gap-4"
        >
          <h2 id={`category-${category.slug}`} className="font-semibold text-2xl tracking-tight">
            {category.title}
          </h2>
          <ul className="flex flex-col gap-4">
            {category.articles.map((article) => (
              <li key={article.slug} className="flex flex-col gap-1">
                <a href={article.path} className="font-medium underline-offset-4 hover:underline">
                  {article.title}
                </a>
                <p className="text-muted-foreground text-sm">{article.description}</p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  )
}
