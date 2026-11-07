import { describe, expect, test } from "bun:test"
import { classifyPasskeyError, quietCeremonyMayProceed } from "./passkey"

const domError = (name: string) => {
  const error = new Error(name)
  error.name = name
  return error
}

describe("classifyPasskeyError", () => {
  test("AbortError is never shown, on either ceremony", () => {
    expect(classifyPasskeyError(domError("AbortError"), true)).toBe("none")
    expect(classifyPasskeyError(domError("AbortError"), false)).toBe("none")
  })

  test("NotAllowedError (a user cancelling, or a timeout) is the neutral cancelled message, on either ceremony", () => {
    expect(classifyPasskeyError(domError("NotAllowedError"), true)).toBe("cancelled")
    expect(classifyPasskeyError(domError("NotAllowedError"), false)).toBe("cancelled")
  })

  test("another WebAuthn DOMException: shown on the explicit button, hidden on the quiet autofill ceremony", () => {
    expect(classifyPasskeyError(domError("InvalidStateError"), false)).toBe("failed")
    expect(classifyPasskeyError(domError("InvalidStateError"), true)).toBe("none")
    expect(classifyPasskeyError(domError("SecurityError"), false)).toBe("failed")
    expect(classifyPasskeyError(domError("SecurityError"), true)).toBe("none")
  })

  test("a generic Error (e.g. the server action itself threw): same split as a WebAuthn error", () => {
    expect(classifyPasskeyError(new Error("network down"), false)).toBe("failed")
    expect(classifyPasskeyError(new Error("network down"), true)).toBe("none")
  })

  test("a non-Error throw (no .name to read): same split, treated like any other unclassified failure", () => {
    expect(classifyPasskeyError("nope", false)).toBe("failed")
    expect(classifyPasskeyError("nope", true)).toBe("none")
    expect(classifyPasskeyError(undefined, false)).toBe("failed")
    expect(classifyPasskeyError(undefined, true)).toBe("none")
  })
})

describe("quietCeremonyMayProceed", () => {
  test("the quiet ceremony goes on while no explicit one has begun since it started", () => {
    expect(quietCeremonyMayProceed(0, 0)).toBe(true)
    // An explicit ceremony that had already ended before this quiet one started is no reason to stop.
    expect(quietCeremonyMayProceed(2, 2)).toBe(true)
  })

  test("a click after the quiet ceremony started makes it stand down, however many since", () => {
    expect(quietCeremonyMayProceed(0, 1)).toBe(false)
    expect(quietCeremonyMayProceed(1, 3)).toBe(false)
  })
})
