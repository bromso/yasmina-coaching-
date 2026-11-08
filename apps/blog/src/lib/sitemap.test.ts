import { describe, expect, test } from "bun:test"
import type { PostInput } from "@repo/content/posts"
import { createBlog } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { blogSitemap } from "./sitemap"

const authors: Record<string, Author> = {
  team: { name: "Team", bio: "Writes things.", avatar: "/authors/team.svg" },
}

const options = {
  mode: "production" as const,
  now: new Date("2026-10-07"),
  rootLocale: "sv" as const,
}

function input(slug: string, overrides: Partial<PostInput["frontmatter"]> = {}): PostInput {
  return {
    file: `apps/blog/content/posts/${slug}.mdx`,
    slug,
    frontmatter: {
      title: slug,
      description: "A post",
      date: new Date("2026-01-01"),
      updated: new Date("2026-02-01"),
      author: "team",
      tags: ["guides"],
      type: "Blog Post",
      locale: "sv",
      ...overrides,
    },
    text: "word",
    links: [],
  }
}

const env = { SITE_DOMAIN: "example.com" }

describe("blogSitemap", () => {
  test("lists the home page, the post, its tag and author pages", () => {
    const blog = createBlog([input("hello")], authors, options)
    const urls = blogSitemap(blog, env).map((entry) => entry.url)
    expect(urls).toEqual([
      "https://blog.example.com/",
      "https://blog.example.com/en",
      "https://blog.example.com/hello",
      "https://blog.example.com/tags/guides",
      "https://blog.example.com/authors/team",
    ])
  })

  test("a post's lastModified is its updated date, falling back to its date", () => {
    const blog = createBlog(
      [input("hello"), input("no-update", { updated: undefined })],
      authors,
      options
    )
    const entries = blogSitemap(blog, env)
    const hello = entries.find((entry) => entry.url === "https://blog.example.com/hello")
    const noUpdate = entries.find((entry) => entry.url === "https://blog.example.com/no-update")
    expect(hello?.lastModified).toEqual(new Date("2026-02-01"))
    expect(noUpdate?.lastModified).toEqual(new Date("2026-01-01"))
  })

  test("adds a /page/<n> entry for every further list page", () => {
    const inputs = Array.from({ length: 25 }, (_, i) => input(`post-${i}`))
    const urls = blogSitemap(createBlog(inputs, authors, options), env).map((entry) => entry.url)
    expect(urls).not.toContain("https://blog.example.com/page/1")
    expect(urls).toContain("https://blog.example.com/page/2")
    expect(urls).toContain("https://blog.example.com/page/3")
  })

  test("contains no feed", () => {
    const blog = createBlog([input("hello")], authors, options)
    const urls = blogSitemap(blog, env).map((entry) => entry.url)
    expect(urls.some((url) => url.endsWith(".xml") || url.endsWith(".json"))).toBe(false)
  })

  test("with zero published posts, only the two indexes", () => {
    const blog = createBlog([], authors, options)
    const urls = blogSitemap(blog, env).map((entry) => entry.url)
    expect(urls).toEqual(["https://blog.example.com/", "https://blog.example.com/en"])
  })

  test("the home page's lastModified is the newest overall updated-or-date, not the build time", () => {
    const blog = createBlog(
      [
        input("older-post", { date: new Date("2026-01-01"), updated: new Date("2026-01-10") }),
        input("newer-post", { date: new Date("2026-03-01"), updated: undefined }),
      ],
      authors,
      options
    )
    const home = blogSitemap(blog, env).find((entry) => entry.url === "https://blog.example.com/")
    // "newer-post" is newer by date (2026-03-01) than "older-post"'s updated (2026-01-10): the
    // overall newest must still win regardless of which post it came from.
    expect(home?.lastModified).toEqual(new Date("2026-03-01"))
  })

  test("the home page falls back to the build time with zero posts", () => {
    const before = new Date()
    const blog = createBlog([], authors, options)
    const home = blogSitemap(blog, env).find((entry) => entry.url === "https://blog.example.com/")
    expect(home?.lastModified.getTime()).toBeGreaterThanOrEqual(before.getTime())
  })

  test("a tag page's lastModified is the newest updated-or-date among its own posts only", () => {
    const blog = createBlog(
      [
        input("a", { date: new Date("2026-01-01"), tags: ["guides"] }),
        input("b", { date: new Date("2026-06-01"), updated: undefined, tags: ["guides"] }),
        input("c", { date: new Date("2026-09-01"), updated: undefined, tags: ["other"] }),
      ],
      authors,
      options
    )
    const tag = blogSitemap(blog, env).find(
      (entry) => entry.url === "https://blog.example.com/tags/guides"
    )
    // "a" has updated=2026-02-01 (the `input` default); "b" is newer by date (2026-06-01) but
    // has no updated — "c" (2026-09-01) is newest overall but tagged "other", not "guides".
    expect(tag?.lastModified).toEqual(new Date("2026-06-01"))
  })

  test("an author page's lastModified is the newest updated-or-date among their own posts only", () => {
    const blog = createBlog(
      [
        input("a", { date: new Date("2026-01-01"), author: "team" }),
        input("b", { date: new Date("2026-06-01"), updated: undefined, author: "team" }),
      ],
      { ...authors, ghost: { name: "Ghost", bio: "", avatar: "/x.svg" } },
      options
    )
    const author = blogSitemap(blog, env).find(
      (entry) => entry.url === "https://blog.example.com/authors/team"
    )
    expect(author?.lastModified).toEqual(new Date("2026-06-01"))
  })

  test("a /page/<n> entry's lastModified is the newest overall, not the build time", () => {
    const inputs = Array.from({ length: 25 }, (_, i) =>
      input(`post-${i}`, { date: new Date(2026, 0, i + 1), updated: undefined })
    )
    const page2 = blogSitemap(createBlog(inputs, authors, options), env).find(
      (entry) => entry.url === "https://blog.example.com/page/2"
    )
    // The newest post is "post-24" (2026-01-25); none of these have an `updated`.
    expect(page2?.lastModified).toEqual(new Date(2026, 0, 25))
  })
})

