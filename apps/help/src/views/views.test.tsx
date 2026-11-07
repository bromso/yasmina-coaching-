import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { HelpArticle, HelpCategory } from "@/lib/help-core"
import { AllView } from "./all-view"
import { ArticleView, type ArticleViewProps } from "./article-view"
import { CategoryView } from "./category-view"
import { ContactView } from "./contact-view"
import { HomeView } from "./home-view"

function helpArticle(overrides: Partial<HelpArticle> = {}): HelpArticle {
  return {
    slug: "welcome",
    category: "getting-started",
    path: "/getting-started/welcome",
    title: "Welcome",
    description: "A short description.",
    tags: [],
    popular: false,
    toc: [],
    ...overrides,
  }
}

function helpCategory(overrides: Partial<HelpCategory> = {}): HelpCategory {
  return {
    slug: "getting-started",
    title: "Getting started",
    description: "Create an account and invite your team.",
    articles: [helpArticle()],
    ...overrides,
  }
}

const search = <a href="/all">Search help</a>

describe("HomeView", () => {
  test("shows popular articles and one card per category, with its article count", () => {
    const categories = [
      helpCategory({
        slug: "getting-started",
        title: "Getting started",
        description: "Start here.",
        articles: [
          helpArticle(),
          helpArticle({
            slug: "invite",
            path: "/getting-started/invite",
            title: "Invite your team",
          }),
        ],
      }),
      helpCategory({
        slug: "troubleshooting",
        title: "Troubleshooting",
        description: "Fix things.",
        articles: [helpArticle({ slug: "x", path: "/troubleshooting/x", title: "X" })],
      }),
    ]
    const popular = [
      helpArticle({
        title: "Create an account",
        path: "/getting-started/create-an-account",
        popular: true,
      }),
    ]
    const html = renderToStaticMarkup(
      <HomeView categories={categories} popular={popular} search={search} />
    )
    expect(html).toContain("Popular articles</h2>")
    expect(html).toContain('href="/getting-started/create-an-account"')
    expect(html).toContain("Create an account</a>")
    expect(html).toContain('href="/getting-started"')
    expect(html).toContain("2 articles")
    expect(html).toContain('href="/troubleshooting"')
    expect(html).toContain("1 article")
    expect(html).not.toContain("1 articles")
  })

  test("no popular articles: no Popular articles section", () => {
    const html = renderToStaticMarkup(
      <HomeView categories={[helpCategory()]} popular={[]} search={search} />
    )
    expect(html).not.toContain("Popular articles")
  })
})

describe("CategoryView", () => {
  test("breadcrumbs, title, description and its articles, in order", () => {
    const category = helpCategory({
      articles: [
        helpArticle({
          slug: "b",
          path: "/getting-started/b",
          title: "B",
          description: "Second.",
        }),
        helpArticle({
          slug: "a",
          path: "/getting-started/a",
          title: "A",
          description: "First.",
        }),
      ],
    })
    const html = renderToStaticMarkup(<CategoryView category={category} />)
    expect(html).toContain('aria-label="breadcrumb"')
    expect(html).toContain("Getting started</h1>")
    expect(html).toContain(category.description)
    expect(html.indexOf('href="/getting-started/b"')).toBeLessThan(
      html.indexOf('href="/getting-started/a"')
    )
  })
})

function Body() {
  return <p>The body.</p>
}

function articleProps(overrides: Partial<ArticleViewProps> = {}): ArticleViewProps {
  return {
    title: "Create an account",
    description: "Sign up and verify your email.",
    Body,
    toc: [],
    breadcrumbs: [
      { title: "Help", href: "/" },
      { title: "Getting started", href: "/getting-started" },
      { title: "Create an account", href: "/getting-started/create-an-account" },
    ],
    related: [],
    fromPath: "/getting-started/create-an-account",
    ...overrides,
  }
}

describe("ArticleView", () => {
  test("breadcrumbs, the body and a contact link carrying `from`", () => {
    const html = renderToStaticMarkup(<ArticleView {...articleProps()} />)
    expect(html).toContain('aria-label="breadcrumb"')
    expect(html).toContain("Create an account</h1>")
    expect(html).toContain("<p>The body.</p>")
    expect(html).toContain(
      `href="/contact?from=${encodeURIComponent("/getting-started/create-an-account")}"`
    )
    expect(html).toContain("Contact us")
  })

  test("related articles, same-category and other matches alike", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        {...articleProps({
          related: [
            helpArticle({
              slug: "invite",
              path: "/getting-started/invite",
              title: "Invite your team",
              description: "Send one.",
            }),
          ],
        })}
      />
    )
    expect(html).toContain("Related articles</h2>")
    expect(html).toContain('href="/getting-started/invite"')
    expect(html).toContain("Invite your team")
  })

  test("no related articles: no Related articles section", () => {
    const html = renderToStaticMarkup(<ArticleView {...articleProps()} />)
    expect(html).not.toContain("Related articles")
  })

  test("fewer than two ## headings: no table of contents", () => {
    const html = renderToStaticMarkup(
      <ArticleView {...articleProps({ toc: [{ title: "One", url: "#one", depth: 2 }] })} />
    )
    expect(html).not.toContain('data-slot="toc"')
  })

  test("two or more ## headings: a table of contents", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        {...articleProps({
          toc: [
            { title: "One", url: "#one", depth: 2 },
            { title: "Two", url: "#two", depth: 2 },
          ],
        })}
      />
    )
    expect(html).toContain('data-slot="toc"')
    expect(html).toContain('href="#one"')
  })

  test("a third-level heading alone does not count towards the ## threshold", () => {
    const html = renderToStaticMarkup(
      <ArticleView
        {...articleProps({
          toc: [
            { title: "One", url: "#one", depth: 2 },
            { title: "Sub", url: "#sub", depth: 3 },
          ],
        })}
      />
    )
    expect(html).not.toContain('data-slot="toc"')
  })

  test("Last updated only when `updated` is set", () => {
    expect(renderToStaticMarkup(<ArticleView {...articleProps()} />)).not.toContain("Last updated")
    const html = renderToStaticMarkup(
      <ArticleView {...articleProps({ updated: new Date("2026-10-01T12:00:00Z") })} />
    )
    expect(html).toContain("Last updated")
  })
})

describe("ContactView", () => {
  test("a heading and the given form slot — no client component or router of its own", () => {
    const form = <p>Contact form stub</p>
    const html = renderToStaticMarkup(<ContactView form={form} />)
    expect(html).toContain("Contact support</h1>")
    expect(html).toContain("<p>Contact form stub</p>")
  })
})

describe("AllView", () => {
  test("every article grouped under its category, in meta.json order", () => {
    const categories = [
      helpCategory({
        slug: "getting-started",
        title: "Getting started",
        articles: [
          helpArticle({
            slug: "a",
            path: "/getting-started/a",
            title: "A",
            description: "First.",
          }),
        ],
      }),
      helpCategory({
        slug: "troubleshooting",
        title: "Troubleshooting",
        articles: [
          helpArticle({
            slug: "b",
            path: "/troubleshooting/b",
            title: "B",
            description: "Second.",
          }),
        ],
      }),
    ]
    const html = renderToStaticMarkup(<AllView categories={categories} />)
    expect(html).toContain("Getting started</h2>")
    expect(html).toContain("Troubleshooting</h2>")
    expect(html.indexOf("Getting started</h2>")).toBeLessThan(html.indexOf("Troubleshooting</h2>"))
    expect(html).toContain('href="/getting-started/a"')
    expect(html).toContain('href="/troubleshooting/b"')
  })
})
