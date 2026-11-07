import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { PageLoading } from "./page-loading"

describe("PageLoading", () => {
  test("is one live status region with a hidden label", () => {
    const html = renderToStaticMarkup(<PageLoading />)
    expect(html.match(/role="status"/g)?.length).toBe(1)
    expect(html).toContain('aria-live="polite"')
    expect(html).toContain('<span class="sr-only">Loading…</span>')
    expect(html).toContain("<svg")
  })

  test("takes a custom label", () => {
    expect(renderToStaticMarkup(<PageLoading label="Fetching notes…" />)).toContain(
      "Fetching notes…"
    )
  })
})