describe("blogSitemap in two languages", () => {
  const english = (slug: string, overrides: Partial<PostInput["frontmatter"]> = {}) =>
    input(slug, { locale: "en", tags: ["leadership"], ...overrides })

  test("English posts, tags and authors sit under /en; each index has its own lastModified", () => {
    const blog = createBlog(
      [
        input("hej", { date: new Date("2026-03-01"), updated: undefined }),
        english("en-hello", { date: new Date("2026-05-01"), updated: undefined }),
      ],
      authors,
      options
    )
    const entries = blogSitemap(blog, env)
    const urls = entries.map((entry) => entry.url)
    expect(urls).toContain("https://blog.example.com/en/hello")
    expect(urls).toContain("https://blog.example.com/en/tags/leadership")
    expect(urls).toContain("https://blog.example.com/en/authors/team")
    expect(urls).not.toContain("https://blog.example.com/en-hello")
    const at = (url: string) => entries.find((entry) => entry.url === url)?.lastModified
    expect(at("https://blog.example.com/")).toEqual(new Date("2026-03-01"))
    expect(at("https://blog.example.com/en")).toEqual(new Date("2026-05-01"))
  })

  test("the indexes and a translated post carry hreflang alternates", () => {
    const blog = createBlog(
      [input("hej"), english("en-hello", { translationOf: "hej" }), input("ensam")],
      authors,
      options
    )
    const entries = blogSitemap(blog, env)
    const find = (url: string) => entries.find((entry) => entry.url === url)
    expect(find("https://blog.example.com/")?.alternates?.languages).toEqual({
      sv: "https://blog.example.com/",
      en: "https://blog.example.com/en",
      "x-default": "https://blog.example.com/",
    })
    expect(find("https://blog.example.com/hej")?.alternates?.languages).toEqual({
      sv: "https://blog.example.com/hej",
      en: "https://blog.example.com/en/hello",
      "x-default": "https://blog.example.com/hej",
    })
    expect(find("https://blog.example.com/en/hello")?.alternates?.languages?.["x-default"]).toBe(
      "https://blog.example.com/hej"
    )
    expect(find("https://blog.example.com/ensam")?.alternates).toBeUndefined()
  })
})
