import { BRAND_NAME } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import {
  articlePage,
  article as findArticle,
  category as findCategory,
  type Page as HelpPage,
  help,
} from "@/lib/help"
import type { HelpArticle, HelpCategory } from "@/lib/help-core"
import { articleBreadcrumbs } from "@/lib/nav"
import { ogImageMetadata } from "@/lib/og"
import { relatedArticles } from "@/lib/related"
import { helpPageUrl } from "@/lib/sitemap"
import { ArticleView } from "@/views/article-view"

type Props = { params: Promise<{ category: string; article: string }> }

export const dynamicParams = false

/** Every article, `{ category, article }` matching its route's two segments. */
export function generateStaticParams(): { category: string; article: string }[] {
  return help.articles.map((candidate) => ({
    category: candidate.category,
    article: candidate.slug,
  }))
}

/** The article at `categorySlug`/`articleSlug` and its compiled page; anything else is not found. */
function load(
  categorySlug: string,
  articleSlug: string
): { category: HelpCategory; article: HelpArticle; page: HelpPage } {
  const category = findCategory(categorySlug)
  const article = category && findArticle(categorySlug, articleSlug)
  const page = article && articlePage(categorySlug, articleSlug)
  if (!category || !article || !page) notFound()
  return { category, article, page }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category: categorySlug, article: articleSlug } = await params
  const { article } = load(categorySlug, articleSlug)
  const url = helpPageUrl(article.path)
  const image = ogImageMetadata(article.category, article.slug, article.title, BRAND_NAME)
  return {
    title: article.title,
    description: article.description,
    alternates: { canonical: url },
    openGraph: {
      type: "article",
      url,
      title: article.title,
      description: article.description,
      images: [image],
      ...(article.updated && { modifiedTime: article.updated.toISOString() }),
    },
    twitter: {
      card: "summary_large_image",
      title: article.title,
      description: article.description,
      images: [image],
    },
  }
}

export default async function Page({ params }: Props) {
  const { category: categorySlug, article: articleSlug } = await params
  const { category, article, page } = load(categorySlug, articleSlug)
  return (
    <ArticleView
      title={article.title}
      description={article.description}
      Body={page.data.body}
      toc={page.data.toc}
      breadcrumbs={articleBreadcrumbs(category, article)}
      updated={article.updated}
      related={relatedArticles(article, help.articles)}
      fromPath={article.path}
    />
  )
}
