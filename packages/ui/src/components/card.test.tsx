import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Card } from "./card"

describe("Card", () => {
  test("has www's rounded-4xl corners", () => {
    const html = renderToStaticMarkup(<Card>x</Card>)
    expect(html).toMatch(/^<article data-slot="card" class="[^"]*\brounded-4xl\b/)
    expect(html).not.toContain("rounded-xl")
  })
})
