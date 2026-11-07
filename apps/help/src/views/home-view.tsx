import { Card, Cards } from "@repo/ui/components/mdx"
import type { ReactNode } from "react"
import type { HelpArticle, HelpCategory } from "@/lib/help-core"

export type HomeViewProps = {
  categories: HelpCategory[]
  popular: HelpArticle[]
  /** The search control (the page passes `<Search />`): a slot, so the view holds no client
   * component or router. */
  search: ReactNode
}

/**
 * `/`: the help center's home page — a search field, "Popular articles" when any exist, and one
 * card per category with its article count.
 */
export function HomeView({ categories, popular, search }: HomeViewProps) {
  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-12 py-16">
      <header className="flex flex-col gap-6">
        <div className="flex flex-col gap-3">
          <h1 className="font-semibold text-4xl tracking-tight">Help and support</h1>
          <p className="text-lg text-muted-foreground">
            Search for an answer, or browse a category below.
          </p>
        </div>
        <div className="max-w-md">{search}</div>
      </header>

      {popular.length > 0 && (
        <section aria-labelledby="popular-articles" className="flex flex-col gap-6">
          <h2 id="popular-articles" className="font-semibold text-2xl tracking-tight">
            Popular articles
          </h2>
          <ul className="flex flex-col gap-3">
            {popular.map((article) => (
              <li key={article.path}>
                <a href={article.path} className="font-medium underline-offset-4 hover:underline">
                  {article.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="browse-categories" className="flex flex-col gap-6">
        <h2 id="browse-categories" className="font-semibold text-2xl tracking-tight">
          Browse by category
        </h2>
        <Cards>
          {categories.map((category) => (
            <Card key={category.slug} title={category.title} href={`/${category.slug}`}>
              {category.description} · {category.articles.length}{" "}
              {category.articles.length === 1 ? "article" : "articles"}
            </Card>
          ))}
        </Cards>
      </section>
    </main>
  )
}
