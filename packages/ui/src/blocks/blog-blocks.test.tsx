import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PostCard } from "./post-card"
import { PostHeader } from "./post-header"
import { PrevNext } from "./prev-next"
import { Toc } from "./toc"
import { TocActive } from "./toc-active"

const author = { name: "Ada Lovelace", avatar: "/ada.png" }
const tags = [
  { tag: "typescript", href: "/tags/typescript" },
  { tag: "react", href: "/tags/react" },
]

describe("PostCard", () => {
  test("renders the post's time element and reading-time text", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/blog/hello-world"
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={author}
        tags={tags}
      />
    )
    expect(html).toContain('<time dateTime="2026-10-07"')
    expect(html).toContain("3 min read")
    expect(html).toContain("Hello, world")
    expect(html).toContain('href="/blog/hello-world"')
    expect(html).toContain("typescript")
    expect(html).toContain("react")
    expect(html).toContain("Ada Lovelace")
  })

  test("is a stretched link: exactly one post link plus the tag links, with no nested anchors", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/blog/hello-world"
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={author}
        tags={tags}
      />
    )
    // Exactly one anchor per tag plus the title's stretched link — no extra, no missing.
    expect((html.match(/<a /g) ?? []).length).toBe(1 + tags.length)
    expect(html).toContain('<a href="/blog/hello-world"')
    for (const t of tags) {
      expect(html).toContain(`<a href="${t.href}"`)
    }
    // The title anchor carries the stretched-link overlay...
    expect(html).toContain("after:absolute after:inset-0")
    // ...and nothing nests inside it (no "<a " between its opening and its own closing tag).
    const open = html.indexOf('<a href="/blog/hello-world"')
    const close = html.indexOf("</a>", open)
    expect(html.slice(open + 1, close)).not.toContain("<a ")
  })

  test("featured posts get a Featured badge", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/blog/hello-world"
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={author}
        tags={[]}
        featured
      />
    )
    expect(html).toContain("Featured")
  })

  test("the title is an h2 holding the stretched link by default, an h3 on request", () => {
    const props = {
      href: "/blog/hello-world",
      title: "Hello, world",
      description: "A first post.",
      date: new Date("2026-10-07"),
      readingMinutes: 3,
      author,
      tags: [],
    }
    const h2 = renderToStaticMarkup(<PostCard {...props} />)
    expect(h2).toMatch(/<h2[^>]*><a href="\/blog\/hello-world"[^>]*>Hello, world<\/a><\/h2>/)
    expect(h2).not.toContain("<h3")

    const h3 = renderToStaticMarkup(<PostCard {...props} headingAs="h3" />)
    expect(h3).toMatch(/<h3[^>]*><a href="\/blog\/hello-world"[^>]*>Hello, world<\/a><\/h3>/)
    expect(h3).not.toContain("<h2")
  })

  test("an author without an avatar shows initials and no image", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/blog/hello-world"
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={{ name: "Grace Hopper" }}
        tags={[]}
      />
    )
    expect(html).not.toContain("<img")
    expect(html).toContain("GH")
  })
})

describe("PostHeader", () => {
  test("renders title, description, date, reading time and the author link", () => {
    const html = renderToStaticMarkup(
      <PostHeader
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={5}
        author={{ ...author, href: "/authors/ada" }}
        tags={tags}
      />
    )
    expect(html).toContain('<time dateTime="2026-10-07"')
    expect(html).toContain("5 min read")
    expect(html).toMatch(/<h1[^>]*>Hello, world<\/h1>/)
    expect(html).toContain("A first post.")
    expect(html).toContain('href="/authors/ada"')
  })

  test("renders an updated time when given, and the cover image", () => {
    const html = renderToStaticMarkup(
      <PostHeader
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        updated={new Date("2026-10-08")}
        readingMinutes={5}
        author={{ ...author, href: "/authors/ada" }}
        tags={tags}
        cover={{ src: "/cover.png", alt: "Cover" }}
      />
    )
    expect(html).toContain('<time dateTime="2026-10-08"')
    expect(html).toContain('src="/cover.png"')
    expect(html).toContain('alt="Cover"')
  })
})

