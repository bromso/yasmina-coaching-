import { expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { OG_SIZE, ogElement } from "./og"

test("ogElement renders the title, subtitle and brand at the OG size", () => {
  const html = renderToStaticMarkup(
    ogElement({ title: "Docs", subtitle: "Read it", brand: "Acme" })
  )
  expect(html).toContain("Docs")
  expect(html).toContain("Read it")
  expect(html).toContain("Acme")
  expect(OG_SIZE).toEqual({ width: 1200, height: 630 })
})
