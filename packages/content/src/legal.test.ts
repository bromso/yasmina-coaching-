import { describe, expect, test } from "bun:test"
import { createLegal, findPlaceholders, type LegalInput, type LegalPageMap } from "./legal"
import { ContentError } from "./posts"

const PAGES: LegalPageMap = {
  privacy: { sv: "integritet", en: "privacy" },
  terms: { sv: "villkor", en: "terms" },
}

const SLUGS: Record<string, Record<string, string>> = {
  privacy: { sv: "integritet", en: "privacy" },
  terms: { sv: "villkor", en: "terms" },
}

function doc(
  page: string,
  locale: "sv" | "en",
  overrides: Partial<LegalInput> & { frontmatter?: Record<string, unknown> } = {}
): LegalInput {
  const slug = SLUGS[page]?.[locale] ?? "x"
  const { frontmatter, ...rest } = overrides
  return {
    file: `content/${locale}/${slug}.mdx`,
    slug,
    frontmatter: {
      title: "T",
      description: "D",
      locale,
      page,
      changes: [{ date: "2026-11-12", summary: "Första versionen" }],
      ...frontmatter,
    },
    text: "Text",
    ...rest,
  }
}

const valid = () => [
  doc("privacy", "sv"),
  doc("privacy", "en"),
  doc("terms", "sv"),
  doc("terms", "en"),
]

function problemsOf(inputs: LegalInput[]): string[] {
  try {
    createLegal(inputs, PAGES, { rootLocale: "sv" })
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError)
    return (error as ContentError).problems
  }
  throw new Error("expected createLegal to throw")
}

describe("createLegal", () => {
  test("builds both languages with urls and updated dates", () => {
    const legal = createLegal(valid(), PAGES, { rootLocale: "sv" })
    const sv = legal.doc("privacy", "sv")
    expect(sv.url).toBe("/integritet")
    expect(legal.doc("privacy", "en").url).toBe("/en/privacy")
    expect(sv.updated).toEqual(sv.changes[0]?.date as Date)
    expect(legal.docs().map((d) => d.page)).toEqual(["privacy", "privacy", "terms", "terms"])
    expect(legal.inLocale("en")).toHaveLength(2)
  })

  test("translation pairs a page across locales", () => {
    const legal = createLegal(valid(), PAGES, { rootLocale: "sv" })
    const sv = legal.doc("terms", "sv")
    expect(legal.translation(sv).locale).toBe("en")
    expect(legal.translation(legal.translation(sv)).locale).toBe("sv")
  })

  test("reports every problem at once", () => {
    const inputs = [
      doc("privacy", "sv"),
      doc("privacy", "en"),
      doc("terms", "sv", { file: "content/sv/badslug.mdx", slug: "fel" }),
      doc("nope", "sv", { file: "content/sv/unknown.mdx" }),
    ]
    const problems = problemsOf(inputs)
    expect(problems).toHaveLength(3)
    expect(problems.some((p) => p.includes("content/sv/unknown.mdx"))).toBe(true)
    expect(problems.some((p) => p.includes("content/sv/badslug.mdx"))).toBe(true)
    expect(problems.some((p) => p.includes("terms") && p.includes("en"))).toBe(true)
  })

  test("a change log must be newest first and non-empty", () => {
    const empty = valid()
    empty[0] = doc("privacy", "sv", { frontmatter: { changes: [] } })
    expect(problemsOf(empty).some((p) => p.includes(empty[0]?.file as string))).toBe(true)

    const unsorted = valid()
    unsorted[0] = doc("privacy", "sv", {
      frontmatter: {
        changes: [
          { date: "2026-01-01", summary: "a" },
          { date: "2026-02-01", summary: "b" },
        ],
      },
    })
    expect(problemsOf(unsorted).some((p) => p.includes("newest first"))).toBe(true)
  })

  test("a translation updated in one language only fails", () => {
    const inputs = valid()
    inputs[1] = doc("privacy", "en", {
      frontmatter: { changes: [{ date: "2026-11-01", summary: "x" }] },
    })
    const problems = problemsOf(inputs)
    expect(
      problems.some(
        (p) => p.includes(inputs[0]?.file as string) && p.includes(inputs[1]?.file as string)
      )
    ).toBe(true)
  })

  test("a duplicate page and locale pair fails", () => {
    const inputs = [...valid(), doc("terms", "en", { file: "content/en/dup.mdx" })]
    expect(problemsOf(inputs).some((p) => p.includes("content/en/dup.mdx"))).toBe(true)
  })

  test("placeholders are listed, and malformed or wrong-language ones fail", () => {
    expect(findPlaceholders("a [ATT FYLLA: org.nr] b")).toEqual([
      { text: "[ATT FYLLA: org.nr]", locale: "sv", valid: true },
    ])
    expect(findPlaceholders("[TO FILL: x]")[0]).toMatchObject({ locale: "en", valid: true })
    expect(findPlaceholders("[ATT FYLLA org.nr]")[0]?.valid).toBe(false)
    expect(findPlaceholders("[ATT FYLLA: ]")[0]?.valid).toBe(false)

    const wrong = valid()
    wrong[0] = doc("privacy", "sv", { text: "x [TO FILL: x]" })
    expect(problemsOf(wrong).some((p) => p.includes(wrong[0]?.file as string))).toBe(true)

    const malformed = valid()
    malformed[1] = doc("privacy", "en", { text: "[TO FILL x]" })
    expect(problemsOf(malformed).some((p) => p.includes(malformed[1]?.file as string))).toBe(true)

    const ok = valid()
    ok[0] = doc("privacy", "sv", { text: "[ATT FYLLA: org.nr]" })
    const legal = createLegal(ok, PAGES, { rootLocale: "sv" })
    expect(legal.placeholders()).toEqual([
      { file: ok[0]?.file as string, text: "[ATT FYLLA: org.nr]" },
    ])
    expect(legal.doc("privacy", "sv").placeholders).toEqual(["[ATT FYLLA: org.nr]"])
  })
})