describe("Toc", () => {
  test("returns null for an empty list", () => {
    expect(Toc({ items: [] })).toBeNull()
  })

  test("renders a nav labelled On this page and nests depth-3 items under depth-2", () => {
    const html = renderToStaticMarkup(
      <Toc
        items={[
          { title: "Intro", url: "#intro", depth: 2 },
          { title: "Details", url: "#details", depth: 3 },
          { title: "Next", url: "#next", depth: 2 },
        ]}
      />
    )
    expect(html).toContain('aria-label="On this page"')
    const introIndex = html.indexOf('href="#intro"')
    const detailsIndex = html.indexOf('href="#details"')
    const nextIndex = html.indexOf('href="#next"')
    expect(introIndex).toBeGreaterThan(-1)
    expect(detailsIndex).toBeGreaterThan(introIndex)
    expect(detailsIndex).toBeLessThan(nextIndex)
  })
})

describe("TocActive", () => {
  test("the server render is the plain Toc inside a wrapper, with no section marked current", () => {
    const items = [
      { title: "Intro", url: "#intro", depth: 2 },
      { title: "Next", url: "#next", depth: 2 },
    ]
    const plain = renderToStaticMarkup(<Toc items={items} />)
    const html = renderToStaticMarkup(
      <TocActive>
        <Toc items={items} />
      </TocActive>
    )
    expect(html).toMatch(/^<div data-slot="toc-active" class="[^"]*">/)
    expect(html).toContain(plain)
    expect(html).not.toContain(`aria-current="`)
  })
})

describe("PrevNext", () => {
  test("renders nothing with neither link", () => {
    expect(renderToStaticMarkup(<PrevNext />)).toBe("")
  })

  test("renders only the given side", () => {
    const html = renderToStaticMarkup(<PrevNext prev={{ href: "/a", title: "A" }} />)
    expect(html).toContain('href="/a"')
    expect(html).toContain(">A<")
  })

  test("renders both links with their titles", () => {
    const html = renderToStaticMarkup(
      <PrevNext prev={{ href: "/a", title: "A" }} next={{ href: "/b", title: "B" }} />
    )
    expect(html).toContain('href="/a"')
    expect(html).toContain('href="/b"')
    expect(html).toContain(">A<")
    expect(html).toContain(">B<")
  })
})

describe("the blog blocks in another language", () => {
  test("PostCard takes its words, date locale and classes as props", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/hej"
        title="Hej"
        description="Ett första inlägg."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={author}
        tags={[]}
        featured
        featuredLabel="Utvald"
        readingTime="3 min läsning"
        dateLocale="sv-SE"
        className="rounded-3xl"
        titleClassName="font-display"
      />
    )
    expect(html).toContain("Utvald")
    expect(html).not.toContain("Featured")
    expect(html).toContain("3 min läsning")
    expect(html).toContain("7 okt. 2026")
    expect(html).toContain("rounded-3xl")
    expect(html).toMatch(/<h2[^>]*class="[^"]*font-display/)
  })

  test("PostHeader takes its words, date locale and classes as props", () => {
    const html = renderToStaticMarkup(
      <PostHeader
        title="Hej"
        description="Ett första inlägg."
        date={new Date("2026-10-07")}
        updated={new Date("2026-10-08")}
        readingMinutes={5}
        author={{ ...author, href: "/authors/ada" }}
        tags={[]}
        updatedLabel="Uppdaterad"
        readingTime="5 min läsning"
        dateLocale="sv-SE"
        className="gap-8"
        titleClassName="font-display"
      />
    )
    expect(html).toContain("Uppdaterad")
    expect(html).not.toContain("Updated")
    expect(html).toContain("5 min läsning")
    expect(html).toContain("8 okt. 2026")
    expect(html).toMatch(/<header[^>]*class="[^"]*gap-8/)
    expect(html).toMatch(/<h1[^>]*class="[^"]*font-display/)
  })

  test("Toc's nav label follows navLabel", () => {
    const html = renderToStaticMarkup(
      <Toc
        items={[{ title: "Intro", url: "#intro", depth: 2 }]}
        label="På sidan"
        navLabel="På sidan"
      />
    )
    expect(html).toContain('aria-label="På sidan"')
  })
})
