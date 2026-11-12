import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { SunPanel } from "./sun-panel"

describe("SunPanel", () => {
  test("a rounded sun-soft div by default", () => {
    const html = renderToStaticMarkup(<SunPanel>Text</SunPanel>)
    expect(html).toBe('<div class="rounded-4xl bg-sun-soft">Text</div>')
  })

  test("another element, the full sun tone, a className and other props", () => {
    const html = renderToStaticMarkup(
      <SunPanel as="section" tone="sun" className="px-6 py-10" aria-labelledby="cta">
        Text
      </SunPanel>
    )
    expect(html).toBe(
      '<section class="rounded-4xl bg-sun px-6 py-10" aria-labelledby="cta">Text</section>'
    )
  })

  test("a className can change the radius", () => {
    const html = renderToStaticMarkup(<SunPanel className="rounded-3xl">Text</SunPanel>)
    expect(html).toBe('<div class="bg-sun-soft rounded-3xl">Text</div>')
  })
})
