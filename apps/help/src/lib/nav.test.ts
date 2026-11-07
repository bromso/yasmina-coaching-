import { describe, expect, test } from "bun:test"
import { createElement, Fragment } from "react"
import { articleBreadcrumbs, categoryBreadcrumbs, textOf } from "./nav"

/** `<code>x</code> setup`, as a search hit's title could arrive. */
const elementName = createElement(Fragment, null, createElement("code", null, "x"), " setup")

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

describe("categoryBreadcrumbs", () => {
  test("Help then the category", () => {
    expect(categoryBreadcrumbs({ slug: "getting-started", title: "Getting started" })).toEqual([
      { title: "Help", href: "/" },
      { title: "Getting started", href: "/getting-started" },
    ])
  })
})

describe("articleBreadcrumbs", () => {
  test("Help, the category, then the article", () => {
    expect(
      articleBreadcrumbs(
        { slug: "getting-started", title: "Getting started" },
        { path: "/getting-started/create-an-account", title: "Create an account" }
      )
    ).toEqual([
      { title: "Help", href: "/" },
      { title: "Getting started", href: "/getting-started" },
      { title: "Create an account", href: "/getting-started/create-an-account" },
    ])
  })
})
