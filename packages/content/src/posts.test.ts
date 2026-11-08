import { describe, expect, test } from "bun:test"
import type { PostInput } from "./posts"
import {
  ContentError,
  createBlog,
  DEFAULT_PAGE_SIZE,
  isPublished,
  localePrefix,
  postPath,
  RESERVED_SLUGS,
  readingMinutes,
} from "./posts"
import type { Author, PostFrontmatter } from "./schema"

const authors: Record<string, Author> = {
  jane: { name: "Jane Doe", bio: "Writes things.", avatar: "/avatars/jane.png" },
  bob: { name: "Bob Roe", bio: "Also writes things.", avatar: "/avatars/bob.png" },
}

function input(overrides: Partial<PostInput> = {}): PostInput {
  return {
    file: "content/posts/example.mdx",
    slug: "example",
    frontmatter: {
      title: "Example",
      description: "An example post",
      date: new Date("2026-01-01"),
      author: "jane",
      tags: ["bun"],
      type: "Blog Post",
      locale: "en",
    },
    text: "word ".repeat(50).trim(),
    links: [],
    ...overrides,
  }
}

describe("createBlog validation", () => {
  test("throws ContentError listing every problem at once", () => {
    const inputs: PostInput[] = [
      input({
        file: "a.mdx",
        slug: "My Post",
        frontmatter: { ...input().frontmatter, tags: ["bun"] },
      }),
      input({
        file: "b.mdx",
        slug: "b",
        frontmatter: { ...input().frontmatter, tags: ["Next.js"] },
      }),
      input({
        file: "c.mdx",
        slug: "c",
        frontmatter: { ...input().frontmatter, author: "nobody" },
      }),
      input({ file: "d.mdx", slug: "dup" }),
      input({ file: "e.mdx", slug: "dup" }),
    ]

    let error: unknown
    try {
      createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    } catch (e) {
      error = e
    }

    expect(error).toBeInstanceOf(ContentError)
    const contentError = error as ContentError
    expect(contentError.problems).toContain('a.mdx: slug "My Post" must be lowercase kebab-case')
    expect(contentError.problems).toContain('b.mdx: tag "Next.js" must be lowercase kebab-case')
    expect(contentError.problems).toContain('c.mdx: unknown author "nobody"')
    expect(contentError.problems).toContain('e.mdx: duplicate slug "dup" (also d.mdx)')
    expect(contentError.problems.length).toBe(4)
    expect(contentError.message).toBe(
      `Content errors:\n${contentError.problems.map((p) => `- ${p}`).join("\n")}`
    )
  })

  test("re-validates frontmatter with postFrontmatterSchema and names the field", () => {
    const bad = input({
      frontmatter: { ...input().frontmatter, title: "" },
    })
    expect(() =>
      createBlog([bad], authors, { mode: "production", now: new Date("2026-06-01") })
    ).toThrow(ContentError)
    try {
      createBlog([bad], authors, { mode: "production", now: new Date("2026-06-01") })
    } catch (e) {
      const err = e as ContentError
      expect(err.problems.some((p) => p.includes(bad.file) && p.includes("title"))).toBe(true)
    }
  })
})

describe("reserved slugs", () => {
  test("every route-colliding slug is refused by name", () => {
    const reserved = [
      "page",
      "tags",
      "authors",
      "opengraph-image",
      "twitter-image",
      "rss",
      "atom",
      "feed",
      "sitemap",
      "robots",
      "manifest",
      "api",
      "files",
      "sv",
      "en",
    ]
    expect([...RESERVED_SLUGS].sort()).toEqual([...reserved].sort())
    const inputs = reserved.map((slug) => input({ file: `${slug}.mdx`, slug }))
    try {
      createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
      throw new Error("expected createBlog to throw")
    } catch (e) {
      expect((e as ContentError).problems).toEqual(
        reserved.map((slug) => `${slug}.mdx: slug "${slug}" is reserved`)
      )
    }
  })

  test("a slug that only contains a reserved word is fine", () => {
    const blog = createBlog([input({ slug: "tags-explained" })], authors, {
      mode: "production",
      now: new Date("2026-06-01"),
    })
    expect(blog.post("tags-explained")).toBeDefined()
  })
})

