import { describe, expect, test } from "bun:test"
import {
  EMAIL_CANCEL_HEADING_ID,
  EMAIL_REVERT_HEADING_ID,
  EMAIL_UNSUBSCRIBE_HEADING_ID,
  focusEmailCancelHeading,
  focusEmailRevertHeading,
  focusEmailUnsubscribeHeading,
} from "./email-change-focus"

/** A stand-in document: records which id was looked up and whether it was focused. */
function fakeDocument(present = true) {
  const calls = { lookedUp: [] as string[], focused: 0 }
  const doc = {
    getElementById(id: string) {
      calls.lookedUp.push(id)
      return present ? ({ focus: () => calls.focused++ } as unknown as HTMLElement) : null
    },
  }
  return { doc, calls }
}

describe("focusEmailCancelHeading", () => {
  test("focuses the cancel success panel's heading by its id", () => {
    const { doc, calls } = fakeDocument()
    focusEmailCancelHeading(doc)
    expect(calls).toEqual({ lookedUp: [EMAIL_CANCEL_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusEmailCancelHeading(doc)).not.toThrow()
  })
})

describe("focusEmailRevertHeading", () => {
  test("focuses the revert success panel's heading by its id", () => {
    const { doc, calls } = fakeDocument()
    focusEmailRevertHeading(doc)
    expect(calls).toEqual({ lookedUp: [EMAIL_REVERT_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusEmailRevertHeading(doc)).not.toThrow()
  })
})

describe("focusEmailUnsubscribeHeading", () => {
  test("focuses the unsubscribe success panel's heading by its id", () => {
    const { doc, calls } = fakeDocument()
    focusEmailUnsubscribeHeading(doc)
    expect(calls).toEqual({ lookedUp: [EMAIL_UNSUBSCRIBE_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusEmailUnsubscribeHeading(doc)).not.toThrow()
  })
})
