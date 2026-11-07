import { describe, expect, test } from "bun:test"
import { type ComponentType, createElement, type ReactNode } from "react"
import { isTabElement, tabTriggers } from "./tab-panel"

/** A stand-in for the interactive `Tab` and the pure `Tab` both existing — some function that is
 * not `===` either, exactly like a Client Reference crossing into `Tabs`'s children never is. */
function WrapperTab({ value, children }: { value: string; children?: ReactNode }) {
  return createElement("section", { "data-value": value }, children)
}

/** A bare object shaped like the `React.lazy` wrapper Next puts around a Client Reference —
 * `isTabElement` never calls it, so it needs no real `_payload` / `_init`. Cast to a component
 * type only for `createElement`'s sake; `isTabElement` reads nothing React doesn't already know
 * how to introspect from a plain element. */
const lazyLikeType = {
  $$typeof: Symbol.for("react.lazy"),
  _payload: null,
  _init: () => null,
} as unknown as ComponentType<{ value: string }>

describe("isTabElement", () => {
  test("matches a Tab-shaped element even when its type is not the imported Tab", () => {
    expect(isTabElement(createElement(WrapperTab, { value: "npm" }, "npm install"))).toBe(true)
  })

  test("matches an element whose type is a React.lazy-wrapped Client Reference", () => {
    expect(isTabElement(createElement(lazyLikeType, { value: "npm" }, "npm install"))).toBe(true)
  })

  test('a host element with a value prop, like <input value="x" />, is not matched', () => {
    expect(isTabElement(createElement("input", { value: "x", readOnly: true }))).toBe(false)
  })

  test("a non-element value is not matched", () => {
    expect(isTabElement("just text")).toBe(false)
    expect(isTabElement({ value: "x" } as unknown as ReactNode)).toBe(false)
    expect(isTabElement(null)).toBe(false)
  })
})

describe("tabTriggers", () => {
  test("without items, one trigger per panel in document order", () => {
    expect(tabTriggers(["npm", "bun", "pnpm"])).toEqual(["npm", "bun", "pnpm"])
  })

  test("items orders the triggers", () => {
    expect(tabTriggers(["npm", "bun", "pnpm"], ["pnpm", "npm", "bun"])).toEqual([
      "pnpm",
      "npm",
      "bun",
    ])
  })

  test("mismatched items still leaves every panel reachable, and adds no dead trigger", () => {
    const triggers = tabTriggers(["npm", "bun", "pnpm"], ["bun", "yarn"])
    expect(triggers).toEqual(["bun", "npm", "pnpm"])
    expect(triggers).not.toContain("yarn")
  })

  test("no panels, no triggers", () => {
    expect(tabTriggers([], ["a"])).toEqual([])
  })
})
