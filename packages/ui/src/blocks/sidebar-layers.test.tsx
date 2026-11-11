import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { renderToStaticMarkup } from "react-dom/server"
import { Sidebar, SidebarProvider } from "../components/sidebar"
import { aboveSidebar } from "./site-header-shell"

/** The generated `:root` value of `--<name>` (packages/tokens' output, not a copy). */
const token = (name: string) => {
  const css = readFileSync(new URL("../styles/tokens.generated.css", import.meta.url), "utf8")
  const match = css.match(new RegExp(`--${name}:\\s*([^;]+);`))
  if (!match) throw new Error(`no --${name}`)
  return match[1]
}

describe("the fixed sidebar and what covers it share one stacking source", () => {
  test("the sidebar's container stacks at --layer-sidebar, never a literal z-index", () => {
    const html = renderToStaticMarkup(
      <SidebarProvider>
        <Sidebar>nav</Sidebar>
      </SidebarProvider>
    )
    const classes = html.match(/data-slot="sidebar-container"[^>]*class="([^"]+)"/)?.[1] ?? ""
    expect(classes.split(" ")).toContain("z-(--layer-sidebar)")
    expect(classes).not.toMatch(/(^| )z-\d/)
  })
  test("--layer-above-sidebar is derived from --layer-sidebar, one above it", () => {
    const sidebar = Number(token("layer-sidebar"))
    expect(Number.isInteger(sidebar)).toBe(true)
    expect(token("layer-above-sidebar")).toBe(`calc(${sidebar} + 1)`)
  })
  test("aboveSidebar lifts an element over the sidebar on an opaque page background", () => {
    expect(aboveSidebar.split(" ")).toEqual([
      "relative",
      "z-(--layer-above-sidebar)",
      "bg-background",
    ])
  })
})

describe("the header's offsets and layer come from the tokens", () => {
  const globals = readFileSync(new URL("../styles/globals.css", import.meta.url), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  )
  test("--site-header-offset is the header plus a gap: www's 96 px of scroll padding", () => {
    expect(token("site-header-offset")).toBe("calc(calc(0.625rem + 3.75rem) + 1.625rem)")
  })
  test("only a page with a stuck header gets an offset, from the offset token", () => {
    const rule = (selector: string) =>
      globals.match(
        new RegExp(`(?:^|\\})\\s*${selector.replace(/[[\]()]/g, "\\$&")}\\s*\\{([^}]*)\\}`)
      )?.[1]
    const root = rule("html")
    expect(root).toContain("--sticky-header-offset: 0px;")
    expect(root).toContain(
      "scroll-padding-top: calc(var(--sticky-header-offset) + env(safe-area-inset-top, 0px));"
    )
    const stuck = rule('html:has([data-slot="site-header"][data-sticky])')
    expect(stuck).toContain("--sticky-header-offset: var(--site-header-offset);")
    expect(globals.match(/scroll-padding-top/g)).toHaveLength(1)
    // Without :has() a browser can't see a stuck header; it keeps the offset rather than lose it.
    expect(globals).toMatch(
      /@supports not selector\(:has\(\*\)\)\s*\{\s*html\s*\{\s*--sticky-header-offset: var\(--site-header-offset\);/
    )
  })
  test("the header stacks at --layer-header", () => {
    expect(Number(token("layer-header"))).toBe(50)
  })
})
