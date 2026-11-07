import { describe, expect, test } from "bun:test"
import type { SortedResult } from "fumadocs-core/search"
import { createElement, Fragment, type ReactNode } from "react"
import { plainText, searchResultsFor, toSearchResults } from "./search-results"

const hits: SortedResult<ReactNode>[] = [
  {
    id: "/getting-started/create-an-account",
    type: "page",
    url: "/getting-started/create-an-account",
    content: "Create an account",
  },
  {
    id: "/getting-started/create-an-account-0",
    type: "heading",
    url: "/getting-started/create-an-account#sign-up",
    content: "<mark>Sign up</mark>",
  },
  {
    id: "/getting-started/create-an-account-1",
    type: "text",
    url: "/getting-started/create-an-account#sign-up",
    content: "Run <mark>sign up</mark> once.",
  },
  {
    id: "/getting-started/create-an-account-2",
    type: "text",
    url: "/getting-started/create-an-account",
    content: "<mark>Verify</mark> your email first.",
  },
  {
    id: "/account-security/two-step",
    type: "page",
    url: "/account-security/two-step",
    content: createElement(Fragment, null, createElement("code", null, "2FA"), " setup"),
  },
  {
    id: "/account-security/two-step-0",
    type: "text",
    url: "/account-security/two-step#enable",
    content: "Then scan the QR code.",
  },
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
      plainText("**Turn it on.** Open `Account > Security` and enable <mark>`two-step`</mark>.")
    ).toBe("Turn it on. Open Account > Security and enable two-step.")
    expect(plainText("__Bold__, *em* and _em_, see [contact us](/contact).")).toBe(
      "Bold, em and em, see contact us."
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
      {
        id: "/getting-started/create-an-account",
        kind: "page",
        title: "Create an account",
        href: "/getting-started/create-an-account",
      },
      {
        id: "/getting-started/create-an-account-0",
        kind: "heading",
        title: "Sign up",
        href: "/getting-started/create-an-account#sign-up",
        excerpt: "Create an account",
      },
      {
        id: "/getting-started/create-an-account-1",
        kind: "text",
        title: "Sign up",
        href: "/getting-started/create-an-account#sign-up",
        excerpt: "Run sign up once.",
      },
      {
        id: "/getting-started/create-an-account-2",
        kind: "text",
        title: "Create an account",
        href: "/getting-started/create-an-account",
        excerpt: "Verify your email first.",
      },
      {
        id: "/account-security/two-step",
        kind: "page",
        title: "2FA setup",
        href: "/account-security/two-step",
      },
      {
        id: "/account-security/two-step-0",
        kind: "text",
        title: "2FA setup",
        href: "/account-security/two-step#enable",
        excerpt: "Then scan the QR code.",
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
    expect(searchResultsFor("account", { isLoading: true, data: "empty" })).toBe("loading")
    expect(searchResultsFor("account", { isLoading: true, data: hits })).toBe("loading")
    // fumadocs answers "empty" only for an empty query: a non-empty one has not run yet.
    expect(searchResultsFor("account", { ...done, data: "empty" })).toBe("loading")
    expect(searchResultsFor("account", { ...done })).toBe("loading")
  })

  test("a finished query with no hits is empty", () => {
    expect(searchResultsFor("zzz", { ...done, data: [] })).toBe("empty")
  })

  test("a failed query (the index did not load) is an error", () => {
    expect(searchResultsFor("account", { ...done, error: new Error("offline") })).toBe("error")
  })

  test("a finished query with hits is mapped", () => {
    expect(searchResultsFor("account", { ...done, data: hits })).toEqual(toSearchResults(hits))
  })
})
