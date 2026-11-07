import { describe, expect, test } from "bun:test"
import { ContentError } from "@repo/content/posts"
import {
  assembleHelp,
  type HelpArticleInput,
  type HelpMetaInput,
  helpKnownPaths,
  metaFormatProblems,
  metaProblems,
  nestingProblems,
  orderedNames,
  reservedProblems,
} from "./help-core"

const ROOT_FILE = "apps/help/content/articles/meta.json"

describe("metaFormatProblems", () => {
  test("a meta.yaml or meta.yml anywhere under content/articles is refused", () => {
    expect(
      metaFormatProblems([
        "apps/help/content/articles/meta.json",
        "apps/help/content/articles/meta.yaml",
        "apps/help/content/articles/getting-started/meta.yml",
        "apps/help/content/articles/getting-started/welcome.mdx",
        "apps/help/content/articles/getting-started/not-meta.yaml",
      ])
    ).toEqual([
      "apps/help/content/articles/meta.yaml: use meta.json (meta.yaml is not checked)",
      "apps/help/content/articles/getting-started/meta.yml: use meta.json (meta.yaml is not checked)",
    ])
  })
})

describe("metaProblems", () => {
  const known = (dir: string, name: string) =>
    dir === "" ? name === "getting-started" : dir === "/getting-started" && name === "welcome"

  test("accepts a name that exists in its own folder", () => {
    expect(metaProblems([{ file: ROOT_FILE, dir: "", pages: ["getting-started"] }], known)).toEqual(
      []
    )
  })

  test("a meta.json without pages has nothing to check", () => {
    expect(metaProblems([{ file: ROOT_FILE, dir: "" }], known)).toEqual([])
  })

  test("reports a name matching neither a category nor an article, with its file", () => {
    expect(metaProblems([{ file: ROOT_FILE, dir: "", pages: ["nope"] }], known)).toEqual([
      `${ROOT_FILE}: "nope" in pages matches no category or article`,
    ])
  })

  test("names are looked up in their own meta.json's folder", () => {
    const file = "apps/help/content/articles/getting-started/meta.json"
    expect(
      metaProblems([{ file, dir: "/getting-started", pages: ["getting-started"] }], known)
    ).toEqual([`${file}: "getting-started" in pages matches no category or article`])
  })
})

describe("nestingProblems", () => {
  test("a two-segment article passes; shallower or deeper is reported", () => {
    expect(
      nestingProblems([
        { file: "a", slugs: ["getting-started", "welcome"] },
        { file: "b", slugs: ["top-level"] },
        { file: "c", slugs: ["getting-started", "sub", "deep"] },
      ])
    ).toEqual([
      "b: help articles must sit in content/articles/<category>/<article>",
      "c: help articles must sit in content/articles/<category>/<article>",
    ])
  })
})

describe("reservedProblems", () => {
  const article = (category: string, file: string) => ({
    url: `/${category}/article`,
    file: `apps/help/content/articles/${file}`,
  })

  test("a reserved top-level category name is reported", () => {
    expect(
      reservedProblems([
        article("contact", "contact/article.mdx"),
        article("all", "all/article.mdx"),
        article("og", "og/article.mdx"),
      ])
    ).toEqual([
      `apps/help/content/articles/contact/article.mdx: "contact" is reserved (it would be shadowed by a built-in route)`,
      `apps/help/content/articles/all/article.mdx: "all" is reserved (it would be shadowed by a built-in route)`,
      `apps/help/content/articles/og/article.mdx: "og" is reserved (it would be shadowed by a built-in route)`,
    ])
  })

  test("an ordinary category name is free", () => {
    expect(reservedProblems([article("getting-started", "getting-started/article.mdx")])).toEqual(
      []
    )
  })
})

describe("helpKnownPaths", () => {
  test("every category and article path plus the app's extra routes", () => {
    expect(
      [
        ...helpKnownPaths(["getting-started"], [{ category: "getting-started", slug: "welcome" }]),
      ].sort()
    ).toEqual(
      [
        "/",
        "/all",
        "/api/search",
        "/contact",
        "/getting-started",
        "/getting-started/welcome",
      ].sort()
    )
  })
})

