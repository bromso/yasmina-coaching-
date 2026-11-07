import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import * as brand from "./brand"
import { BRAND_NAME } from "./index"

test("the brand module exports only the name, and reads no env (safe in client bundles)", () => {
  expect(Object.keys(brand)).toEqual(["BRAND_NAME"])
  expect(readFileSync(new URL("./brand.ts", import.meta.url), "utf8")).not.toContain("process")
  expect(BRAND_NAME).toBe(brand.BRAND_NAME)
})