describe("isPublished", () => {
  const production = { mode: "production" as const, now: new Date("2026-06-01T23:30:00Z") }

  test("production: a draft never, a dated post from its UTC day on", () => {
    expect(isPublished({ date: new Date("2026-06-01") }, production)).toBe(true)
    expect(isPublished({ date: new Date("2026-06-02") }, production)).toBe(false)
    expect(isPublished({ date: new Date("2026-01-01"), draft: true }, production)).toBe(false)
  })

  test("development: everything", () => {
    const dev = { mode: "development" as const, now: new Date("2026-01-01") }
    expect(isPublished({ date: new Date("2099-01-01"), draft: true }, dev)).toBe(true)
  })
})

describe("published filter", () => {
  test("production drops a draft", () => {
    const inputs = [input({ slug: "a", frontmatter: { ...input().frontmatter, draft: true } })]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.posts()).toHaveLength(0)
  })

  test("production drops a post dated tomorrow but keeps one dated today", () => {
    const now = new Date("2026-06-01T23:30:00Z")
    const today = input({
      slug: "today",
      frontmatter: { ...input().frontmatter, date: new Date("2026-06-01") },
    })
    const tomorrow = input({
      slug: "tomorrow",
      frontmatter: { ...input().frontmatter, date: new Date("2026-06-02") },
    })
    const blog = createBlog([today, tomorrow], authors, { mode: "production", now })
    expect(blog.posts().map((p) => p.slug)).toEqual(["today"])
  })

  test("development keeps everything, drafts and future dates included", () => {
    const now = new Date("2026-01-01")
    const inputs = [
      input({ slug: "draft", frontmatter: { ...input().frontmatter, draft: true } }),
      input({
        slug: "future",
        frontmatter: { ...input().frontmatter, date: new Date("2099-01-01") },
      }),
    ]
    const blog = createBlog(inputs, authors, { mode: "development", now })
    expect(
      blog
        .posts()
        .map((p) => p.slug)
        .sort()
    ).toEqual(["draft", "future"])
  })
})

