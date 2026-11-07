import type { HelpArticle } from "./help-core"

/**
 * Up to `max` (default 3) other articles related to `article` by shared tags: articles in its own
 * category first, then articles in other categories, each group ordered by most shared tags
 * (ties broken by title, for a stable order); an article with no shared tag is left out; `article`
 * itself never appears.
 */
export function relatedArticles(article: HelpArticle, all: HelpArticle[], max = 3): HelpArticle[] {
  const tags = new Set(article.tags)
  const isSelf = (candidate: HelpArticle) =>
    candidate.category === article.category && candidate.slug === article.slug

  const scored = all
    .filter((candidate) => !isSelf(candidate))
    .map((candidate) => ({
      candidate,
      shared: candidate.tags.filter((tag) => tags.has(tag)).length,
    }))
    .filter(({ shared }) => shared > 0)

  const bySharedThenTitle = (
    a: { candidate: HelpArticle; shared: number },
    b: { candidate: HelpArticle; shared: number }
  ) => b.shared - a.shared || a.candidate.title.localeCompare(b.candidate.title)

  const sameCategory = scored
    .filter(({ candidate }) => candidate.category === article.category)
    .sort(bySharedThenTitle)
  const otherCategories = scored
    .filter(({ candidate }) => candidate.category !== article.category)
    .sort(bySharedThenTitle)

  return [...sameCategory, ...otherCategories].slice(0, max).map(({ candidate }) => candidate)
}
