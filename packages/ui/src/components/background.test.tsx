import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Background } from "./background"

describe("Background", () => {
  test("the top glow by default, around its children", () => {
    const html = renderToStaticMarkup(
      <Background>
        <p>Hej</p>
      </Background>
    )
    expect(html).toMatch(/^<div class="[^"]*from-sun via-sun-soft[^"]*"><p>Hej<\/p><\/div>$/)
    expect(html).toContain("rounded-t-4xl rounded-b-2xl")
  })

  test("the bottom glow, with a className", () => {
    const html = renderToStaticMarkup(
      <Background variant="bottom" className="pb-10">
        x
      </Background>
    )
    expect(html).toContain("rounded-t-2xl rounded-b-4xl")
    expect(html).toContain("to-sun")
    expect(html).toContain("pb-10")
  })
})
