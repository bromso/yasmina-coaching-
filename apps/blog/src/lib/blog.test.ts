import { describe, expect, test } from "bun:test"
import type { PostInput } from "@repo/content/posts"
import { ContentError } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { assembleBlog, type BlogInput, knownPaths, nestingProblems } from "./blog-core"

const authors: Record<string, Author> = {
  team: { name: "Team", bio: "Writes things.", avatar: "/authors/team.svg" },
}

function input(slug: string, tags: string[] = ["a"]): PostInput {
  return {
    file: `apps/blog/content/posts/${slug}.mdx`,
    slug,
    frontmatter: {
      title: slug,
      description: "A post",
      date: new Date("2026-01-01"),
      author: "team",
      tags,
      type: "Blog Post",
    },
    text: "word",
    links: [],
  }
}

const options = { mode: "production" as const, now: new Date("2026-10-07") }

describe("knownPaths", () => {
  test("lists every page, feed, tag and author path for a one-post blog", () => {
    expect([...knownPaths([input("hello")])].sort()).toEqual(
      ["/", "/hello", "/tags/a", "/authors/team", "/rss.xml", "/atom.xml", "/feed.json"].sort()
    )
  })

  test("adds /page/<n> only for n >= 2", () => {
    const inputs = Array.from({ length: 25 }, (_, i) => input(`post-${i}`))
    const paths = knownPaths(inputs)
    expect(paths.has("/page/1")).toBe(false)
    expect(paths.has("/page/2")).toBe(true)
    expect(paths.has("/page/3")).toBe(true)
    expect(paths.has("/page/4")).toBe(false)
  })

  test("takes a page size", () => {
    const inputs = Array.from({ length: 5 }, (_, i) => input(`post-${i}`))
    expect(knownPaths(inputs, 2).has("/page/3")).toBe(true)
    expect(knownPaths(inputs, 2).has("/page/4")).toBe(false)
  })
})

describe("nestingProblems", () => {
  test("a post in a subfolder of content/posts/ is refused", () => {
    expect(
      nestingProblems([
        { file: "apps/blog/content/posts/ok.mdx", slugs: ["ok"] },
        { file: "apps/blog/content/posts/2026/nested.mdx", slugs: ["2026", "nested"] },
      ])
    ).toEqual([
      "apps/blog/content/posts/2026/nested.mdx: posts must sit directly in content/posts/",
    ])
  })
})

