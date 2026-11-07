import { describe, expect, test } from "bun:test"
import {
  classifyPasskeyRegisterError,
  focusHeadingAfterRemove,
  PASSKEYS_HEADING_ID,
  passkeyRegisterErrorState,
} from "./passkey"

const domError = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

describe("classifyPasskeyRegisterError", () => {
  test("AbortError (a fast double submit) is never shown", () => {
    expect(classifyPasskeyRegisterError(domError("AbortError"))).toBe("none")
  })

  test("NotAllowedError (cancelling, or a timeout) is the neutral cancelled message", () => {
    expect(classifyPasskeyRegisterError(domError("NotAllowedError"))).toBe("cancelled")
  })

  test("InvalidStateError (this device already holds a passkey for the account) has its own message", () => {
    expect(classifyPasskeyRegisterError(domError("InvalidStateError"))).toBe("exists")
  })

  test("another WebAuthn DOMException is shown as a genuine failure", () => {
    expect(classifyPasskeyRegisterError(domError("SecurityError"))).toBe("failed")
  })

  test("a generic Error (e.g. the server action itself threw) is a genuine failure", () => {
    expect(classifyPasskeyRegisterError(new Error("network down"))).toBe("failed")
  })

  test("a non-Error throw (no .name to read) is a genuine failure", () => {
    expect(classifyPasskeyRegisterError("nope")).toBe("failed")
    expect(classifyPasskeyRegisterError(undefined)).toBe("failed")
  })
})

const messages = {
  cancelled: "Adding a passkey was cancelled.",
  exists: "This device already has a passkey for your account.",
  failed: "That didn't work.",
}

describe("passkeyRegisterErrorState", () => {
  test('"cancelled" is a neutral ok: true state, never the destructive alert', () => {
    expect(passkeyRegisterErrorState("cancelled", messages)).toEqual({
      ok: true,
      message: "Adding a passkey was cancelled.",
    })
  })

  test('"exists" is an ok: false state with its own message, not "try again"', () => {
    expect(passkeyRegisterErrorState("exists", messages)).toEqual({
      ok: false,
      message: "This device already has a passkey for your account.",
    })
  })

  test('"failed" is an ok: false state', () => {
    expect(passkeyRegisterErrorState("failed", messages)).toEqual({
      ok: false,
      message: "That didn't work.",
    })
  })

  test('"none" (a superseded ceremony) shows nothing, leaving the caller\'s state as is', () => {
    expect(passkeyRegisterErrorState("none", messages)).toBeUndefined()
  })
})

describe("focusHeadingAfterRemove", () => {
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

  test("a successful removal focuses the Passkeys card's heading", () => {
    const { doc, calls } = fakeDocument()
    focusHeadingAfterRemove({ ok: true, message: "Passkey removed." }, doc)
    expect(calls).toEqual({ lookedUp: [PASSKEYS_HEADING_ID], focused: 1 })
  })

  test("a refused removal leaves focus where it is (the row's own Remove button)", () => {
    const { doc, calls } = fakeDocument()
    focusHeadingAfterRemove({ ok: false, message: "Passkey not found" }, doc)
    expect(calls).toEqual({ lookedUp: [], focused: 0 })
  })

  test("the initial (unanswered) state focuses nothing", () => {
    const { doc, calls } = fakeDocument()
    focusHeadingAfterRemove({ ok: false }, doc)
    expect(calls.focused).toBe(0)
  })

  test("a heading that is not on the page is not an error", () => {
    const { doc } = fakeDocument(false)
    expect(() => focusHeadingAfterRemove({ ok: true }, doc)).not.toThrow()
  })
})
