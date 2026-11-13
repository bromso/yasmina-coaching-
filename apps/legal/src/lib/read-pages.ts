import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import type { LegalInput } from "@repo/content/legal"
import { getTableOfContents } from "fumadocs-core/content/toc"
import { toLegalInput } from "./legal-core"

/** A frontmatter block at the very start of a file, its YAML captured. */
const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/

/**
 * One page file as `createLegal` takes it, read outside Next (Bun only: `Bun.YAML`), its heading
 * ids slugged as fumadocs slugs them. A leading
 * byte-order mark is dropped, as fumadocs drops it; a file with no frontmatter block is reported by
 * name rather than parsed as `{}`, which would fail validation with a confusing message.
 */
export function readLegalInput(name: string, source: string): LegalInput {
  const raw = source.replace(/^﻿/, "")
  const yaml = FRONTMATTER.exec(raw)?.[1]
  if (yaml === undefined) {
    throw new Error(
      `apps/legal/content/pages/${name}: no frontmatter block at the start of the file`
    )
  }
  // The same heading ids fumadocs gives the rendered page (its remark-heading plugin).
  const anchors = getTableOfContents(raw.replace(FRONTMATTER, "")).map((item) =>
    item.url.replace(/^#/, "")
  )
  return toLegalInput(name, Bun.YAML.parse(yaml), raw, anchors)
}

/** Every `.mdx` page in `dir`, sorted by file name, as `readLegalInput` reads it. */
export function readLegalInputs(dir: string): LegalInput[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith(".mdx"))
    .sort()
    .map((name) => readLegalInput(name, readFileSync(join(dir, name), "utf8")))
}
