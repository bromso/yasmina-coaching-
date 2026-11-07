import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Card, Cards } from "../components/mdx/cards"
import { Breadcrumbs } from "./breadcrumbs"
import {
  DEFAULT_DOCS_SEARCH_LABELS,
  DocsSearch,
  isPlainLeftClick,
  isSearchShortcut,
} from "./docs-search"
import { type DocsNavNode, DocsSidebar } from "./docs-sidebar"

/** The `<details ...>` opening tag's attributes for the folder whose toggle is labelled
 * `toggleLabel` (its sr-only "Toggle <title>" text) — found by locating that label, then
 * scanning backward for the nearest preceding `<details`. Robust to however many other folders
 * sit earlier in the markup (a plain "first `<details>` in the whole string" regex isn't: with
 * more than one folder, it always matches the first one, not necessarily the one actually
 * followed by this label). */
function detailsAttrsFor(html: string, toggleLabel: string): string | undefined {
  const labelIndex = html.indexOf(toggleLabel)
  if (labelIndex === -1) return undefined
  const start = html.lastIndexOf("<details", labelIndex)
  if (start === -1) return undefined
  const tagEnd = html.indexOf(">", start)
  return html.slice(start, tagEnd)
}

/** The full `<details>...</details>` block for the folder whose toggle is labelled
 * `toggleLabel`. */
function detailsBlockFor(html: string, toggleLabel: string): string | undefined {
  const labelIndex = html.indexOf(toggleLabel)
  if (labelIndex === -1) return undefined
  const start = html.lastIndexOf("<details", labelIndex)
  const end = html.indexOf("</details>", labelIndex)
  if (start === -1 || end === -1) return undefined
  return html.slice(start, end + "</details>".length)
}

describe("DocsSidebar", () => {
  const items: DocsNavNode[] = [
    { type: "separator", title: "Guides" },
    { type: "page", title: "Getting started", href: "/docs/getting-started" },
    {
      type: "folder",
      title: "Authentication",
      href: "/docs/authentication",
      children: [
        { type: "page", title: "OAuth", href: "/docs/authentication/oauth" },
        { type: "page", title: "Magic link", href: "/docs/authentication/magic-link" },
      ],
    },
    {
      type: "folder",
      title: "Architecture",
      children: [{ type: "page", title: "Overview", href: "/docs/architecture/overview" }],
    },
  ]

  test("renders a nav labelled Docs by default", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    expect(html).toContain('aria-label="Docs"')
  })

  test("a custom label overrides the default", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" label="On this site" />
    )
    expect(html).toContain('aria-label="On this site"')
  })

  test("renders a titled separator as a plain list item with a span, not a heading", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    expect(html).toMatch(/<li class="[^"]*"><span class="[^"]*">Guides<\/span><\/li>/)
    expect(html).not.toContain('role="presentation"')
    expect(html).not.toMatch(/<h[1-6][^>]*>Guides/)
  })

  test("a separator without a title renders as a semantic <hr>, not an empty presentation item", () => {
    const withBareSeparator: DocsNavNode[] = [
      { type: "separator" },
      { type: "page", title: "Getting started", href: "/docs/getting-started" },
    ]
    const html = renderToStaticMarkup(
      <DocsSidebar items={withBareSeparator} currentHref="/docs/getting-started" />
    )
    expect(html).toContain("<hr")
    expect(html).not.toContain('role="presentation"')
  })

  test("the current page link gets aria-current=page", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    expect(html).toMatch(/<a href="\/docs\/getting-started"[^>]*aria-current="page"/)
  })

  test("a folder containing the current page renders an open toggle", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/authentication/oauth" />
    )
    expect(detailsAttrsFor(html, "Toggle Authentication")).toContain("open")
  })

  test("a folder not containing the current page renders a closed toggle", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    // Architecture has no href, so its whole row is the summary — no "Toggle " prefix (see the
    // dedicated test below) — but "Architecture" alone still locates its own <details>.
    expect(detailsAttrsFor(html, "Architecture")).not.toContain("open")
    // Authentication isn't current here either — confirms the helper is actually distinguishing
    // folders, not just always finding the first <details> in the document.
    expect(detailsAttrsFor(html, "Toggle Authentication")).not.toContain("open")
  })

  test("a folder is open when its own index href is the current page", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/authentication" />
    )
    expect(detailsAttrsFor(html, "Toggle Authentication")).toContain("open")
    // ...and that index link itself is the current page.
    expect(html).toMatch(/<a href="\/docs\/authentication"[^>]*aria-current="page"/)
  })

  test("a folder without an href (Review Focus 1) renders its title as text, not a link", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    expect(html).not.toMatch(/<a[^>]*>Architecture<\/a>/)
    expect(html).toContain("Architecture")
  })

  test("a folder without an href has no 'Toggle' prefix — its title alone is the toggle's accessible name, with nothing to collide with", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    expect(html).not.toContain("Toggle Architecture")
  })

  test("a folder's link sits beside its <details>, so it stays visible even while the details is closed", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    // Authentication's own details is closed here (currentHref is elsewhere)...
    expect(detailsAttrsFor(html, "Toggle Authentication")).not.toContain("open")
    // ...yet its link is still rendered.
    expect(html).toContain('href="/docs/authentication"')
    // And that link isn't nested inside the <details> — the toggle's own block holds its sr-only
    // "Toggle <title>" text and (once open) the nested pages, not the folder's own href.
    const block = detailsBlockFor(html, "Toggle Authentication")
    expect(block).toBeDefined()
    expect(block).not.toContain('href="/docs/authentication"')
  })

  test("a folder's nested pages are inside its <details> again (native expand/collapse, not CSS)", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/authentication/oauth" />
    )
    const block = detailsBlockFor(html, "Toggle Authentication")
    expect(block).toContain('href="/docs/authentication/oauth"')
    expect(block).toContain('href="/docs/authentication/magic-link"')
  })

  test("a folder with an href gives its toggle a 28px (size-7), absolutely positioned hit target", () => {
    const html = renderToStaticMarkup(
      <DocsSidebar items={items} currentHref="/docs/getting-started" />
    )
    const block = detailsBlockFor(html, "Toggle Authentication")
    expect(block).toBeDefined()
    expect(block).toContain("size-7")
    expect(block).toContain("absolute")
  })

  test("defaultOpen opens a folder regardless of the current page", () => {
    const withDefaultOpen: DocsNavNode[] = [
      {
        type: "folder",
        title: "Reference",
        defaultOpen: true,
        children: [{ type: "page", title: "API", href: "/docs/reference/api" }],
      },
    ]
    const html = renderToStaticMarkup(
      <DocsSidebar items={withDefaultOpen} currentHref="/elsewhere" />
    )
    // Reference has no href here, so no "Toggle " prefix — see the no-href tests above.
    expect(detailsAttrsFor(html, "Reference")).toContain("open")
  })

  test("nesting is unbounded: a folder inside a folder renders and opens", () => {
    const nested: DocsNavNode[] = [
      {
        type: "folder",
        title: "Top",
        children: [
          {
            type: "folder",
            title: "Middle",
            children: [{ type: "page", title: "Deep page", href: "/docs/deep" }],
          },
        ],
      },
    ]
    const html = renderToStaticMarkup(<DocsSidebar items={nested} currentHref="/docs/deep" />)
    expect(html).toContain("Deep page")
    expect((html.match(/<details/g) ?? []).length).toBe(2)
    expect((html.match(/<details open/g) ?? []).length).toBe(2)
  })
})

