import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { StatusPage } from "./status-page"

describe("StatusPage", () => {
  test("renders code, title, description and the actions slot", () => {
    const html = renderToStaticMarkup(
      <StatusPage code="404" title="Page not found" description="Nothing here.">
        <a href="/">Back to home</a>
      </StatusPage>
    )
    expect(html).toContain(">404<")
    expect(html).toMatch(/<h1[^>]*>Page not found<\/h1>/)
    expect(html).toContain("Page not found")
    expect(html).toContain("Nothing here.")
    expect(html).toContain('<a href="/">Back to home</a>')
  })

  test("omits the code and actions row when not given", () => {
    const html = renderToStaticMarkup(<StatusPage title="Oops" description="Sorry." />)
    expect(html).not.toContain("font-mono")
    expect(html).not.toContain('data-slot="status-page-actions"')
  })

  test("merges className onto the section", () => {
    const html = renderToStaticMarkup(<StatusPage title="T" description="D" className="extra" />)
    expect(html).toMatch(/<section[^>]*class="[^"]*extra[^"]*"/)
  })
})
