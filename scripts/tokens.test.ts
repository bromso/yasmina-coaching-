import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { OUTPUTS, render } from "../packages/tokens/src/render"

const ROOT = join(import.meta.dir, "..")

// The theme and the email constants are generated from packages/tokens and committed, so an app
// never needs the tokens build to run first. This fails when a token edit was not regenerated, or
// a generated file was edited by hand. It renders without style-dictionary, so it runs before
// `bun install` like the rest of `bun test scripts`.
describe("generated design tokens", () => {
  const generated = render()
  for (const key of ["css", "email"] as const) {
    test(`${key}: ${relative(ROOT, OUTPUTS[key])} matches packages/tokens`, () => {
      const committed = readFileSync(OUTPUTS[key], "utf8")
      expect(committed, `${relative(ROOT, OUTPUTS[key])} is stale: run \`bun run tokens\``).toBe(
        generated[key]
      )
    })
  }
})