describe("assembleBlog", () => {
  const known = { hosts: new Set<string>(), ownHost: "blog.brand.localhost:3009" }
  const noImagesExist = () => false

  function blogInput(overrides: Partial<BlogInput> = {}): BlogInput {
    return {
      file: "apps/blog/content/posts/x.mdx",
      slug: "x",
      frontmatter: {
        title: "T",
        description: "D",
        date: new Date("2026-01-01"),
        author: "team",
        tags: [],
        type: "Blog Post",
      },
      text: "word",
      links: [],
      images: [],
      ...overrides,
    }
  }

  test("collects problems from every stage it can run into one ContentError", () => {
    const nestedPostProblem =
      "apps/blog/content/posts/2026/x.mdx: posts must sit directly in content/posts/"
    const h1Problem =
      'apps/blog/content/posts/x.mdx: use "##" for headings — the post title is the page\'s h1'
    const unknownAuthorPost = blogInput({
      file: "apps/blog/content/posts/unknown-author.mdx",
      slug: "unknown-author",
      frontmatter: { ...blogInput().frontmatter, author: "nobody" },
    })

    expect(() =>
      assembleBlog(
        [unknownAuthorPost],
        [nestedPostProblem, h1Problem],
        authors,
        options,
        known,
        noImagesExist
      )
    ).toThrow(ContentError)

    try {
      assembleBlog(
        [unknownAuthorPost],
        [nestedPostProblem, h1Problem],
        authors,
        options,
        known,
        noImagesExist
      )
    } catch (error) {
      const contentError = error as ContentError
      expect(contentError.problems).toEqual([
        nestedPostProblem,
        h1Problem,
        'apps/blog/content/posts/unknown-author.mdx: unknown author "nobody"',
      ])
    }
  })

  test("a bad tag on one post and a broken link on another are reported together", () => {
    const badTag = blogInput({
      file: "apps/blog/content/posts/bad-tag.mdx",
      slug: "bad-tag",
      frontmatter: { ...blogInput().frontmatter, tags: ["Not Ok"] },
    })
    const brokenLink = blogInput({
      file: "apps/blog/content/posts/broken-link.mdx",
      slug: "broken-link",
      links: ["/missing-page"],
    })

    try {
      assembleBlog([badTag, brokenLink], [], authors, options, known, noImagesExist)
      throw new Error("expected assembleBlog to throw")
    } catch (error) {
      const contentError = error as ContentError
      expect(contentError).toBeInstanceOf(ContentError)
      expect(contentError.problems).toEqual([
        'apps/blog/content/posts/bad-tag.mdx: tag "Not Ok" must be lowercase kebab-case',
        'apps/blog/content/posts/broken-link.mdx: broken link "/missing-page"',
      ])
    }
  })

  test("a draft's own broken link is not checked, even when another post fails to build", () => {
    const badTag = blogInput({
      file: "apps/blog/content/posts/bad-tag.mdx",
      slug: "bad-tag",
      frontmatter: { ...blogInput().frontmatter, tags: ["Not Ok"] },
    })
    const draftWithBrokenLink = blogInput({
      file: "apps/blog/content/posts/draft.mdx",
      slug: "draft",
      frontmatter: { ...blogInput().frontmatter, draft: true },
      links: ["/missing-page"],
    })

    try {
      assembleBlog([badTag, draftWithBrokenLink], [], authors, options, known, noImagesExist)
      throw new Error("expected assembleBlog to throw")
    } catch (error) {
      const contentError = error as ContentError
      expect(contentError.problems).toEqual([
        'apps/blog/content/posts/bad-tag.mdx: tag "Not Ok" must be lowercase kebab-case',
      ])
    }
  })

  test("a missing cover image is reported like a missing body image", () => {
    const post = blogInput({
      frontmatter: {
        ...blogInput().frontmatter,
        cover: { src: "/missing-cover.png", alt: "A missing cover" },
      },
      images: ["/missing-cover.png"],
    })

    try {
      assembleBlog([post], [], authors, options, known, noImagesExist)
      throw new Error("expected assembleBlog to throw")
    } catch (error) {
      const contentError = error as ContentError
      expect(contentError.problems).toEqual([
        'apps/blog/content/posts/x.mdx: image "/missing-cover.png" not found in public/',
      ])
    }
  })
  function problemsOf(run: () => unknown): string[] {
    try {
      run()
    } catch (error) {
      if (!(error instanceof ContentError)) throw error
      return error.problems
    }
    throw new Error("expected assembleBlog to throw")
  }

  test("links to a tag, an author and /page/2 (13 posts) are accepted", () => {
    const posts = Array.from({ length: 13 }, (_, i) =>
      blogInput({
        file: `apps/blog/content/posts/post-${i}.mdx`,
        slug: `post-${i}`,
        frontmatter: { ...blogInput().frontmatter, tags: ["guides"] },
      })
    )
    const linking = blogInput({
      file: "apps/blog/content/posts/linking.mdx",
      slug: "linking",
      links: ["/tags/guides", "/authors/team", "/page/2", "/post-0/"],
    })
    const blog = assembleBlog([...posts, linking], [], authors, options, known, noImagesExist)
    expect(blog.posts()).toHaveLength(14)
  })

  test("a link to a draft and to a future-dated post are both broken in production", () => {
    const draft = blogInput({
      file: "apps/blog/content/posts/draft.mdx",
      slug: "draft",
      frontmatter: { ...blogInput().frontmatter, draft: true },
    })
    const future = blogInput({
      file: "apps/blog/content/posts/future.mdx",
      slug: "future",
      frontmatter: { ...blogInput().frontmatter, date: new Date("2099-01-01") },
    })
    const linking = blogInput({
      file: "apps/blog/content/posts/linking.mdx",
      slug: "linking",
      links: ["/draft", "/future"],
    })
    expect(
      problemsOf(() =>
        assembleBlog([draft, future, linking], [], authors, options, known, noImagesExist)
      )
    ).toEqual([
      'apps/blog/content/posts/linking.mdx: broken link "/draft"',
      'apps/blog/content/posts/linking.mdx: broken link "/future"',
    ])
  })

  test("bad frontmatter and another post's broken link give one ContentError, no TypeError", () => {
    const { tags: _tags, date: _date, ...rest } = blogInput().frontmatter
    const badFrontmatter = blogInput({
      file: "apps/blog/content/posts/bad.mdx",
      slug: "bad",
      frontmatter: rest as BlogInput["frontmatter"],
    })
    const brokenLink = blogInput({
      file: "apps/blog/content/posts/broken-link.mdx",
      slug: "broken-link",
      links: ["/missing-page"],
    })
    const problems = problemsOf(() =>
      assembleBlog([badFrontmatter, brokenLink], [], authors, options, known, noImagesExist)
    )
    expect(problems.some((p) => p.startsWith("apps/blog/content/posts/bad.mdx: date"))).toBe(true)
    expect(problems).toContain(
      'apps/blog/content/posts/broken-link.mdx: broken link "/missing-page"'
    )
  })
})
