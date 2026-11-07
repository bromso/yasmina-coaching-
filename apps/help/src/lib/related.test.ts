import { describe, expect, test } from "bun:test"
import type { HelpArticle } from "./help-core"
import { relatedArticles } from "./related"

function helpArticle(category: string, slug: string, title: string, tags: string[]): HelpArticle {
  return {
    slug,
    category,
    path: `/${category}/${slug}`,
    title,
    description: "A short description",
    tags,
    popular: false,
    toc: [],
  }
}

describe("relatedArticles", () => {
  test("never includes the article itself", () => {
    const article = helpArticle("getting-started", "welcome", "Welcome", ["account"])
    expect(relatedArticles(article, [article])).toEqual([])
  })

  test("an article with no shared tag is left out", () => {
    const article = helpArticle("getting-started", "welcome", "Welcome", ["account"])
    const other = helpArticle("getting-started", "billing", "Billing", ["billing"])
    expect(relatedArticles(article, [article, other])).toEqual([])
  })

  test("same-category matches come before other-category matches", () => {
    const article = helpArticle("getting-started", "welcome", "Welcome", ["account", "security"])
    const sameCategory = helpArticle("getting-started", "invite", "Invite", ["account"])
    const otherCategory = helpArticle("account-security", "two-step", "Two-step", [
      "account",
      "security",
    ])
    expect(
      relatedArticles(article, [article, otherCategory, sameCategory]).map((a) => a.slug)
    ).toEqual(["invite", "two-step"])
  })

  test("within a group, more shared tags rank first; ties break by title", () => {
    const article = helpArticle("getting-started", "welcome", "Welcome", ["a", "b", "c"])
    const twoShared = helpArticle("getting-started", "two", "Two shared", ["a", "b"])
    const oneSharedZ = helpArticle("getting-started", "one-z", "Zeta", ["a"])
    const oneSharedA = helpArticle("getting-started", "one-a", "Alpha", ["a"])
    expect(
      relatedArticles(article, [article, oneSharedZ, twoShared, oneSharedA]).map((a) => a.slug)
    ).toEqual(["two", "one-a", "one-z"])
  })

  test("defaults to 3, and max can be overridden", () => {
    const article = helpArticle("getting-started", "welcome", "Welcome", ["account"])
    const candidates = ["a", "b", "c", "d"].map((slug) =>
      helpArticle("getting-started", slug, slug, ["account"])
    )
    expect(relatedArticles(article, [article, ...candidates])).toHaveLength(3)
    expect(relatedArticles(article, [article, ...candidates], 2)).toHaveLength(2)
  })
})
