import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Cta } from "./cta"
import { FeatureGrid } from "./feature-grid"
import { LogoCloud } from "./logo-cloud"
import { Testimonials } from "./testimonials"

describe("LogoCloud", () => {
  test("renders a labelled section; img logos carry the name as alt, node logos a hidden name", () => {
    const html = renderToStaticMarkup(
      <LogoCloud
        title="Trusted by"
        logos={[
          { name: "Acme", src: "/acme.svg" },
          { name: "Globex", node: <svg aria-hidden="true" /> },
        ]}
      />
    )
    expect(html).toMatch(/<section[^>]*aria-labelledby=/)
    expect(html).toContain('alt="Acme"')
    expect(html).toContain("Globex")
  })
})

describe("FeatureGrid", () => {
  test("renders the heading and one article per feature with the column count", () => {
    const html = renderToStaticMarkup(
      <FeatureGrid
        heading={{ title: "Why" }}
        columns={2}
        features={[
          { title: "Fast", description: "Very" },
          { title: "Safe", description: "Quite" },
        ]}
      />
    )
    expect(html).toMatch(/<h2[^>]*>Why<\/h2>/)
    expect((html.match(/<article/g) ?? []).length).toBe(2)
    expect(html).toContain("md:grid-cols-2")
  })
})

describe("Testimonials", () => {
  test("uses figure/blockquote/figcaption and initials when no avatar image", () => {
    const html = renderToStaticMarkup(
      <Testimonials
        items={[{ quote: "Great.", name: "Ada", role: "CTO", avatar: { initials: "AL" } }]}
      />
    )
    expect(html).toContain("<figure")
    expect(html).toContain("<blockquote")
    expect(html).toContain("<figcaption")
    expect(html).toContain("AL")
    expect(html).toContain("Ada")
  })
})

describe("Cta", () => {
  test("renders the title and the actions", () => {
    const html = renderToStaticMarkup(<Cta title="Ready?" actions={<a href="/signup">Start</a>} />)
    expect(html).toMatch(/<h2[^>]*>Ready\?<\/h2>/)
    expect(html).toContain('href="/signup"')
  })
})
