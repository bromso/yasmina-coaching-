import { expect, type Page } from "@playwright/test"

/** The focused element's accessible name (aria-label, labelled-by text, or its text). */
export async function focusedName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null
    if (!el || el === document.body) return ""
    const labelledBy = el.getAttribute("aria-labelledby")
    if (labelledBy) {
      return labelledBy
        .split(" ")
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ")
        .trim()
    }
    const label =
      el.getAttribute("aria-label") ??
      (el.id ? document.querySelector(`label[for="${el.id}"]`)?.textContent : null) ??
      el.textContent
    return (label ?? "").trim()
  })
}

/**
 * Fails unless the focused element draws a visible focus indicator: an outline or a box-shadow
 * ring, or — inside a menu or listbox, where the highlighted item is the indicator (Radix, cmdk) —
 * a background that differs from the surrounding menu's.
 */
export async function expectFocusVisible(page: Page) {
  const indicator = await page.evaluate(() => {
    const el = document.activeElement
    if (!el || el === document.body) return { ok: false, what: "nothing focused" }
    const style = getComputedStyle(el)
    const outline = style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0
    const shadow = style.boxShadow !== "none" && style.boxShadow !== ""
    const menu = el.closest('[role="menu"], [role="listbox"]')
    const transparent = (c: string) => c === "transparent" || c === "rgba(0, 0, 0, 0)"
    const highlighted =
      menu !== null &&
      !transparent(style.backgroundColor) &&
      style.backgroundColor !== getComputedStyle(menu).backgroundColor
    return {
      ok: outline || shadow || highlighted,
      what: `${el.tagName.toLowerCase()} ${el.textContent?.trim().slice(0, 40)}`,
    }
  })
  expect(indicator.ok, `no visible focus indicator on ${indicator.what}`).toBe(true)
}

/** Tabs until the focused element's name matches, checking the indicator at every stop. */
export async function tabTo(
  page: Page,
  name: RegExp | string,
  opts: { max?: number; reverse?: boolean } = {}
) {
  const matches = (text: string) => (typeof name === "string" ? text === name : name.test(text))
  for (let i = 0; i < (opts.max ?? 60); i++) {
    await page.keyboard.press(opts.reverse ? "Shift+Tab" : "Tab")
    await expectFocusVisible(page)
    if (matches(await focusedName(page))) return
  }
  throw new Error(`could not Tab to ${name}`)
}