describe("Breadcrumbs", () => {
  test("returns null for zero items", () => {
    expect(renderToStaticMarkup(<Breadcrumbs items={[]} />)).toBe("")
  })

  test("returns null for a single item", () => {
    expect(renderToStaticMarkup(<Breadcrumbs items={[{ title: "Docs" }]} />)).toBe("")
  })

  test("renders the last item as plain text with aria-current=page", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs items={[{ title: "Docs", href: "/docs" }, { title: "Getting started" }]} />
    )
    expect(html).toContain('aria-current="page"')
    expect(html).toContain("Getting started")
    expect(html).not.toMatch(/<a[^>]*>Getting started<\/a>/)
  })

  test("links every earlier item that has an href", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        items={[
          { title: "Docs", href: "/docs" },
          { title: "Authentication", href: "/docs/authentication" },
          { title: "OAuth" },
        ]}
      />
    )
    expect(html).toContain('href="/docs"')
    expect(html).toContain('href="/docs/authentication"')
  })

  test("an earlier item without an href (Review Focus 1) renders as plain text", () => {
    const html = renderToStaticMarkup(
      <Breadcrumbs
        items={[
          { title: "Docs" },
          { title: "Architecture", href: "/docs/architecture" },
          { title: "Overview" },
        ]}
      />
    )
    expect(html).not.toMatch(/<a[^>]*>Docs<\/a>/)
    expect(html).toContain("Docs")
  })
})

describe("DocsSearch (server render)", () => {
  test("renders the no-JS fallback link labelled Search docs, not a button", () => {
    const html = renderToStaticMarkup(
      <DocsSearch fallbackHref="/all" query="" onQueryChange={() => {}} results="empty" />
    )
    expect(html).toContain('<a href="/all"')
    expect(html).toContain("Search docs")
    expect(html).not.toContain("<button")
  })

  test("the fallback link's href follows fallbackHref", () => {
    const html = renderToStaticMarkup(
      <DocsSearch fallbackHref="/docs/all" query="" onQueryChange={() => {}} results={[]} />
    )
    expect(html).toContain('href="/docs/all"')
  })

  test("renders no <h2> before hydration (the dialog's sr-only title never leaks onto the page)", () => {
    const html = renderToStaticMarkup(
      <DocsSearch fallbackHref="/all" query="" onQueryChange={() => {}} results="empty" />
    )
    expect(html).not.toContain("<h2")
  })

  test("DEFAULT_DOCS_SEARCH_LABELS is today's exact English, unchanged by adding `labels`", () => {
    expect(DEFAULT_DOCS_SEARCH_LABELS).toEqual({
      trigger: "Search docs",
      dialogTitle: "Search docs",
      description: "Search the documentation",
      placeholder: "Search docs...",
      hint: "Type to search the docs",
      loading: "Searching…",
      noResults: "No results",
      unavailable: "Search is unavailable — ",
      unavailableLink: "browse all pages",
    })
  })

  test("with no `labels`, the fallback link keeps the default trigger text", () => {
    const html = renderToStaticMarkup(
      <DocsSearch fallbackHref="/all" query="" onQueryChange={() => {}} results="empty" />
    )
    expect(html).toContain(`>${DEFAULT_DOCS_SEARCH_LABELS.trigger}</span>`)
  })

  test("`labels.trigger` overrides the fallback link's text — e.g. apps/help's own copy", () => {
    const html = renderToStaticMarkup(
      <DocsSearch
        fallbackHref="/all"
        query=""
        onQueryChange={() => {}}
        results="empty"
        labels={{ trigger: "Search help" }}
      />
    )
    expect(html).toContain(">Search help</span>")
    expect(html).not.toContain("Search docs")
  })
})

