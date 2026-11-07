import { describe, expect, test } from "bun:test"
import { imageFailed } from "./image-fallback"

// `useImageFallback` itself isn't exercised here: it reads a mounted <img>'s `complete` /
// `naturalWidth` inside a `useEffect`, and this workspace's `bun test` runs with no DOM (no
// `document`, so no real `<img>` element and no effects) — the same constraint that keeps
// `user-menu.test.tsx` off Radix's `AvatarImage`. `imageFailed` is pulled out specifically so the
// one piece of real logic — what counts as "failed" — can still be tested directly, against
// fake `{ complete, naturalWidth }` objects shaped like a real `HTMLImageElement`.
describe("imageFailed", () => {
  test("not failed while still loading", () => {
    expect(imageFailed({ complete: false, naturalWidth: 0 })).toBe(false)
  })

  test("not failed once loaded with real pixels", () => {
    expect(imageFailed({ complete: true, naturalWidth: 64 })).toBe(false)
  })

  test("failed once complete with no natural width — a 404 or other load error", () => {
    expect(imageFailed({ complete: true, naturalWidth: 0 })).toBe(true)
  })
})
