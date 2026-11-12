// `bun run --filter @repo/legal placeholders`: every open `[ATT FYLLA: …]` / `[TO FILL: …]` in the
// legal pages, one per line as `<file>: <placeholder>`, then the count. It reads the files through
// the same gate `next build` runs (`assembleLegal`), so a page the build would refuse fails here too.
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { assembleLegal, toLegalInput } from "../src/lib/legal-core"

const PAGES_DIR = join(import.meta.dir, "../content/pages")

const inputs = readdirSync(PAGES_DIR)
  .filter((name) => name.endsWith(".mdx"))
  .sort()
  .map((name) => {
    const raw = readFileSync(join(PAGES_DIR, name), "utf8")
    const yaml = raw.match(/^---\r?\n([\s\S]*?)\r?\n---/)?.[1] ?? ""
    return toLegalInput(name, Bun.YAML.parse(yaml), raw)
  })

const placeholders = assembleLegal(inputs, []).placeholders()
for (const { file, text } of placeholders) console.log(`${file}: ${text}`)
console.log(`${placeholders.length} placeholders`)