describe("isSearchShortcut", () => {
  const base = { key: "k", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  test("on Mac, ⌘K (without Ctrl) matches", () => {
    expect(isSearchShortcut({ ...base, metaKey: true }, true)).toBe(true)
  })

  test("on Mac, Ctrl+K does not match (it's a cursor-movement shortcut in text fields there)", () => {
    expect(isSearchShortcut({ ...base, ctrlKey: true }, true)).toBe(false)
  })

  test("on Mac, ⌘+Ctrl+K does not match either", () => {
    expect(isSearchShortcut({ ...base, metaKey: true, ctrlKey: true }, true)).toBe(false)
  })

  test("elsewhere (Windows/Linux), Ctrl+K (without ⌘) matches", () => {
    expect(isSearchShortcut({ ...base, ctrlKey: true }, false)).toBe(true)
  })

  test("elsewhere, ⌘+K does not match (there's no ⌘ modifier there at all)", () => {
    expect(isSearchShortcut({ ...base, metaKey: true }, false)).toBe(false)
  })

  test("elsewhere, Ctrl+⌘+K does not match either", () => {
    expect(isSearchShortcut({ ...base, metaKey: true, ctrlKey: true }, false)).toBe(false)
  })

  test("does not match without any modifier, on either platform", () => {
    expect(isSearchShortcut(base, true)).toBe(false)
    expect(isSearchShortcut(base, false)).toBe(false)
  })

  test("does not match with Shift or Alt also held, on either platform", () => {
    expect(isSearchShortcut({ ...base, metaKey: true, shiftKey: true }, true)).toBe(false)
    expect(isSearchShortcut({ ...base, ctrlKey: true, altKey: true }, false)).toBe(false)
  })

  test("does not match a different key", () => {
    expect(isSearchShortcut({ ...base, key: "j", metaKey: true }, true)).toBe(false)
    expect(isSearchShortcut({ ...base, key: "j", ctrlKey: true }, false)).toBe(false)
  })

  test("never throws when key is missing (autofill/IME can fire a keydown without one)", () => {
    const keyless = { ...base, key: undefined as unknown as string, metaKey: true }
    expect(() => isSearchShortcut(keyless, true)).not.toThrow()
    expect(isSearchShortcut(keyless, true)).toBe(false)
  })
})

describe("isPlainLeftClick", () => {
  const base = { button: 0, metaKey: false, ctrlKey: false, shiftKey: false, altKey: false }

  test("a plain primary click is plain", () => {
    expect(isPlainLeftClick(base)).toBe(true)
  })

  test("any modifier makes it not plain", () => {
    expect(isPlainLeftClick({ ...base, metaKey: true })).toBe(false)
    expect(isPlainLeftClick({ ...base, ctrlKey: true })).toBe(false)
    expect(isPlainLeftClick({ ...base, shiftKey: true })).toBe(false)
    expect(isPlainLeftClick({ ...base, altKey: true })).toBe(false)
  })

  test("a non-primary button (e.g. a middle click) is not plain", () => {
    expect(isPlainLeftClick({ ...base, button: 1 })).toBe(false)
  })
})

describe("Card", () => {
  test("renders a stretched link with its title", () => {
    const html = renderToStaticMarkup(
      <Card title="Getting started" href="/docs/getting-started">
        Install and run the app.
      </Card>
    )
    expect(html).toContain('<a href="/docs/getting-started"')
    expect(html).toContain("Getting started")
    expect(html).toContain("Install and run the app.")
    expect(html).toContain("after:absolute after:inset-0")
  })

  test("renders without a description when children are omitted", () => {
    const html = renderToStaticMarkup(<Card title="No description" href="/docs/x" />)
    expect(html).toContain("No description")
  })
})

describe("Cards", () => {
  test("renders its children in a grid container", () => {
    const html = renderToStaticMarkup(
      <Cards>
        <Card title="A" href="/a" />
        <Card title="B" href="/b" />
      </Cards>
    )
    expect(html).toContain('data-slot="cards"')
    expect(html).toContain('href="/a"')
    expect(html).toContain('href="/b"')
  })
})
