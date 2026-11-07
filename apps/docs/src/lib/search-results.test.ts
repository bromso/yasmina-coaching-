import { describe, expect, test } from "bun:test"
import type { SortedResult } from "fumadocs-core/search"
import { createElement, Fragment, type ReactNode } from "react"
import { plainText, searchResultsFor, toSearchResults } from "./search-results"

const hits: SortedResult<ReactNode>[] = [
  { id: "/getting-started", type: "page", url: "/getting-started", content: "Getting started" },
  {
    id: "/getting-started-0",
    type: "heading",
    url: "/getting-started#install",
    content: "<mark>Install</mark>",
  },
  {
    id: "/getting-started-1",
    type: "text",
    url: "/getting-started#install",
    content: "Run <mark>install</mark> once.",
  },
  {
    id: "/getting-started-2",
    type: "text",
    url: "/getting-started",
    content: "<mark>Install</mark> Bun first.",
  },
  {
    id: "/deploying",
    type: "page",
    url: "/deploying",
    content: createElement(Fragment, null, createElement("code", null, "bun"), " deploy"),
  },
  { id: "/deploying-0", type: "text", url: "/deploying#build", content: "Then install it." },
]

describe("plainText", () => {
  test("drops <mark> highlighting and flattens React nodes", () => {
    expect(plainText("Run <mark>bun</mark> <MARK>dev</MARK>")).toBe("Run bun dev")
    expect(plainText(createElement("span", null, "a ", createElement("mark", null, "b")))).toBe(
      "a b"
    )
  })

  test("drops simple inline Markdown: code, strong, emphasis and links keep only their text", () => {
    expect(
      plainText("**Register it.** Add the app to `SITES` in <mark>`packages/sites`</mark>.")
    ).toBe("Register it. Add the app to SITES in packages/sites.")
    expect(plainText("__Bold__, *em* and _em_, see [the guide](/deploying#env).")).toBe(
      "Bold, em and em, see the guide."
    )
  })

  test("leaves underscores and asterisks inside words and lone markers alone", () => {
    expect(plainText("Set SITE_DOMAIN and COOKIE_DOMAIN; 2 * 3 = 6; a*b")).toBe(
      "Set SITE_DOMAIN and COOKIE_DOMAIN; 2 * 3 = 6; a*b"
    )
  })

  test("keeps other angle brackets as text: nothing is rendered as HTML anyway", () => {
    expect(plainText("Render <Search /> here")).toBe("Render <Search /> here")
  })
})

describe("toSearchResults", () => {
  test("maps page, heading and text hits to DocsSearchResult", () => {
    expect(toSearchResults(hits)).toEqual([
      { id: "/getting-started", kind: "page", title: "Getting started", href: "/getting-started" },
      {
        id: "/getting-started-0",
        kind: "heading",
        title: "Install",
        href: "/getting-started#install",
        excerpt: "Getting started",
      },
      {
        id: "/getting-started-1",
        kind: "text",
        title: "Install",
        href: "/getting-started#install",
        excerpt: "Run install once.",
      },
      {
        id: "/getting-started-2",
        kind: "text",
        title: "Getting started",
        href: "/getting-started",
        excerpt: "Install Bun first.",
      },
      { id: "/deploying", kind: "page", title: "bun deploy", href: "/deploying" },
      {
        id: "/deploying-0",
        kind: "text",
        title: "bun deploy",
        href: "/deploying#build",
        excerpt: "Then install it.",
      },
    ])
  })
})

describe("searchResultsFor", () => {
  const done = { isLoading: false }

  test("an empty or blank query shows nothing", () => {
    expect(searchResultsFor("", { ...done, data: "empty" })).toEqual([])
    expect(searchResultsFor("  ", { isLoading: true, data: hits })).toEqual([])
  })

  test("a running query, or one still waiting for its debounce or the index, is loading", () => {
    expect(searchResultsFor("install", { isLoading: true, data: "empty" })).toBe("loading")
    expect(searchResultsFor("install", { isLoading: true, data: hits })).toBe("loading")
    // fumadocs answers "empty" only for an empty query: a non-empty one has not run yet.
    expect(searchResultsFor("install", { ...done, data: "empty" })).toBe("loading")
    expect(searchResultsFor("install", { ...done })).toBe("loading")
  })

  test("a finished query with no hits is empty", () => {
    expect(searchResultsFor("zzz", { ...done, data: [] })).toBe("empty")
  })

  test("a failed query (the index did not load) is an error", () => {
    expect(searchResultsFor("install", { ...done, error: new Error("offline") })).toBe("error")
  })

  test("a finished query with hits is mapped", () => {
    expect(searchResultsFor("install", { ...done, data: hits })).toEqual(toSearchResults(hits))
  })
})
