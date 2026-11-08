import { describe, expect, test } from "bun:test"
import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { renderToStaticMarkup } from "react-dom/server"
import { UI } from "@/content/ui"
import { AuthorView } from "./author-view"
import { PostListView } from "./post-list-view"
import { PostView, type PostViewProps } from "./post-view"
import { TagView } from "./tag-view"

const authors: Record<string, Author> = {
  team: { name: "The team", bio: "The people building this.", avatar: "/authors/team.svg" },
}

function post(slug: string, overrides: Partial<Post> = {}): Post {
  return {
    slug,
    url: `/${slug}`,
    title: `Post ${slug}`,
    description: `About ${slug}.`,
    date: new Date("2026-10-01"),
    author: "team",
    tags: ["guides"],
    type: "Blog Post",
    locale: "sv",
    readingMinutes: 2,
    ...overrides,
  }
}

function Body() {
  return <p>The body.</p>
}

function renderPost(props: Partial<PostViewProps> = {}): string {
  return renderToStaticMarkup(
    <PostView
      post={post("hello")}
      author={authors.team as Author}
      url="https://blog.example.com/hello"
      Body={Body}
      toc={[]}
      neighbours={{}}
      related={[]}
      authors={authors}
      ui={UI.en}
      prefix=""
      ctaHref="https://www.example.com/#contact"
      {...props}
    />
  )
}

/** The text of every `<script type="application/ld+json">` in the markup. */
function jsonLdScripts(html: string): string[] {
  return [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(
    (match) => match[1] ?? ""
  )
}

describe("PostListView", () => {
  test("shows an empty state with no posts", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[]} page={1} pages={1} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).toContain("No posts yet.")
    expect(html).not.toContain('data-slot="post-card"')
  })

  test("marks the first card featured on page 1, and only that one", () => {
    const html = renderToStaticMarkup(
      <PostListView
        posts={[post("a"), post("b")]}
        page={1}
        pages={1}
        authors={authors}
        ui={UI.en}
        prefix=""
      />
    )
    expect(html.match(/data-featured/g)).toHaveLength(1)
    expect(html.indexOf("data-featured")).toBeLessThan(html.indexOf("Post b"))
  })

  test("features nothing past page 1", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={2} pages={2} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).not.toContain("data-featured")
  })

  test("links the cards to their post, tags and author", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={1} pages={1} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).toContain('href="/a"')
    expect(html).toContain('href="/tags/guides"')
    expect(html).toContain("The team")
    expect(html).toContain('src="/authors/team.svg"')
  })

  test("card titles are h2s under the page's h1", () => {
    const html = renderToStaticMarkup(
      <PostListView
        posts={[post("a"), post("b")]}
        page={1}
        pages={1}
        authors={authors}
        ui={UI.en}
        prefix=""
      />
    )
    expect(html.match(/<h1/g)).toHaveLength(1)
    expect(html.match(/<h2[^>]*><a href="\/(a|b)"/g)).toHaveLength(2)
  })

  test("an author without an avatar gets initials, not an empty image", () => {
    const noAvatar = { team: { name: "The team", bio: "Bio.", avatar: "" } }
    const html = renderToStaticMarkup(
      <PostListView
        posts={[post("a")]}
        page={1}
        pages={1}
        authors={noAvatar}
        ui={UI.en}
        prefix=""
      />
    )
    expect(html).not.toContain("<img")
    expect(html).toContain("TT")
  })

  test("has no pagination with one page", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={1} pages={1} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).not.toContain("Newer posts")
    expect(html).not.toContain("Older posts")
  })

  test("page 1 of 3 links to older posts only", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={1} pages={3} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).not.toContain("Newer posts")
    expect(html).toMatch(/href="\/page\/2"[^>]*>Older posts/)
  })

  test("page 2 links newer posts to / and older to page 3", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={2} pages={3} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).toMatch(/href="\/"[^>]*>Newer posts/)
    expect(html).toMatch(/href="\/page\/3"[^>]*>Older posts/)
  })

  test("the last page links newer posts to the page before and has no older link", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={3} pages={3} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).toMatch(/href="\/page\/2"[^>]*>Newer posts/)
    expect(html).not.toContain("Older posts")
  })
})

