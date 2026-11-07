import { expect, test } from "bun:test"
import { createOnceVisible } from "./pricing-view-tracker"

// The IntersectionObserver wiring itself needs a DOM this repo's test setup doesn't have (no
// jsdom/happy-dom dependency — see CLAUDE.md's Dependency Versioning rules on not adding one for a
// single call site); this pure predicate is where the once-per-load logic actually lives, and it
// is cheap to test without a DOM. Verified manually otherwise — see the task report.
test("fires once on the first intersecting entry and never again", () => {
  let fired = 0
  const onVisible = createOnceVisible(() => {
    fired++
  })
  onVisible([{ isIntersecting: false }])
  expect(fired).toBe(0)
  onVisible([{ isIntersecting: false }, { isIntersecting: true }])
  expect(fired).toBe(1)
  onVisible([{ isIntersecting: true }])
  expect(fired).toBe(1)
})
