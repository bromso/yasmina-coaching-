import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Placeholder } from "./placeholder"

describe("Placeholder", () => {
  test("marks the text it wraps, with a data-placeholder attribute", () => {
    const html = renderToStaticMarkup(<Placeholder>[ATT FYLLA: organisationsnummer]</Placeholder>)
    expect(html).toMatch(
      /^<mark data-placeholder=""[^>]*>\[ATT FYLLA: organisationsnummer\]<\/mark>$/
    )
  })
})
