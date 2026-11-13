import { expect, test } from "bun:test"
import { join } from "node:path"
import { LEGAL_PAGES } from "@repo/sites/legal"
import { readLegalInputs } from "./read-pages"

const PAGES_DIR = join(import.meta.dir, "../../content/pages")

/**
 * A body's shape, section by section: each `##`/`###` heading's level, then how many paragraphs,
 * list items, table rows and placeholders sit under it. Two translations that say the same
 * things have the same shape, so a paragraph kept in one language and dropped in the other shows
 * up here even when every heading still matches.
 */
function shape(text: string): string[] {
  const sections: { heading: string; blocks: string[] }[] = [{ heading: "intro", blocks: [] }]
  for (const block of text.split(/\n\s*\n/)) {
    const trimmed = block.trim()
    if (!trimmed) continue
    const heading = /^(#{2,3}) /.exec(trimmed)
    if (heading) sections.push({ heading: heading[1] as string, blocks: [] })
    else sections.at(-1)?.blocks.push(trimmed)
  }
  return sections.map(({ heading, blocks }) => {
    const lines = blocks.flatMap((block) => block.split("\n"))
    const paragraphs = blocks.filter((block) => !/^(- |\| )/.test(block)).length
    const items = lines.filter((line) => line.startsWith("- ")).length
    const rows = lines.filter((line) => line.startsWith("| ")).length
    const placeholders = blocks.join("\n").match(/\[(ATT FYLLA|TO FILL):/g)?.length ?? 0
    return `${heading} p${paragraphs} li${items} tr${rows} ph${placeholders}`
  })
}

test("each page's Swedish and English bodies have the same sections, paragraphs, lists, tables and placeholders", () => {
  const inputs = readLegalInputs(PAGES_DIR)
  for (const { sv, en } of Object.values(LEGAL_PAGES)) {
    const svInput = inputs.find((input) => input.file.endsWith(`/${sv}.mdx`))
    const enInput = inputs.find((input) => input.file.endsWith(`/en-${en}.mdx`))
    expect({ page: en, shape: shape(enInput?.text ?? "") }).toEqual({
      page: en,
      shape: shape(svInput?.text ?? ""),
    })
  }
})
