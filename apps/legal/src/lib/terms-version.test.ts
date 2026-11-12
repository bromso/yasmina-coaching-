import { expect, test } from "bun:test"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { TERMS_VERSION } from "@repo/api-contract/legal"
import { assembleLegal, toLegalInput } from "./legal-core"

const PAGES_DIR = join(import.meta.dir, "../../content/pages")

// The api stamps TERMS_VERSION on every booking as the terms the customer accepted. It must be the
// terms page's newest change, so a new entry in the page's change log fails here until the
// constant moves with it. The pages are read the way `lib/legal.ts` reads them at build time
// (frontmatter with Bun's YAML parser, as fumadocs does), since fumadocs' generated source does
// not load under `bun test`.
const legal = assembleLegal(
  readdirSync(PAGES_DIR).map((name) => {
    const raw = readFileSync(join(PAGES_DIR, name), "utf8")
    const yaml = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
    return toLegalInput(name, Bun.YAML.parse(yaml), raw)
  }),
  []
)

test("TERMS_VERSION is the terms page's newest change, in both languages", () => {
  expect(legal.doc("terms", "sv").updated).toEqual(new Date(TERMS_VERSION))
  expect(legal.doc("terms", "en").updated).toEqual(new Date(TERMS_VERSION))
})