describe("TagView and AuthorView", () => {
  test("a tag page is headed with the tag and features nothing", () => {
    const html = renderToStaticMarkup(
      <TagView tag="guides" posts={[post("a"), post("b")]} authors={authors} ui={UI.en} prefix="" />
    )
    expect(html).toContain("<h1")
    expect(html).toContain("Posts about guides")
    expect(html).not.toContain("data-featured")
    expect(html).toContain('href="/a"')
  })

  test("an author page is headed with the author's name and bio", () => {
    const html = renderToStaticMarkup(
      <AuthorView
        author={authors.team as Author}
        posts={[post("a")]}
        authors={authors}
        ui={UI.en}
        prefix=""
      />
    )
    expect(html).toMatch(/<h1[^>]*>The team<\/h1>/)
    expect(html).toContain("The people building this.")
    expect(html).not.toContain("data-featured")
  })
})

describe("PostView", () => {
  test("renders the header, the body and links the author and tags", () => {
    const html = renderPost()
    expect(html).toMatch(/<h1[^>]*>Post hello<\/h1>/)
    expect(html).toContain("<p>The body.</p>")
    expect(html).toContain('href="/authors/team"')
    expect(html).toContain('href="/tags/guides"')
  })

  test("without headings: no table of contents and no aside", () => {
    const html = renderPost({ toc: [] })
    expect(html).not.toContain('aria-label="On this page"')
    expect(html).not.toContain("<aside")
  })

  test("with headings: a table of contents in an aside", () => {
    const html = renderPost({ toc: [{ title: "Intro", url: "#intro", depth: 2 }] })
    expect(html).toContain("<aside")
    expect(html).toMatch(/<aside[\s\S]*aria-label="On this page"[\s\S]*<\/aside>/)
    expect(html).toContain('href="#intro"')
    expect(html).toMatch(/data-slot="toc-active"[^>]*>\s*<nav data-slot="toc"/)
    expect(html).not.toContain('aria-current="location"')
  })

  test("emits BlogPosting JSON-LD that cannot close its script tag", () => {
    const html = renderPost({ post: post("hello", { title: "Bad </script><b>x</b>" }) })
    const scripts = jsonLdScripts(html)
    expect(scripts).toHaveLength(1)
    const json = scripts[0] ?? ""
    expect(json).not.toContain("<")
    const data = JSON.parse(json)
    expect(data["@type"]).toBe("BlogPosting")
    expect(data.headline).toBe("Bad </script><b>x</b>")
    expect(data.url).toBe("https://blog.example.com/hello")
  })

  test("links the newer post as Newer and the older one as Older", () => {
    const html = renderPost({
      neighbours: { newer: post("newer"), older: post("older") },
    })
    expect(html).toMatch(/href="\/newer"[\s\S]*?Newer[\s\S]*?Post newer/)
    expect(html).toMatch(/href="\/older"[\s\S]*?Older[\s\S]*?Post older/)
  })

  test("hides the related row when there are no related posts", () => {
    const html = renderPost({ related: [] })
    expect(html).not.toContain("Read on")
  })

  test("shows related posts as cards, none featured", () => {
    const html = renderPost({ related: [post("r1"), post("r2")] })
    expect(html).toContain("Read on")
    expect(html.match(/data-slot="post-card"/g)).toHaveLength(2)
    // Under the section's h2, the cards' titles are h3s.
    expect(html).toMatch(/<h2[^>]*>Read on<\/h2>/)
    expect(html.match(/<h3[^>]*><a href="\/r[12]"/g)).toHaveLength(2)
    expect(html).not.toContain("data-featured")
  })
})

