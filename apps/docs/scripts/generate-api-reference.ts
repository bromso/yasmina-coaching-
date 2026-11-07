/**
 * Writes the /v1 API reference and webhook event pages from `@repo/public-api-contract`:
 * content/docs/developers/reference/*.mdx and content/docs/developers/webhooks/events/*.mdx, plus
 * each folder's meta.json. Deletes a page in those two folders that is no longer generated
 * (dotfiles excepted).
 * Never touches anything else under content/docs/developers (the hand-written pages).
 *
 * Run with: bun run --filter @repo/docs generate:api — then commit the result. The drift test in
 * src/lib/api-reference.test.ts fails until the committed pages match.
 */
import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { buildV1OpenAPIDocument } from "@repo/public-api-contract/openapi"
import { EVENTS_DIR, generateApiReference, REFERENCE_DIR } from "../src/lib/api-reference"

const APP_DIR = join(import.meta.dir, "..")
const files = generateApiReference(await buildV1OpenAPIDocument())

for (const dir of [REFERENCE_DIR, EVENTS_DIR]) {
  mkdirSync(join(APP_DIR, dir), { recursive: true })
  for (const name of readdirSync(join(APP_DIR, dir))) {
    const path = `${dir}/${name}`
    // A dotfile (`.DS_Store`, an editor's swap file) is not a page; leave it be.
    if (!name.startsWith(".") && !(path in files)) {
      rmSync(join(APP_DIR, path), { recursive: true })
      console.log(`removed ${path}`)
    }
  }
}

for (const [path, content] of Object.entries(files)) {
  mkdirSync(dirname(join(APP_DIR, path)), { recursive: true })
  writeFileSync(join(APP_DIR, path), content)
}
console.log(`wrote ${Object.keys(files).length} files`)
