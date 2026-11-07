import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Faq } from "./faq"
import { LegalPage } from "./legal-page"
import { Newsletter } from "./newsletter"
import { Pricing } from "./pricing"

describe("Pricing", () => {
  test("names each CTA after its tier and badges the highlighted tier", () => {
    const html = renderToStaticMarkup(
      <Pricing
        heading={{ title: "Pricing" }}
        tiers={[
          { name: "Free", price: "$0", features: ["A"], cta: { label: "Start", href: "/signup" } },
          {
            name: "Pro",
            price: "$19",
            period: "/month",
            features: ["A", "B"],
            cta: { label: "Start", href: "/signup?plan=pro" },
            highlighted: true,
          },
        ]}
      />
    )
    expect(html).toContain('aria-label="Start with Free"')
    expect(html).toContain('aria-label="Start with Pro"')
    expect((html.match(/Most popular/g) ?? []).length).toBe(1)
    expect(html).toContain("/month")
  })

  test("appends the tier name to a CTA label that lacks it", () => {
    const html = renderToStaticMarkup(
      <Pricing
        heading={{ title: "Pricing" }}
        tiers={[
          { name: "Pro", price: "$19", features: [], cta: { label: "Get started", href: "/p" } },
        ]}
      />
    )
    expect(html).toContain('aria-label="Get started with Pro"')
  })

  test("leaves a CTA label that already names the tier as its own accessible name", () => {
    const html = renderToStaticMarkup(
      <Pricing
        heading={{ title: "Pricing" }}
        tiers={[
          { name: "Pro", price: "$19", features: [], cta: { label: "Start with Pro", href: "/p" } },
        ]}
      />
    )
    expect(html).not.toContain("with Pro with Pro")
    expect(html).not.toContain("aria-label=")
    expect(html).toMatch(/<a[^>]*>Start with Pro<\/a>/)
  })
})

describe("Faq", () => {
  test("renders one item per question and FAQPage JSON-LD for string answers only", () => {
    const html = renderToStaticMarkup(
      <Faq
        heading={{ title: "FAQ" }}
        jsonLd
        items={[
          { question: "Q1?", answer: "A1" },
          { question: "Q2?", answer: <p>Rich</p> },
        ]}
      />
    )
    expect((html.match(/Q[12]\?/g) ?? []).length).toBeGreaterThanOrEqual(2)
    const ld = html.match(/<script type="application\/ld\+json">(.*?)<\/script>/)?.[1]
    expect(ld).toBeTruthy()
    const parsed = JSON.parse(ld ?? "{}")
    expect(parsed["@type"]).toBe("FAQPage")
    expect(parsed.mainEntity).toHaveLength(1)
    expect(parsed.mainEntity[0].name).toBe("Q1?")
  })

  test("emits no JSON-LD when no answer is a string", () => {
    const html = renderToStaticMarkup(
      <Faq
        heading={{ title: "FAQ" }}
        jsonLd
        items={[
          { question: "Q1?", answer: <p>Rich</p> },
          { question: "Q2?", answer: <p>Richer</p> },
        ]}
      />
    )
    expect(html).not.toContain('type="application/ld+json"')
  })
})

describe("Newsletter", () => {
  test("is a real form with a named email field, a submit button and prefixed feedback ids", () => {
    const html = renderToStaticMarkup(
      <Newsletter
        heading={{ title: "Stay in the loop" }}
        action={() => {}}
        state={{ ok: false, fieldErrors: { email: "Enter a valid email" } }}
      />
    )
    expect(html).toMatch(/<form[^>]*>/)
    expect(html).toContain('name="email"')
    expect(html).toContain('type="submit"')
    expect(html).toContain('id="newsletter-email-error"')
    expect(html).toContain('aria-describedby="newsletter-email-error"')
    expect(html).toContain('role="status"')
  })
})

describe("LegalPage", () => {
  test("renders a contents nav whose links match the section ids", () => {
    const html = renderToStaticMarkup(
      <LegalPage
        title="Terms"
        updatedAt="2026-10-02"
        sections={[
          { id: "acceptance", title: "Acceptance", paragraphs: ["p1"] },
          { id: "contact", title: "Contact", paragraphs: ["p2"] },
        ]}
        notice={<span>Template</span>}
      />
    )
    expect(html).toContain('<nav aria-label="Contents"')
    expect(html).toContain('href="#acceptance"')
    expect(html).toContain('id="acceptance"')
    expect(html).toContain('href="#contact"')
    expect(html).toContain("Template")
    expect(html).toMatch(/Last updated/)
  })

  test("formats the date in UTC, whatever the machine's timezone", () => {
    const html = renderToStaticMarkup(
      <LegalPage title="Terms" updatedAt="2026-10-02" sections={[]} />
    )
    expect(html).toContain("October 2, 2026")
  })
})
