import { describe, expect, test } from "bun:test"
import { EMAIL_CONFIRM_HEADING_ID, focusEmailConfirmHeading } from "./email-confirm"

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

describe("focusEmailConfirmHeading", () => {
  test("focuses the success panel's heading by its id", () => {
    const { doc, calls } = fakeDocument()
    focusEmailConfirmHeading(doc)
    expect(calls).toEqual({ lookedUp: [EMAIL_CONFIRM_HEADING_ID], focused: 1 })
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusEmailConfirmHeading(doc)).not.toThrow()
  })
})
