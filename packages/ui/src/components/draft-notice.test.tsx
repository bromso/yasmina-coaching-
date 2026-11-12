import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { DraftNotice } from "./draft-notice"

describe("DraftNotice", () => {
  test("is a note with the words it is given", () => {
    const html = renderToStaticMarkup(<DraftNotice>Utkast – granskas juridiskt</DraftNotice>)
    expect(html).toMatch(/^<div role="note"[^>]*>Utkast – granskas juridiskt<\/div>$/)
    expect(html).toContain('data-slot="draft-notice"')
  })

  test("merges a className", () => {
    const html = renderToStaticMarkup(<DraftNotice className="mt-4">Draft</DraftNotice>)
    expect(html).toContain("mt-4")
  })
})
