import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { CLOSED_RADIUS } from "./radius"

test("the animated nav's closed radius is the --site-header-radius token", () => {
  const css = readFileSync(
    new URL("../../../../../packages/ui/src/styles/tokens.generated.css", import.meta.url),
    "utf8"
  )
  const rem = css.match(/--site-header-radius:\s*([\d.]+)rem;/)?.[1]
  expect(rem).toBeDefined()
  expect(Number(rem) * 16).toBe(CLOSED_RADIUS)
})
