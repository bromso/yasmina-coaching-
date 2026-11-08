import { describe, expect, test } from "bun:test"
import type { FeedEntry, FeedSite } from "./feeds"
import { atomFeed, jsonFeed, rssFeed } from "./feeds"
import type { Post } from "./posts"

const site: FeedSite = {
  title: "The Blog",
  description: "Posts about things",
  url: "http://blog.brand.localhost:3009",
}

function post(overrides: Partial<Post> = {}): Post {
  return {
    slug: "example",
    url: "/example",
    title: "Example post",
    description: "An example",
    date: new Date("2026-01-01T00:00:00Z"),
    author: "jane",
    tags: ["bun"],
    type: "Blog Post",
    locale: "en",
    readingMinutes: 3,
    ...overrides,
  }
}

function entry(overrides: Partial<FeedEntry> = {}): FeedEntry {
  return { post: post(), html: "<p>Hello</p>", authorName: "Jane Doe", ...overrides }
}

/**
 * Bun has no DOMParser. A small well-formedness check: strip CDATA sections (their content is
 * exempt from escaping), then confirm no bare `&` remains outside the five entities, and that
 * every tag opens and closes in a stack-balanced order.
 */
function assertWellFormedXml(xml: string) {
  const withoutCdata = xml.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, "")
  expect(withoutCdata).not.toMatch(/&(?!amp;|lt;|gt;|quot;|apos;)/)

  const stack: string[] = []
  const tagPattern = /<(\/?)([a-zA-Z0-9:_-]+)([^>]*?)(\/?)>/g
  let match: RegExpExecArray | null
  // biome-ignore lint/suspicious/noAssignInExpressions: a standard regex-exec loop
  while ((match = tagPattern.exec(withoutCdata))) {
    const [, closing, name, , selfClosing] = match
    if (selfClosing) continue
    if (closing) {
      const top = stack.pop()
      expect(top).toBe(name)
    } else if (name) {
      stack.push(name)
    }
  }
  expect(stack).toEqual([])
}