describe("orderedNames", () => {
  test("follows pages' order, appending unlisted names alphabetically", () => {
    expect(orderedNames(["c", "a", "b"], ["b"])).toEqual(["b", "a", "c"])
  })

  test("with no pages, falls back to alphabetical order", () => {
    expect(orderedNames(["c", "a", "b"])).toEqual(["a", "b", "c"])
  })

  test("a pages entry matching nothing is ignored here (metaProblems reports it)", () => {
    expect(orderedNames(["a", "b"], ["nope", "b"])).toEqual(["b", "a"])
  })
})

function article(
  category: string,
  slug: string,
  source: string,
  overrides: Partial<HelpArticleInput> = {}
): HelpArticleInput {
  return {
    file: `apps/help/content/articles/${category}/${slug}.mdx`,
    category,
    slug,
    frontmatter: {
      title: slug,
      description: "A short description",
      tags: [],
      type: "Help Article",
    },
    source,
    images: [],
    toc: [],
    ...overrides,
  }
}

function categoryMeta(
  slug: string,
  title: string,
  description: string,
  pages?: string[]
): HelpMetaInput {
  return {
    file: `apps/help/content/articles/${slug}/meta.json`,
    dir: `/${slug}`,
    title,
    description,
    pages,
  }
}

const known = {
  hosts: new Set(["help.example.com", "www.example.com"]),
  ownHost: "help.example.com",
}
const noImages = () => true

function problemsOf(run: () => void): string[] {
  try {
    run()
  } catch (error) {
    if (error instanceof ContentError) return error.problems
    throw error
  }
  return []
}