describe("ordering and pagination", () => {
  test("posts() is newest first", () => {
    const inputs = [
      input({ slug: "old", frontmatter: { ...input().frontmatter, date: new Date("2026-01-01") } }),
      input({ slug: "new", frontmatter: { ...input().frontmatter, date: new Date("2026-03-01") } }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.posts().map((p) => p.slug)).toEqual(["new", "old"])
  })

  test("page(2) with 13 posts (size 12) returns 1 post and pages: 2", () => {
    expect(DEFAULT_PAGE_SIZE).toBe(12)
    const inputs = Array.from({ length: 13 }, (_, i) =>
      input({
        slug: `post-${i}`,
        frontmatter: { ...input().frontmatter, date: new Date(2026, 0, i + 1) },
      })
    )
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    const page2 = blog.page(2)
    expect(page2.posts).toHaveLength(1)
    expect(page2.page).toBe(2)
    expect(page2.pages).toBe(2)
  })

  test("page(1) with 0 posts returns an empty page with pages: 1", () => {
    const blog = createBlog([], authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.page(1)).toEqual({ posts: [], page: 1, pages: 1 })
  })
})

describe("published posts use the parsed frontmatter, not the raw input", () => {
  test("type defaults to 'Blog Post' on the Post when the raw frontmatter omits it", () => {
    const raw = {
      title: "No type given",
      description: "An example post",
      date: new Date("2026-01-01"),
      author: "jane",
      tags: ["bun"],
    } as unknown as PostFrontmatter
    const blog = createBlog([input({ slug: "no-type", frontmatter: raw })], authors, {
      mode: "production",
      now: new Date("2026-06-01"),
    })
    expect(blog.post("no-type")?.type).toBe("Blog Post")
  })
})

describe("tags, authors", () => {
  test("tags() by count desc then tag", () => {
    const inputs = [
      input({ slug: "a", frontmatter: { ...input().frontmatter, tags: ["bun", "next"] } }),
      input({ slug: "b", frontmatter: { ...input().frontmatter, tags: ["bun"] } }),
      input({ slug: "c", frontmatter: { ...input().frontmatter, tags: ["zod"] } }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.tags()).toEqual([
      { tag: "bun", count: 2 },
      { tag: "next", count: 1 },
      { tag: "zod", count: 1 },
    ])
  })

  test("authors() lists keys with at least one published post", () => {
    const inputs = [
      input({ slug: "a", frontmatter: { ...input().frontmatter, author: "jane" } }),
      input({ slug: "b", frontmatter: { ...input().frontmatter, author: "bob", draft: true } }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.authors()).toEqual(["jane"])
  })

  test("author(key) returns the record", () => {
    const blog = createBlog([], authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.author("jane")).toEqual(authors.jane)
    expect(blog.author("ghost")).toBeUndefined()
  })
})

describe("related and neighbours", () => {
  test("related ranks by shared tags then date, excludes itself", () => {
    const inputs = [
      input({
        slug: "main",
        frontmatter: { ...input().frontmatter, date: new Date("2026-03-01"), tags: ["bun", "zod"] },
      }),
      input({
        slug: "two-shared-older",
        frontmatter: { ...input().frontmatter, date: new Date("2026-01-01"), tags: ["bun", "zod"] },
      }),
      input({
        slug: "one-shared-newer",
        frontmatter: { ...input().frontmatter, date: new Date("2026-02-01"), tags: ["bun"] },
      }),
      input({
        slug: "no-share",
        frontmatter: { ...input().frontmatter, date: new Date("2026-04-01"), tags: ["other"] },
      }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    const related = blog.related("main")
    expect(related.map((p) => p.slug)).toEqual(["two-shared-older", "one-shared-newer"])
    expect(related.some((p) => p.slug === "main")).toBe(false)
  })

  test("neighbours of the newest post has no newer", () => {
    const inputs = [
      input({ slug: "old", frontmatter: { ...input().frontmatter, date: new Date("2026-01-01") } }),
      input({ slug: "new", frontmatter: { ...input().frontmatter, date: new Date("2026-03-01") } }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    const neighbours = blog.neighbours("new")
    expect(neighbours.newer).toBeUndefined()
    expect(neighbours.older?.slug).toBe("old")
  })

  test("neighbours of the oldest post has no older", () => {
    const inputs = [
      input({ slug: "old", frontmatter: { ...input().frontmatter, date: new Date("2026-01-01") } }),
      input({ slug: "new", frontmatter: { ...input().frontmatter, date: new Date("2026-03-01") } }),
    ]
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    const neighbours = blog.neighbours("old")
    expect(neighbours.older).toBeUndefined()
    expect(neighbours.newer?.slug).toBe("new")
  })

  test("related's default limit is 3", () => {
    const inputs = Array.from({ length: 5 }, (_, i) =>
      input({
        slug: `tagged-${i}`,
        frontmatter: { ...input().frontmatter, date: new Date(2026, 0, i + 1), tags: ["bun"] },
      })
    )
    inputs.push(
      input({
        slug: "main",
        frontmatter: { ...input().frontmatter, date: new Date("2026-06-01"), tags: ["bun"] },
      })
    )
    const blog = createBlog(inputs, authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.related("main")).toHaveLength(3)
  })
})

describe("readingMinutes", () => {
  test("empty text is 1 minute", () => {
    expect(readingMinutes("")).toBe(1)
  })
  test("400 words is 2 minutes", () => {
    expect(readingMinutes("word ".repeat(400).trim())).toBe(2)
  })
})

describe("languages", () => {
  const options = {
    mode: "production" as const,
    now: new Date("2026-06-01"),
    rootLocale: "sv" as const,
  }

  function localized(
    slug: string,
    locale: "sv" | "en",
    extra: Partial<PostFrontmatter> = {}
  ): PostInput {
    const base = input({ file: `${slug}.mdx`, slug })
    return { ...base, frontmatter: { ...base.frontmatter, locale, ...extra } }
  }

  function problems(inputs: PostInput[], opts: Parameters<typeof createBlog>[2] = options) {
    try {
      createBlog(inputs, authors, opts)
      return []
    } catch (e) {
      return (e as ContentError).problems
    }
  }

  test("a post's locale defaults to English", () => {
    const blog = createBlog([input()], authors, { mode: "production", now: new Date("2026-06-01") })
    expect(blog.posts()[0]?.locale).toBe("en")
  })

  test("without rootLocale every post is served at /<slug>, whatever its language", () => {
    const blog = createBlog([localized("en-hello", "en")], authors, {
      mode: "production",
      now: new Date("2026-06-01"),
    })
    expect(blog.posts()[0]?.url).toBe("/en-hello")
  })

  test("with rootLocale, a root-language post is /<slug> and another is /<locale>/<rest>", () => {
    const blog = createBlog([localized("hej", "sv"), localized("en-hello", "en")], authors, options)
    expect(blog.post("hej")?.url).toBe("/hej")
    expect(blog.post("en-hello")?.url).toBe("/en/hello")
    expect(postPath("en-hello", "en", "sv")).toBe("/en/hello")
    expect(localePrefix("en", "sv")).toBe("/en")
    expect(localePrefix("sv", "sv")).toBe("")
  })

  test("an English post must be named en-<slug>, and its rest must not be reserved", () => {
    expect(problems([localized("hello", "en"), localized("en-tags", "en")])).toEqual([
      'hello.mdx: a post with locale "en" must be named "en-<slug>.mdx" (it is served at /en/<slug>)',
      'en-tags.mdx: slug "tags" is reserved',
    ])
  })

  test("a Swedish post must not borrow the English prefix", () => {
    expect(problems([localized("en-hej", "sv")])).toEqual([
      'en-hej.mdx: "en-" names are for posts with locale "en" — set `locale: en` or rename the file',
    ])
  })

  test("translationOf must name another post in another language, once per language", () => {
    expect(
      problems([
        localized("hej", "sv"),
        localized("ny", "sv", { translationOf: "hej" }),
        localized("en-hello", "en", { translationOf: "hej" }),
        localized("en-again", "en", { translationOf: "hej" }),
        localized("en-lost", "en", { translationOf: "saknas" }),
      ])
    ).toEqual([
      'ny.mdx: translationOf "hej" is a post in the same language ("sv")',
      'en-again.mdx: "hej" already has a "en" translation (en-hello.mdx)',
      'en-lost.mdx: translationOf "saknas" names no post',
    ])
  })

  test("a draft counts as an existing original", () => {
    expect(
      problems([
        localized("hej", "sv", { draft: true }),
        localized("en-hello", "en", { translationOf: "hej" }),
      ])
    ).toEqual([])
  })

  test("inLocale narrows every list; translation finds the counterpart both ways", () => {
    const blog = createBlog(
      [
        localized("hej", "sv", { tags: ["ledarskap"] }),
        localized("tva", "sv", { tags: ["ledarskap"], date: new Date("2026-02-01") }),
        localized("en-hello", "en", { translationOf: "hej", tags: ["leadership"] }),
      ],
      authors,
      options
    )
    const sv = blog.inLocale("sv")
    expect(sv.posts().map((post) => post.slug)).toEqual(["tva", "hej"])
    expect(sv.tags()).toEqual([{ tag: "ledarskap", count: 2 }])
    expect(sv.post("en-hello")).toBeUndefined()
    expect(sv.neighbours("hej")).toEqual({ newer: sv.post("tva") })
    expect(
      blog
        .inLocale("en")
        .posts()
        .map((post) => post.slug)
    ).toEqual(["en-hello"])
    expect(sv.translation("hej")?.slug).toBe("en-hello")
    expect(blog.inLocale("en").translation("en-hello")?.slug).toBe("hej")
    expect(sv.translation("tva")).toBeUndefined()
  })

  test("a translation that is not published is not offered", () => {
    const blog = createBlog(
      [localized("hej", "sv"), localized("en-hello", "en", { translationOf: "hej", draft: true })],
      authors,
      options
    )
    expect(blog.translation("hej")).toBeUndefined()
  })
})
