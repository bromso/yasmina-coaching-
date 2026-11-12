import { expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { join } from "node:path"
import { LEGAL_PAGES } from "@repo/sites/legal"

const PAGES_DIR = join(import.meta.dir, "../../content/pages")

test("content/pages holds one file per page and language: <sv slug>.mdx and en-<en slug>.mdx", () => {
  const expected = Object.values(LEGAL_PAGES).flatMap(({ sv, en }) => [`${sv}.mdx`, `en-${en}.mdx`])
  expect(readdirSync(PAGES_DIR).sort()).toEqual(expected.sort())
})
