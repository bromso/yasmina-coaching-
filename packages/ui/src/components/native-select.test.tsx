import { describe, expect, test } from "bun:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Input } from "./input"
import { NativeSelect } from "./native-select"

const classes = (html: string) => new Set((html.match(/class="([^"]*)"/)?.[1] ?? "").split(" "))

describe("NativeSelect", () => {
  test("is a plain <select>, so a form submits it without JavaScript", () => {
    const html = renderToStaticMarkup(
      <NativeSelect name="status" defaultValue="b">
        <option value="a">A</option>
        <option value="b">B</option>
      </NativeSelect>
    )
    expect(html).toMatch(/^<select data-slot="native-select" [^>]*name="status"/)
    expect(html).toContain('<option value="b" selected="">B</option>')
  })

  test("looks like Input: same height, radius, border, focus ring and invalid state", () => {
    const select = classes(renderToStaticMarkup(<NativeSelect />))
    for (const c of [
      "h-9",
      "rounded-md",
      "border-input",
      "shadow-xs",
      "focus-visible:ring-[3px]",
      "focus-visible:ring-ring/50",
      "aria-invalid:border-destructive",
    ]) {
      expect(classes(renderToStaticMarkup(<Input />)).has(c)).toBe(true)
      expect(select.has(c)).toBe(true)
    }
  })

  test("merges a caller's className", () => {
    expect(
      classes(renderToStaticMarkup(<NativeSelect className="max-w-60" />)).has("max-w-60")
    ).toBe(true)
  })
})
