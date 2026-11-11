import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Card } from "./card"

describe("Card", () => {
  test("has www's rounded-4xl corners", () => {
    const html = renderToStaticMarkup(<Card>x</Card>)
    expect(html).toMatch(
      /^<article data-slot="card" data-size="default" class="[^"]*\brounded-4xl\b/
    )
    expect(html).not.toContain("rounded-xl")
  })

  test('size="compact" keeps the padding but takes a tighter radius for dense screens', () => {
    const compact = renderToStaticMarkup(<Card size="compact">x</Card>)
    expect(compact).toContain('data-size="compact"')
    expect(compact).toMatch(/class="[^"]*\brounded-2xl\b/)
    expect(compact).not.toContain("rounded-4xl")
    const classes = (html: string) => (html.match(/class="([^"]*)"/)?.[1] ?? "").split(" ")
    const without = (list: string[]) => list.filter((c) => !c.startsWith("rounded-")).sort()
    expect(without(classes(compact))).toEqual(
      without(classes(renderToStaticMarkup(<Card>x</Card>)))
    )
  })
})
