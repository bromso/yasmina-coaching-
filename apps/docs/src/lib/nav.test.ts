import { describe, expect, test } from "bun:test"
import type { Root } from "fumadocs-core/page-tree"
import { createElement, Fragment } from "react"
import { breadcrumbsFor, neighboursFor, sectionsOf, textOf, toNavNodes } from "./nav"

/** `<code>x</code> setup`, as a page name fumadocs could hand over. */
const elementName = createElement(Fragment, null, createElement("code", null, "x"), " setup")

const tree: Root = {
  name: "Docs",
  children: [
    { type: "page", name: "Introduction", url: "/" },
    { type: "separator", name: "Start here" },
    { type: "page", name: elementName, url: "/x-setup" },
    {
      type: "folder",
      name: "Guides",
      defaultOpen: true,
      index: { type: "page", name: "Guides", url: "/guides" },
      // fumadocs keeps a folder's index page in `index`, not among its children.
      children: [{ type: "page", name: "Deploying", url: "/guides/deploying" }],
    },
    { type: "separator" },
    {
      type: "folder",
      name: "Reference",
      children: [{ type: "page", name: "Commands", url: "/reference/commands" }],
    },
  ],
}

describe("textOf", () => {
  test("flattens strings, numbers, arrays and elements' children", () => {
    expect(textOf("plain")).toBe("plain")
    expect(textOf(3)).toBe("3")
    expect(textOf(["a", 1, null, false, "b"])).toBe("a1b")
    expect(textOf(elementName)).toBe("x setup")
    expect(textOf(createElement("em", null, createElement("strong", null, "deep")))).toBe("deep")
    expect(textOf(undefined)).toBe("")
  })
})

describe("toNavNodes", () => {
  test("maps separators, folders with and without an index page, and element names", () => {
    expect(toNavNodes(tree)).toEqual([
      { type: "page", title: "Introduction", href: "/" },
      { type: "separator", title: "Start here" },
      { type: "page", title: "x setup", href: "/x-setup" },
      {
        type: "folder",
        title: "Guides",
        href: "/guides",
        defaultOpen: true,
        children: [{ type: "page", title: "Deploying", href: "/guides/deploying" }],
      },
      { type: "separator", title: undefined },
      {
        type: "folder",
        title: "Reference",
        href: undefined,
        defaultOpen: undefined,
        children: [{ type: "page", title: "Commands", href: "/reference/commands" }],
      },
    ])
  })
})

describe("breadcrumbsFor", () => {
  test("names the folders above a page and the page itself, as plain text", () => {
    expect(breadcrumbsFor("/guides/deploying", tree)).toEqual([
      { title: "Docs", href: "/" },
      { title: "Guides", href: "/guides" },
      { title: "Deploying", href: "/guides/deploying" },
    ])
    expect(breadcrumbsFor("/reference/commands", tree)).toEqual([
      { title: "Docs", href: "/" },
      { title: "Reference", href: undefined },
      { title: "Commands", href: "/reference/commands" },
    ])
  })

  test("a folder's index page is the folder's own crumb", () => {
    expect(breadcrumbsFor("/guides", tree)).toEqual([
      { title: "Docs", href: "/" },
      { title: "Guides", href: "/guides" },
    ])
  })

  test("a root-level page is under Docs; the landing page has no trail", () => {
    expect(breadcrumbsFor("/x-setup", tree)).toEqual([
      { title: "Docs", href: "/" },
      { title: "x setup", href: "/x-setup" },
    ])
    expect(breadcrumbsFor("/", tree)).toEqual([])
  })
})

describe("neighboursFor", () => {
  test("the first page has no previous, the last no next", () => {
    expect(neighboursFor("/", tree)).toEqual({
      next: { href: "/x-setup", title: "x setup", label: "Next" },
    })
    expect(neighboursFor("/reference/commands", tree)).toEqual({
      prev: { href: "/guides/deploying", title: "Deploying", label: "Previous" },
    })
  })

  test("a middle page has both, with plain-text titles", () => {
    expect(neighboursFor("/x-setup", tree)).toEqual({
      prev: { href: "/", title: "Introduction", label: "Previous" },
      next: { href: "/guides", title: "Guides", label: "Next" },
    })
  })
})

describe("sectionsOf", () => {
  test("groups every page in sidebar order under its separator or folder", () => {
    expect(sectionsOf(toNavNodes(tree))).toEqual([
      { pages: [{ href: "/", title: "Introduction" }] },
      { title: "Start here", pages: [{ href: "/x-setup", title: "x setup" }] },
      {
        title: "Guides",
        pages: [
          { href: "/guides", title: "Guides" },
          { href: "/guides/deploying", title: "Deploying" },
        ],
      },
      { title: "Reference", pages: [{ href: "/reference/commands", title: "Commands" }] },
    ])
  })

  test("pages after a top-level folder continue untitled, not under the separator again", () => {
    expect(
      sectionsOf([
        { type: "separator", title: "Guides" },
        { type: "page", title: "Deploying", href: "/deploying" },
        {
          type: "folder",
          title: "Recipes",
          children: [{ type: "page", title: "Caching", href: "/recipes/caching" }],
        },
        { type: "page", title: "Adding an app", href: "/adding-an-app" },
      ])
    ).toEqual([
      { title: "Guides", pages: [{ href: "/deploying", title: "Deploying" }] },
      { title: "Recipes", pages: [{ href: "/recipes/caching", title: "Caching" }] },
      { pages: [{ href: "/adding-an-app", title: "Adding an app" }] },
    ])
  })
})
