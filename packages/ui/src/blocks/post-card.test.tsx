import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PageCard, PostCard } from "./post-card"

// The blog's cards, pinned to the byte: `PageCard` shares `PostCard`'s look, and sharing it must
// never change a blog card's markup. A change here is a visible change to the blog.
const PINNED_FULL =
  '<link rel="preload" as="image" href="/c.jpg"/><link rel="preload" as="image" href="/ada.png"/><article data-slot="post-card" data-size="default" class="text-card-foreground flex min-w-0 flex-col gap-6 border py-6 shadow-sm relative transition-colors hover:border-foreground/20 border-primary/40 bg-primary/5 overflow-hidden rounded-3xl" data-featured=""><div data-slot="post-card-media" class="-mt-6 overflow-hidden rounded-t-[inherit] bg-muted aspect-[3/2]"><img src="/c.jpg" alt=""/></div><div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"><span data-slot="badge" class="inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap shrink-0 [&amp;&gt;svg]:size-3 gap-1 [&amp;&gt;svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-primary text-primary-foreground [a&amp;]:hover:bg-primary/90 mb-2 w-fit">Utvald</span><h2 data-slot="card-title" class="font-semibold text-xl leading-none font-display"><a href="/blog/hello-world" class="after:absolute after:inset-0 hover:underline">Hello, world</a></h2><div data-slot="card-description" class="text-muted-foreground text-sm">A first post.</div></div><div data-slot="card-content" class="px-6 relative z-10 flex flex-wrap gap-2"><a href="/tags/typescript" data-slot="badge" class="inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&amp;&gt;svg]:size-3 gap-1 [&amp;&gt;svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden border-transparent bg-secondary text-secondary-foreground [a&amp;]:hover:bg-secondary/90">typescript</a></div><div data-slot="card-footer" class="px-6 [.border-t]:pt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span data-slot="avatar" class="relative flex shrink-0 overflow-hidden rounded-full size-6"><img src="/ada.png" alt="" width="24" height="24" class="aspect-square size-full object-cover"/></span><span>Ada Lovelace</span><span aria-hidden="true">\u00b7</span><time dateTime="2026-10-07">7 okt. 2026</time><span aria-hidden="true">\u00b7</span><span>3 min l\u00e4sning</span></div></article>'
const PINNED_BARE =
  '<article data-slot="post-card" data-size="default" class="bg-card text-card-foreground flex min-w-0 flex-col gap-6 border py-6 shadow-sm rounded-4xl relative transition-colors hover:border-foreground/20"><div data-slot="card-header" class="@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6"><h2 data-slot="card-title" class="font-semibold text-xl leading-none"><a href="/a" class="after:absolute after:inset-0 hover:underline">T</a></h2><div data-slot="card-description" class="text-muted-foreground text-sm">D</div></div><div data-slot="card-footer" class="px-6 [.border-t]:pt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground"><span data-slot="avatar" class="relative flex shrink-0 overflow-hidden rounded-full size-6"><span data-slot="avatar-fallback" class="bg-muted flex size-full items-center justify-center rounded-full text-[10px]">GH</span></span><span>Grace Hopper</span><span aria-hidden="true">\u00b7</span><time dateTime="2026-10-07">Oct 7, 2026</time><span aria-hidden="true">\u00b7</span><span>1 min read</span></div></article>'

describe("PostCard's markup", () => {
  test("a featured card with media, tags, an avatar and translated words", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/blog/hello-world"
        title="Hello, world"
        description="A first post."
        date={new Date("2026-10-07")}
        readingMinutes={3}
        author={{ name: "Ada Lovelace", avatar: "/ada.png" }}
        tags={[{ tag: "typescript", href: "/tags/typescript" }]}
        featured
        featuredLabel="Utvald"
        readingTime="3 min läsning"
        dateLocale="sv-SE"
        className="overflow-hidden rounded-3xl"
        titleClassName="font-display"
        media={<img src="/c.jpg" alt="" />}
        mediaClassName="aspect-[3/2]"
      />
    )
    expect(html).toBe(PINNED_FULL)
  })

  test("a bare card: no avatar, no tags, the default words", () => {
    const html = renderToStaticMarkup(
      <PostCard
        href="/a"
        title="T"
        description="D"
        date={new Date("2026-10-07")}
        readingMinutes={1}
        author={{ name: "Grace Hopper" }}
        tags={[]}
      />
    )
    expect(html).toBe(PINNED_BARE)
  })
})

describe("PageCard", () => {
  const html = renderToStaticMarkup(
    <PageCard
      href="/integritet"
      title="Integritet"
      description="Hur vi behandlar personuppgifter."
      date={new Date("2026-11-12")}
      dateLabel="Senast uppdaterad"
      dateLocale="sv-SE"
    />
  )

  test("is PostCard's card: the same look, the title a stretched heading link", () => {
    expect(html).toStartWith('<article data-slot="page-card"')
    expect(html).toContain("relative transition-colors hover:border-foreground/20")
    expect(html).toContain(
      '<h2 data-slot="card-title" class="font-semibold text-xl leading-none"><a href="/integritet" class="after:absolute after:inset-0 hover:underline">Integritet</a></h2>'
    )
    expect(html).toContain(
      '<div data-slot="card-description" class="text-muted-foreground text-sm">Hur vi behandlar personuppgifter.</div>'
    )
    expect((html.match(/<a /g) ?? []).length).toBe(1)
  })

  test("shows the labelled date and nothing a post has: no author, tags or reading time", () => {
    expect(html).toMatch(/Senast uppdaterad <time dateTime="2026-11-12">12 nov. 2026<\/time>/)
    expect(html).not.toContain('data-slot="avatar"')
    expect(html).not.toContain('data-slot="card-content"')
    expect(html).not.toContain("min read")
  })

  test("takes the heading level and the look's class names", () => {
    const h3 = renderToStaticMarkup(
      <PageCard
        href="/a"
        title="A"
        description="D"
        date={new Date("2026-11-12")}
        dateLabel="Last updated"
        headingAs="h3"
        className="rounded-3xl"
        titleClassName="font-display"
      />
    )
    expect(h3).toContain(
      '<h3 data-slot="card-title" class="font-semibold text-xl leading-none font-display">'
    )
    expect(h3).toContain("hover:border-foreground/20 rounded-3xl")
    expect(h3).toContain('Last updated <time dateTime="2026-11-12">Nov 12, 2026</time>')
  })
})
