import AxeBuilder from "@axe-core/playwright"
import { expect, type Page } from "@playwright/test"
import {
  type AllowEntry,
  applyAllowlist,
  formatViolations,
  type Violation,
  WCAG_TAGS,
} from "../a11y/core"
import allowlist from "../a11y.allowlist.json" with { type: "json" }

export const ALLOWLIST = allowlist as AllowEntry[]

/** Every WCAG 2.0–2.2 A/AA violation axe finds on the page as it is now, before the allowlist. */
export async function axeViolations(page: Page): Promise<Violation[]> {
  // Next streams a dynamic page's metadata after the body, so <title> can land a moment after the
  // page looks ready; give it that moment (a page with no title at all still fails axe below).
  await page
    .waitForFunction(() => document.title !== "", undefined, { timeout: 5000 })
    .catch(() => {})
  // Let finite CSS animations finish first: a step that fades in (opacity 0 → 1) would otherwise be
  // measured half-transparent, and axe reports colour contrast for a frame no reader sees for
  // long. Endless ones (spinners, pulses) are left running; a stuck one gives up after 3 s.
  await page
    .evaluate(() =>
      Promise.race([
        Promise.all(
          document
            .getAnimations()
            .filter((a) => a.effect?.getComputedTiming().endTime !== Number.POSITIVE_INFINITY)
            .map((a) => a.finished.catch(() => undefined))
        ),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ])
    )
    .catch(() => {})
  const results = await new AxeBuilder({ page }).withTags([...WCAG_TAGS]).analyze()
  return results.violations as Violation[]
}

/**
 * Runs axe's WCAG 2.0–2.2 A/AA rules on the page as it is now and fails on any violation the
 * allowlist does not cover. `route` is `<app>:<path>` (allowlist matching); `label` names the page
 * and variant in the failure message.
 */
export async function expectAccessible(page: Page, opts: { label: string; route: string }) {
  const { remaining } = applyAllowlist(await axeViolations(page), ALLOWLIST, opts.route)
  expect(remaining, formatViolations(opts.label, remaining)).toEqual([])
}
