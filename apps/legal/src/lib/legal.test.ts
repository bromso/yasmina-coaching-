import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ContentError } from "@repo/content/posts"
import { allInputs, legalInput } from "./fixtures"
import { assembleLegal, fileSlug, slugOf, toLegalInput, wwwRoutesFrom } from "./legal-core"
import { readLegalInput, readLegalInputs } from "./read-pages"

const PAGES_DIR = join(import.meta.dir, "../../content/pages")
/** www's own route list, as the build gate reads it (`lib/legal.ts`). */
const WWW_ROUTES = wwwRoutesFrom(
  readFileSync(join(import.meta.dir, "../../../www/src/lib/routes.ts"), "utf8")
)

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
  test("reads the slug from the file name, and the placeholders and links from the body only", () => {
    const raw = `---\ntitle: "[TO FILL: not in the body](/x)"\n---\nText [TO FILL: x]. See [the terms](/en/terms#a).\n`
    const input = toLegalInput("en-privacy.mdx", { title: "T" }, raw, ["who-we-are"])
    expect(input).toEqual({
      file: "apps/legal/content/pages/en-privacy.mdx",
      slug: "privacy",
      frontmatter: { title: "T" },
      text: "Text [TO FILL: x]. See [the terms](/en/terms#a).\n",
      anchors: ["who-we-are"],
      links: ["/en/terms#a"],
    })
  })
})

describe("wwwRoutesFrom", () => {
  test("lists the strings of www's PUBLIC_ROUTES, and refuses a file without them", () => {
    const source = `/** x */\nexport const PUBLIC_ROUTES = [\n  "/",\n  "/book",\n] as const\n`
    expect(wwwRoutesFrom(source)).toEqual(["/", "/book"])
    expect(() => wwwRoutesFrom("export const ROUTES = []")).toThrow("no PUBLIC_ROUTES")
    expect(WWW_ROUTES).toContain("/kontakt")
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

describe("the change log's id and the links", () => {
  const withText = (slug: string, text: string, anchors: string[] = []) =>
    allInputs().map((input) =>
      input.slug === slug
        ? toLegalInput(input.file.split("/").pop() as string, input.frontmatter, text, anchors)
        : input
    )

  test("a body heading that takes the change log's id fails", () => {
    expect(problemsOf(() => assembleLegal(withText("terms", "Text", ["change-log"]), []))).toEqual([
      'apps/legal/content/pages/en-terms.mdx: heading id "change-log" is the change log\'s — rename the heading',
    ])
    expect(
      problemsOf(() => assembleLegal(withText("villkor", "Text", ["andringslogg"]), []))
    ).toHaveLength(1)
  })

  test("a broken link fails, in either language, and a www link must name a www page", () => {
    const inputs = withText(
      "villkor",
      "Se [policyn](/integritet#nowhere), [företaget](/foretget) och [boka](www:/boka).",
      []
    )
    expect(problemsOf(() => assembleLegal(inputs, [], WWW_ROUTES))).toEqual([
      'apps/legal/content/pages/villkor.mdx: link "/integritet#nowhere" names no heading on that page',
      'apps/legal/content/pages/villkor.mdx: broken link "/foretget"',
      'apps/legal/content/pages/villkor.mdx: link "www:/boka" is not a page on the marketing site',
    ])
  })

  test("a link to another page's change log, or a www page, passes", () => {
    const inputs = withText(
      "terms",
      "See [the changes](/en/privacy#change-log) and [book](www:/book).",
      []
    )
    expect(() => assembleLegal(inputs, [], WWW_ROUTES)).not.toThrow()
  })
})

describe("the real content", () => {
  // The same gate `next build` runs (lib/legal.ts), over the files themselves, so a bad page is
  // caught by `bun test` too. Frontmatter is read with Bun's YAML parser, as fumadocs reads it,
  // and the heading ids are slugged by fumadocs' own heading plugin.
  test("passes the build gate, its links and www links included", () => {
    const inputs = readLegalInputs(PAGES_DIR)
    expect(assembleLegal(inputs, [], WWW_ROUTES).docs()).toHaveLength(8)
    // The gate saw every link, so a page with none would be checked vacuously.
    expect(inputs.flatMap((input) => input.links ?? []).length).toBeGreaterThan(10)
    expect(inputs.find((input) => input.slug === "villkor")?.anchors).toContain(
      "ångerrätt-för-privatpersoner"
    )
  })

  test("a deliberately broken link in a real page fails the gate", () => {
    const inputs = readLegalInputs(PAGES_DIR).map((input) =>
      input.slug === "integritet"
        ? { ...input, links: [...(input.links ?? []), "/en/privcy"] }
        : input
    )
    expect(problemsOf(() => assembleLegal(inputs, [], WWW_ROUTES))).toEqual([
      'apps/legal/content/pages/integritet.mdx: broken link "/en/privcy"',
    ])
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