describe("assembleHelp", () => {
  test("clean articles build categories and articles in meta.json order", () => {
    const metas: HelpMetaInput[] = [
      { file: ROOT_FILE, dir: "", pages: ["workspaces", "getting-started"] },
      categoryMeta("getting-started", "Getting started", "Create an account and invite your team", [
        "invite-your-team",
        "create-an-account",
      ]),
      categoryMeta("workspaces", "Workspaces & billing", "Roles, seats and plans"),
    ]
    const inputs = [
      article(
        "getting-started",
        "create-an-account",
        "See [other](/getting-started/invite-your-team)."
      ),
      article("getting-started", "invite-your-team", ""),
      article("workspaces", "roles", ""),
    ]
    const result = assembleHelp(inputs, [], metas, known, noImages)
    expect(result.categories.map((category) => category.slug)).toEqual([
      "workspaces",
      "getting-started",
    ])
    expect(result.categories[1]?.title).toBe("Getting started")
    expect(result.categories[1]?.description).toBe("Create an account and invite your team")
    expect(result.categories[1]?.articles.map((a) => a.slug)).toEqual([
      "invite-your-team",
      "create-an-account",
    ])
    expect(result.categories[1]?.articles[0]?.path).toBe("/getting-started/invite-your-team")
    expect(result.articles).toHaveLength(3)
  })

  test("a category with no explicit title falls back to a humanized slug", () => {
    const metas: HelpMetaInput[] = [categoryMeta("two-step-verification", "", "How it works")]
    const result = assembleHelp(
      [article("two-step-verification", "turn-it-on", "")],
      [],
      metas,
      known,
      noImages
    )
    expect(result.categories[0]?.title).toBe("Two step verification")
  })

  test("popular defaults to false when the frontmatter leaves it unset", () => {
    const metas: HelpMetaInput[] = [categoryMeta("getting-started", "Getting started", "d")]
    const result = assembleHelp(
      [article("getting-started", "welcome", "")],
      [],
      metas,
      known,
      noImages
    )
    expect(result.articles[0]?.popular).toBe(false)
  })

  test("prior problems (nesting) join the same ContentError", () => {
    const problems = problemsOf(() =>
      assembleHelp(
        [article("getting-started", "welcome", "")],
        ["x: help articles must sit in content/articles/<category>/<article>"],
        [categoryMeta("getting-started", "Getting started", "d")],
        known,
        noImages
      )
    )
    expect(problems).toEqual(["x: help articles must sit in content/articles/<category>/<article>"])
  })

  test("a body h1 in one article and a broken link in another make ONE ContentError", () => {
    const metas: HelpMetaInput[] = [categoryMeta("getting-started", "Getting started", "d")]
    const problems = problemsOf(() =>
      assembleHelp(
        [
          article("getting-started", "welcome", "# Welcome"),
          article("getting-started", "lost", "See [nowhere](/nope)."),
        ],
        [],
        metas,
        known,
        noImages
      )
    )
    expect(problems).toEqual([
      'apps/help/content/articles/getting-started/welcome.mdx: use "##" for headings — the article title is the page\'s h1',
      'apps/help/content/articles/getting-started/lost.mdx: broken link "/nope"',
    ])
  })

  test("a link to /all, /contact and another article's #anchor is accepted", () => {
    const metas: HelpMetaInput[] = [categoryMeta("getting-started", "Getting started", "d")]
    const problems = problemsOf(() =>
      assembleHelp(
        [
          article(
            "getting-started",
            "welcome",
            "[Every article](/all), [contact us](/contact) and [create](/getting-started/create#x)."
          ),
          article("getting-started", "create", ""),
        ],
        [],
        metas,
        known,
        noImages
      )
    )
    expect(problems).toEqual([])
  })

  test("a link to a local development host is reported", () => {
    const metas: HelpMetaInput[] = [categoryMeta("getting-started", "Getting started", "d")]
    const problems = problemsOf(() =>
      assembleHelp(
        [article("getting-started", "welcome", "[Local](http://localhost:3000/x)")],
        [],
        metas,
        known,
        noImages
      )
    )
    expect(problems).toEqual([
      'apps/help/content/articles/getting-started/welcome.mdx: link "http://localhost:3000/x" points at a local development host',
    ])
  })

  test("a reserved category name joins the same ContentError", () => {
    const metas: HelpMetaInput[] = [categoryMeta("contact", "Contact", "d")]
    const problems = problemsOf(() =>
      assembleHelp([article("contact", "welcome", "")], [], metas, known, noImages)
    )
    expect(problems).toEqual([
      'apps/help/content/articles/contact/welcome.mdx: "contact" is reserved (it would be shadowed by a built-in route)',
    ])
  })

  test("a missing image joins the same ContentError", () => {
    const metas: HelpMetaInput[] = [categoryMeta("getting-started", "Getting started", "d")]
    const problems = problemsOf(() =>
      assembleHelp(
        [article("getting-started", "welcome", "", { images: ["/diagram.png"] })],
        [],
        metas,
        known,
        () => false
      )
    )
    expect(problems).toEqual([
      'apps/help/content/articles/getting-started/welcome.mdx: image "/diagram.png" not found in public/',
    ])
  })

  test("a meta.json entry matching nothing joins the same ContentError", () => {
    const metas: HelpMetaInput[] = [
      { file: ROOT_FILE, dir: "", pages: ["nope"] },
      categoryMeta("getting-started", "Getting started", "d"),
    ]
    const problems = problemsOf(() =>
      assembleHelp([article("getting-started", "welcome", "")], [], metas, known, noImages)
    )
    expect(problems).toEqual([`${ROOT_FILE}: "nope" in pages matches no category or article`])
  })

  test("a category with no description in its meta.json is reported, naming that file", () => {
    const metas: HelpMetaInput[] = [
      { file: "apps/help/content/articles/getting-started/meta.json", dir: "/getting-started" },
    ]
    const problems = problemsOf(() =>
      assembleHelp([article("getting-started", "welcome", "")], [], metas, known, noImages)
    )
    expect(problems).toEqual([
      'apps/help/content/articles/getting-started/meta.json: missing "description"',
    ])
  })

  test("a category with no meta.json at all names the file it should have", () => {
    const problems = problemsOf(() =>
      assembleHelp([article("getting-started", "welcome", "")], [], [], known, noImages)
    )
    expect(problems).toEqual([
      'apps/help/content/articles/getting-started/meta.json: missing "description"',
    ])
  })
})
