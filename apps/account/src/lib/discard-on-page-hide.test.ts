import { describe, expect, test } from "bun:test"
import { discardOnPersistedPageHide } from "./discard-on-page-hide"

/** A stand-in for `window`: records the `pagehide` listener so a test can fire it. */
function fakeWindow() {
  let listener: ((event: { persisted: boolean }) => void) | null = null
  return {
    addEventListener: (type: string, fn: (event: { persisted: boolean }) => void) => {
      if (type === "pagehide") listener = fn
    },
    removeEventListener: (type: string, fn: unknown) => {
      if (type === "pagehide" && fn === listener) listener = null
    },
    fire: (persisted: boolean) => listener?.({ persisted }),
    listening: () => listener !== null,
  }
}

describe("discardOnPersistedPageHide", () => {
  test("discards when the page goes into the back-forward cache, not on an ordinary unload", () => {
    const target = fakeWindow()
    let discarded = 0
    discardOnPersistedPageHide(target, () => discarded++)
    target.fire(false)
    expect(discarded).toBe(0)
    target.fire(true)
    expect(discarded).toBe(1)
  })

  test("the returned cleanup removes the listener", () => {
    const target = fakeWindow()
    const stop = discardOnPersistedPageHide(target, () => {})
    expect(target.listening()).toBe(true)
    stop()
    expect(target.listening()).toBe(false)
  })
})
