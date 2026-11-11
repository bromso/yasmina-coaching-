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
