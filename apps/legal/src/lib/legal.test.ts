import { describe, expect, test } from "bun:test"
import { join } from "node:path"
import { ContentError } from "@repo/content/posts"
import { allInputs, legalInput } from "./fixtures"
import { assembleLegal, fileSlug, slugOf, toLegalInput } from "./legal-core"
import { readLegalInput, readLegalInputs } from "./read-pages"

const PAGES_DIR = join(import.meta.dir, "../../content/pages")

function problemsOf(run: () => unknown): string[] {
  try {
    run()
  } catch (error) {
    expect(error).toBeInstanceOf(ContentError)
    return (error as ContentError).problems
  }
  throw new Error("expected a ContentError")
}

describe("slugOf / fileSlug", () => {
  test("a Swedish file is its slug; an English one drops its en- prefix", () => {
    expect(slugOf("integritet.mdx")).toBe("integritet")
    expect(slugOf("en-privacy.mdx")).toBe("privacy")
  })

  test("fileSlug is the way back, the fumadocs page's slug", () => {
    expect(fileSlug("integritet", "sv")).toBe("integritet")
    expect(fileSlug("privacy", "en")).toBe("en-privacy")
  })
})

describe("toLegalInput", () => {
  test("reads the slug from the file name and the placeholders from the body only", () => {
    const raw = `---\ntitle: "[TO FILL: not in the body]"\n---\nText [TO FILL: x].\n`
    const input = toLegalInput("en-privacy.mdx", { title: "T" }, raw)
    expect(input).toEqual({
      file: "apps/legal/content/pages/en-privacy.mdx",
      slug: "privacy",
      frontmatter: { title: "T" },
      text: "Text [TO FILL: x].\n",
    })
  })
})

describe("assembleLegal", () => {
  test("builds every page in both languages", () => {
    const legal = assembleLegal(allInputs(), [])
    expect(legal.inLocale("sv").map((doc) => doc.url)).toEqual([
      "/integritet",
      "/villkor",
      "/tillganglighet",
      "/foretaget",
    ])
    expect(legal.translation(legal.doc("privacy", "sv")).url).toBe("/en/privacy")
  })

  test("reports earlier problems and createLegal's together, in one ContentError", () => {
    const inputs = allInputs().map((input) =>
      input.slug === "villkor" ? legalInput("terms", "sv", { text: "[ATT FYLLA x]" }) : input
    )
    const problems = problemsOf(() => assembleLegal(inputs, ["a.mdx: use ## for headings"]))
    expect(problems[0]).toBe("a.mdx: use ## for headings")
    expect(problems.some((problem) => problem.includes("malformed placeholder"))).toBe(true)
  })

  test("a missing page fails", () => {
    const inputs = allInputs().filter((input) => input.slug !== "company")
    expect(problemsOf(() => assembleLegal(inputs, []))).toContain(
      'page "company" has no "en" version'
    )
  })
})

describe("the real content", () => {
  // The same gate `next build` runs (lib/legal.ts), over the files themselves, so a bad page is
  // caught by `bun test` too. Frontmatter is read with Bun's YAML parser, as fumadocs reads it.
  test("passes the build gate", () => {
    expect(assembleLegal(readLegalInputs(PAGES_DIR), []).docs()).toHaveLength(8)
  })
})

describe("readLegalInput", () => {
  const page = `---\ntitle: "T"\nlocale: en\n---\nText [TO FILL: x].\n`

  test("parses the frontmatter and keeps only the body for the placeholder scan", () => {
    const input = readLegalInput("en-privacy.mdx", page)
    expect(input.frontmatter).toEqual({ title: "T", locale: "en" })
    expect(input.text).toBe("Text [TO FILL: x].\n")
  })

  test("drops a leading byte-order mark", () => {
    expect(readLegalInput("en-privacy.mdx", `\uFEFF${page}`)).toEqual(
      readLegalInput("en-privacy.mdx", page)
    )
  })

  test("names a file with no frontmatter block", () => {
    expect(() => readLegalInput("en-privacy.mdx", "Text only.\n")).toThrow(
      "apps/legal/content/pages/en-privacy.mdx: no frontmatter block"
    )
  })
})