/** The last `<tag>…</tag>` in the document (the entry/item's, after the feed-level one). */
function extractTagText(xml: string, tag: string): string {
  const matches = [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`, "g"))]
  const last = matches.at(-1)
  expect(last).toBeDefined()
  return (last?.[1] ?? "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
}

const TRICKY_TITLE = `& < > " '`

describe("rssFeed", () => {
  test("is well-formed and round-trips a tricky title", () => {
    const xml = rssFeed(site, [entry({ post: post({ title: TRICKY_TITLE }) })])
    assertWellFormedXml(xml)
    expect(extractTagText(xml, "title")).toBe(TRICKY_TITLE)
  })

  test("wraps content:encoded in CDATA, splitting a ]]> inside html", () => {
    const xml = rssFeed(site, [entry({ html: "<p>a]]>b</p>" })])
    assertWellFormedXml(xml)
    expect(xml).not.toContain("]]>b</p>]]>")
    expect(xml).toContain("<content:encoded>")
  })

  test("zero entries yields a valid empty feed", () => {
    const xml = rssFeed(site, [])
    assertWellFormedXml(xml)
    expect(xml).not.toContain("<item>")
  })

  test("declares the content namespace and a self-referencing atom:link", () => {
    const xml = rssFeed(site, [])
    expect(xml).toContain('xmlns:content="http://purl.org/rss/1.0/modules/content/"')
    expect(xml).toContain('xmlns:atom="http://www.w3.org/2005/Atom"')
    expect(xml).toContain(
      '<atom:link href="http://blog.brand.localhost:3009/rss.xml" rel="self" type="application/rss+xml"/>'
    )
  })

  test("joins a site.url ending in / without doubling the slash", () => {
    const xml = rssFeed({ ...site, url: "http://blog.brand.localhost:3009/" }, [entry()])
    expect(xml).toContain("<link>http://blog.brand.localhost:3009/example</link>")
    expect(xml).toContain(
      '<atom:link href="http://blog.brand.localhost:3009/rss.xml" rel="self" type="application/rss+xml"/>'
    )
    expect(xml).not.toContain("//example")
    expect(xml).not.toContain("//rss.xml")
  })

  test("strips C0 control characters other than tab, LF and CR from text", () => {
    const xml = rssFeed(site, [entry({ post: post({ title: "Bad\u0000Title\u0007" }) })])
    assertWellFormedXml(xml)
    expect(extractTagText(xml, "title")).toBe("BadTitle")
  })
})

describe("atomFeed", () => {
  test("is well-formed and round-trips a tricky title", () => {
    const xml = atomFeed(site, [entry({ post: post({ title: TRICKY_TITLE }) })])
    assertWellFormedXml(xml)
    expect(extractTagText(xml, "title")).toBe(TRICKY_TITLE)
  })

  test("wraps content in CDATA, splitting a ]]> inside html", () => {
    const xml = atomFeed(site, [entry({ html: "<p>a]]>b</p>" })])
    assertWellFormedXml(xml)
    expect(xml).not.toContain("]]>b</p>]]>")
    expect(xml).toContain('<content type="html">')
  })

  test("zero entries yields a valid empty feed", () => {
    const xml = atomFeed(site, [])
    assertWellFormedXml(xml)
    expect(xml).not.toContain("<entry>")
  })

  test("has a self link and an alternate html link", () => {
    const xml = atomFeed(site, [])
    assertWellFormedXml(xml)
    expect(xml).toContain(
      '<link rel="alternate" type="text/html" href="http://blog.brand.localhost:3009"/>'
    )
    expect(xml).toContain(
      '<link rel="self" type="application/atom+xml" href="http://blog.brand.localhost:3009/atom.xml"/>'
    )
  })

  test("joins a site.url ending in / without doubling the slash", () => {
    const xml = atomFeed({ ...site, url: "http://blog.brand.localhost:3009/" }, [])
    expect(xml).toContain(
      '<link rel="self" type="application/atom+xml" href="http://blog.brand.localhost:3009/atom.xml"/>'
    )
    expect(xml).not.toContain("//atom.xml")
  })

  test("an empty feed's updated time falls back to site.updated", () => {
    const updated = new Date("2026-03-01T00:00:00Z")
    const xml = atomFeed({ ...site, updated }, [])
    expect(xml).toContain(`<updated>${updated.toISOString()}</updated>`)
  })

  test("non-empty entries are unaffected by site.updated", () => {
    const siteUpdated = new Date("2020-01-01T00:00:00Z")
    const postDate = new Date("2026-05-01T00:00:00Z")
    const xml = atomFeed({ ...site, updated: siteUpdated }, [
      entry({ post: post({ date: postDate }) }),
    ])
    const feedUpdated = xml.match(/<updated>([^<]*)<\/updated>/)?.[1]
    expect(feedUpdated).toBe(postDate.toISOString())
  })
})

describe("jsonFeed", () => {
  test("parses back with version https://jsonfeed.org/version/1.1", () => {
    const json = jsonFeed(site, [entry()])
    const parsed = JSON.parse(json)
    expect(parsed.version).toBe("https://jsonfeed.org/version/1.1")
    expect(parsed.items).toHaveLength(1)
    expect(parsed.items[0].title).toBe("Example post")
  })

  test("zero entries yields a valid empty feed", () => {
    const json = jsonFeed(site, [])
    const parsed = JSON.parse(json)
    expect(parsed.items).toEqual([])
  })

  test("a tricky title round-trips raw through JSON", () => {
    const json = jsonFeed(site, [entry({ post: post({ title: TRICKY_TITLE }) })])
    const parsed = JSON.parse(json)
    expect(parsed.items[0].title).toBe(TRICKY_TITLE)
  })

  test("each item carries an authors array alongside author", () => {
    const json = jsonFeed(site, [entry({ authorName: "Jane Doe" })])
    const item = JSON.parse(json).items[0]
    expect(item.author).toEqual({ name: "Jane Doe" })
    expect(item.authors).toEqual([{ name: "Jane Doe" }])
  })

  test("joins a site.url ending in / without doubling the slash", () => {
    const json = jsonFeed({ ...site, url: "http://blog.brand.localhost:3009/" }, [entry()])
    const parsed = JSON.parse(json)
    expect(parsed.feed_url).toBe("http://blog.brand.localhost:3009/feed.json")
    expect(parsed.items[0].url).toBe("http://blog.brand.localhost:3009/example")
  })
})

describe("a feed for one language under a path", () => {
  const english: FeedSite = { ...site, path: "/en", language: "en" }
  const entries = [entry({ post: post({ url: "/en/example" }) })]

  test("RSS links home and self under the path and names the language", () => {
    const xml = rssFeed(english, entries)
    assertWellFormedXml(xml)
    expect(xml).toContain("<link>http://blog.brand.localhost:3009/en</link>")
    expect(xml).toContain('href="http://blog.brand.localhost:3009/en/rss.xml" rel="self"')
    expect(xml).toContain("<language>en</language>")
    expect(xml).toContain("<link>http://blog.brand.localhost:3009/en/example</link>")
  })

  test("Atom carries xml:lang and the path's home and self links", () => {
    const xml = atomFeed(english, entries)
    assertWellFormedXml(xml)
    expect(xml).toContain('<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">')
    expect(xml).toContain('href="http://blog.brand.localhost:3009/en/atom.xml"')
    expect(xml).toContain(
      '<link rel="alternate" type="text/html" href="http://blog.brand.localhost:3009/en"/>'
    )
  })

  test("JSON Feed names the language and the path's urls", () => {
    const feed = JSON.parse(jsonFeed(english, entries))
    expect(feed.language).toBe("en")
    expect(feed.home_page_url).toBe("http://blog.brand.localhost:3009/en")
    expect(feed.feed_url).toBe("http://blog.brand.localhost:3009/en/feed.json")
  })

  test("without a language, none is written", () => {
    expect(rssFeed(site, entries)).not.toContain("<language>")
    expect(JSON.parse(jsonFeed(site, entries)).language).toBeUndefined()
  })
})
