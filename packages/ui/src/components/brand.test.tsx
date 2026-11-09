import { describe, expect, test } from "bun:test"
import { BRAND_NAME } from "@repo/sites/brand"
import { renderToStaticMarkup } from "react-dom/server"
import { Brand, BrandMark } from "./brand"

describe("Brand", () => {
  test("links to href with the default name and a hidden mark", () => {
    const html = renderToStaticMarkup(<Brand href="https://www.example.com" />)
    expect(html).toMatch(/^<a [^>]*href="https:\/\/www\.example\.com"/)
    expect(html).toContain(`<span class="truncate">${BRAND_NAME}</span></a>`)
    expect(html).toContain('aria-hidden="true"')
  })

  test("renders a custom name and merges className", () => {
    const html = renderToStaticMarkup(<Brand href="/" name="Acme" className="extra" />)
    expect(html).toContain(`<span class="truncate">Acme</span></a>`)
    expect(html).not.toContain(BRAND_NAME)
    expect(html).toMatch(/<a [^>]*class="[^"]*extra[^"]*"/)
  })
})

describe("BrandMark", () => {
  test("is decorative and merges className", () => {
    const html = renderToStaticMarkup(<BrandMark className="size-8" />)
    expect(html).toMatch(/^<span [^>]*aria-hidden="true"/)
    expect(html).toContain("size-8")
  })
})
