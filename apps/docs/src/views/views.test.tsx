import { describe, expect, test } from "bun:test"
import { DocsSearch } from "@repo/ui/blocks/docs-search"
import type { DocsNavNode } from "@repo/ui/blocks/docs-sidebar"
import { renderToStaticMarkup } from "react-dom/server"
import { editUrlFor } from "@/lib/edit-url"
import { AllPagesView } from "./all-pages-view"
import { DocView, type DocViewProps } from "./doc-view"

const nav: DocsNavNode[] = [
  { type: "page", title: "Documentation", href: "/" },
  { type: "separator", title: "Start here" },
  { type: "page", title: "Getting started", href: "/getting-started" },
  {
    type: "folder",
    title: "Guides",
    href: "/guides",
    children: [{ type: "page", title: "Deploying", href: "/guides/deploying" }],
  },
]

/** The search control the pages pass, without the router (`Search` wraps this with
 * `router.push`): server-rendered, it is the no-JavaScript link to `/all`. */
const search = (
  <DocsSearch
    fallbackHref="/all"
    query=""
    onQueryChange={() => {}}
    results={[]}
    onNavigate={() => {}}
  />
)

function Body() {
  return <p>The body.</p>
}

function renderDoc(props: Partial<DocViewProps> = {}): string {
  return renderToStaticMarkup(
    <DocView
      title="Getting started"
      description="Install and run."
      Body={Body}
      toc={[]}
      nav={nav}
      currentHref="/getting-started"
      search={search}
      breadcrumbs={[
        { title: "Docs", href: "/" },
        { title: "Getting started", href: "/getting-started" },
      ]}
      neighbours={{
        prev: { href: "/", title: "Documentation", label: "Previous" },
        next: { href: "/guides", title: "Guides", label: "Next" },
      }}
      {...props}
    />
  )
}

describe("DocView", () => {
  test("renders the title, description, body, breadcrumbs, sidebar and neighbours", () => {
    const html = renderDoc()
    expect(html).toContain("<h1")
    expect(html).toContain("Getting started</h1>")
    expect(html).toContain("Install and run.")
    expect(html).toContain("<p>The body.</p>")
    expect(html).toContain('aria-label="breadcrumb"')
    expect(html).toContain('aria-current="page"')
    expect(html).toContain('href="/guides/deploying"')
    expect(html).toContain("Previous")
    expect(html).toContain("Next")
  })

  test("the sidebar sits in a closed Menu disclosure on narrow screens", () => {
    const html = renderDoc()
    expect(html).toMatch(/<details class="[^"]*lg:hidden[^"]*"><summary[^>]*>Menu<\/summary>/)
  })

  test("the search control falls back to a plain link to /all", () => {
    expect(renderDoc()).toMatch(/<a [^>]*href="\/all"[^>]*>[\s\S]*?Search docs/)
  })

  test("no headings: no TOC nav and no empty aside", () => {
    const html = renderDoc()
    expect(html).not.toContain('data-slot="toc"')
    expect(html).not.toContain('aria-label="On this page"')
    expect(html).not.toContain('data-docs="toc"')
  })

  test("headings: a TOC aside", () => {
    const html = renderDoc({ toc: [{ title: "Install", url: "#install", depth: 2 }] })
    expect(html).toContain('data-docs="toc"')
    expect(html).toContain('href="#install"')
  })

  test("the TOC is wrapped in TocActive; the server render marks no section current", () => {
    const html = renderDoc({ toc: [{ title: "Install", url: "#install", depth: 2 }] })
    expect(html).toMatch(/data-slot="toc-active"[^>]*>\s*<nav data-slot="toc"/)
    expect(html).not.toContain('aria-current="location"')
  })

  test("Last updated only when `updated` is set, in UTC", () => {
    expect(renderDoc()).not.toContain("Last updated")
    const html = renderDoc({ updated: new Date("2026-10-01T23:30:00Z") })
    expect(html).toContain('Last updated <time dateTime="2026-10-01">Oct 1, 2026</time>')
  })

  test("Edit on GitHub is absent without CONTENT_REPO_URL and links to the file with it", () => {
    expect(renderDoc({ editUrl: editUrlFor(undefined, "getting-started.mdx") })).not.toContain(
      "Edit on GitHub"
    )
    const editUrl = editUrlFor(
      "https://github.com/acme/repo/blob/main/apps/docs/content/docs",
      "guides/deploying.mdx"
    )
    const html = renderDoc({ editUrl })
    expect(html).toContain(
      'href="https://github.com/acme/repo/blob/main/apps/docs/content/docs/guides/deploying.mdx"'
    )
    expect(html).toContain("Edit on GitHub")
  })
})

describe("editUrlFor", () => {
  test("joins the repo URL and the file path with one slash", () => {
    expect(editUrlFor("https://x.test/docs/", "a.mdx")).toBe("https://x.test/docs/a.mdx")
    expect(editUrlFor("https://x.test/docs", "/a.mdx")).toBe("https://x.test/docs/a.mdx")
    expect(editUrlFor("https://x.test/docs", "g/a.mdx")).toBe("https://x.test/docs/g/a.mdx")
  })

  test("unset or blank is no link", () => {
    expect(editUrlFor(undefined, "a.mdx")).toBeUndefined()
    expect(editUrlFor("  ", "a.mdx")).toBeUndefined()
  })
})

describe("AllPagesView", () => {
  test("lists every page under its section, with its description, as plain links", () => {
    const html = renderToStaticMarkup(
      <AllPagesView
        nav={nav}
        search={search}
        sections={[
          { pages: [{ href: "/", title: "Documentation", description: "Where to start." }] },
          {
            title: "Start here",
            pages: [
              { href: "/getting-started", title: "Getting started", description: "Install." },
            ],
          },
          {
            title: "Guides",
            pages: [
              { href: "/guides", title: "Guides", description: "Every guide." },
              { href: "/guides/deploying", title: "Deploying", description: "Ship it." },
            ],
          },
        ]}
      />
    )
    expect(html).toContain("All pages</h1>")
    for (const heading of ["Start here", "Guides"]) expect(html).toContain(`${heading}</h2>`)
    for (const [href, description] of [
      ["/", "Where to start."],
      ["/getting-started", "Install."],
      ["/guides", "Every guide."],
      ["/guides/deploying", "Ship it."],
    ]) {
      expect(html).toContain(`href="${href}"`)
      expect(html).toContain(description as string)
    }
    // Sidebar order: Start here before Guides.
    expect(html.indexOf("Start here</h2>")).toBeLessThan(html.indexOf("Guides</h2>"))
  })
})
