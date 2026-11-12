import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  ""
)
const fonts = readFileSync(new URL("../lib/fonts.ts", import.meta.url), "utf8")

describe("the font variables", () => {
  test("no font variable in the stylesheet refers to itself", () => {
    const loops = [...globals.matchAll(/--((?:font|typeface)[\w-]*):\s*([^;]+);/g)]
      .filter(([, name, value]) => value?.includes(`var(--${name})`))
      .map(([declaration]) => declaration)
    expect(loops).toEqual([])
  })

  test("Tailwind's font utilities read the typeface tokens, under names of their own", () => {
    for (const family of ["sans", "display", "mono"]) {
      expect(globals).toContain(`--font-${family}: var(--typeface-${family});`)
    }
  })

  test("next/font's variables are named for the font, apart from the tokens'", () => {
    for (const variable of ["--font-inter", "--font-fraunces", "--font-jetbrains-mono"]) {
      expect(fonts).toContain(`variable: "${variable}"`)
    }
  })
})