describe("the coaching look and the two languages", () => {
  test("the index opens on the sun hero; a further page and a tag page do not", () => {
    const index = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={1} pages={2} authors={authors} ui={UI.sv} prefix="" />
    )
    expect(index).toMatch(/<h1[^>]*>Anteckningar om ledarskap<\/h1>/)
    expect(index).toContain("bg-sun")
    expect(index).toContain("rounded-4xl")
    const page2 = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={2} pages={2} authors={authors} ui={UI.sv} prefix="" />
    )
    expect(page2).not.toContain("bg-sun")
    expect(page2).toContain("Inlägg, sida 2")
  })

  test("Swedish cards read Swedish; English cards link tags and pages under /en", () => {
    const sv = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={1} pages={2} authors={authors} ui={UI.sv} prefix="" />
    )
    expect(sv).toContain("2 min läsning")
    expect(sv).toContain("Äldre inlägg")
    const en = renderToStaticMarkup(
      <PostListView
        posts={[post("en-a", { url: "/en/a", locale: "en" })]}
        page={1}
        pages={2}
        authors={authors}
        ui={UI.en}
        prefix="/en"
      />
    )
    expect(en).toContain('href="/en/a"')
    expect(en).toContain('href="/en/tags/guides"')
    expect(en).toMatch(/href="\/en\/page\/2"[^>]*>Older posts/)
  })

  test("a post closes with the booking call to action and links its author under its prefix", () => {
    const html = renderPost({ ui: UI.sv, prefix: "" })
    expect(html).toContain("Be om ett kostnadsfritt introsamtal")
    expect(html).toContain('href="https://www.example.com/#contact"')
    const en = renderPost({
      post: post("en-hello", { url: "/en/hello", locale: "en" }),
      prefix: "/en",
    })
    expect(en).toContain('href="/en/authors/team"')
  })

  test("a media cover is a WebP-first picture in a rounded frame", () => {
    const html = renderPost({
      post: post("hello", { cover: { src: "/media/session-lounge-800.jpg", alt: "Ett samtal" } }),
    })
    expect(html).toContain('data-slot="post-cover"')
    expect(html).toContain('srcSet="/media/session-lounge-800.webp"')
    expect(html).toContain('src="/media/session-lounge-800.jpg"')
    expect(html).toContain('width="800" height="597"')
    expect(html).toContain('alt="Ett samtal"')
  })

  test("the BlogPosting JSON-LD names the post's language", () => {
    const data = JSON.parse(jsonLdScripts(renderPost())[0] ?? "{}")
    expect(data.inLanguage).toBe("sv")
  })

  test("a www: link in the body resolves to www's address", () => {
    function LinkingBody({ components }: { components?: Record<string, unknown> }) {
      const A = (components?.a ?? "a") as "a"
      return (
        <p>
          <A href="www:/book">Boka</A>
        </p>
      )
    }
    const html = renderPost({ Body: LinkingBody })
    expect(html).toContain('href="http://www.brand.localhost:3000/book"')
  })
})

describe("tag labels", () => {
  test("cards, the post header and the tag page show a tag's label, linked by its slug", () => {
    const tagged = post("a", { tags: ["aterhamtning", "okand"] })
    const list = renderToStaticMarkup(
      <PostListView posts={[tagged]} page={2} pages={2} authors={authors} ui={UI.sv} prefix="" />
    )
    expect(list).toMatch(/href="\/tags\/aterhamtning"[^>]*>återhämtning</)
    expect(list).toMatch(/href="\/tags\/okand"[^>]*>okand</)
    const header = renderPost({ post: tagged, ui: UI.sv })
    expect(header).toMatch(/href="\/tags\/aterhamtning"[^>]*>återhämtning</)
    const tagPage = renderToStaticMarkup(
      <TagView tag="from-within" posts={[tagged]} authors={authors} ui={UI.en} prefix="/en" />
    )
    expect(tagPage).toMatch(/<h1[^>]*>Posts about Leading from within<\/h1>/)
  })
})

describe("cards with covers", () => {
  const covered = (slug: string) =>
    post(slug, { cover: { src: "/media/session-lounge-800.jpg", alt: `Photo for ${slug}` } })

  test("each card shows its cover lazily, WebP first, with its size and alt", () => {
    const html = renderToStaticMarkup(
      <PostListView
        posts={[covered("a"), covered("b")]}
        page={1}
        pages={1}
        authors={authors}
        ui={UI.sv}
        prefix=""
      />
    )
    expect(html.match(/data-slot="post-card-media"/g)).toHaveLength(2)
    expect(html).toContain('srcSet="/media/session-lounge-800.webp"')
    expect(html).toMatch(
      /<img src="\/media\/session-lounge-800.jpg" alt="Photo for b" width="800" height="597" loading="lazy"/
    )
  })

  test("the featured card is on sun-soft with a larger image; the others keep the card ground", () => {
    const html = renderToStaticMarkup(
      <PostListView
        posts={[covered("a"), covered("b")]}
        page={1}
        pages={1}
        authors={authors}
        ui={UI.sv}
        prefix=""
      />
    )
    const [featured, other] = html.split('data-slot="post-card"').slice(1)
    expect(featured).toContain("bg-sun-soft")
    expect(featured).not.toContain("bg-primary/5")
    expect(featured).toContain("md:aspect-[2/1]")
    expect(other).not.toContain("bg-sun-soft")
  })

  test("a post without a cover gets no image frame", () => {
    const html = renderToStaticMarkup(
      <PostListView posts={[post("a")]} page={2} pages={2} authors={authors} ui={UI.sv} prefix="" />
    )
    expect(html).not.toContain("post-card-media")
  })
})
