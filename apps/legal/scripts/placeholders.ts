// `bun run --filter @repo/legal placeholders`: every open `[ATT FYLLA: …]` / `[TO FILL: …]` in the
// legal pages, one per line as `<file>: <placeholder>`, then the count. It reads the files with the
// same reader as the "real content" test and passes them through the gate `next build` runs
// (`assembleLegal`), so a page the build would refuse fails here too.
import { join } from "node:path"
import { assembleLegal } from "../src/lib/legal-core"
import { readLegalInputs } from "../src/lib/read-pages"

const placeholders = assembleLegal(
  readLegalInputs(join(import.meta.dir, "../content/pages")),
  []
).placeholders()
for (const { file, text } of placeholders) console.log(`${file}: ${text}`)
console.log(`${placeholders.length} placeholders`)
