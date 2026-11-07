import { describe, expect, test } from "bun:test"
import { ORPCError } from "@orpc/client"
import { isPlausibleToken, verifyEmailCore, verifyEmailState } from "./verify-email"

const good = "a".repeat(43)

describe("isPlausibleToken", () => {
  test("accepts exactly 43 base64url characters", () => {
    expect(isPlausibleToken(good)).toBe(true)
    expect(isPlausibleToken(`${"A-_z".repeat(10)}abc`)).toBe(true)
  })
  test("rejects the wrong length or alphabet", () => {
    expect(isPlausibleToken("")).toBe(false)
    expect(isPlausibleToken(`${good}a`)).toBe(false)
    expect(isPlausibleToken(`${good.slice(1)}=`)).toBe(false)
  })
})

describe("verifyEmailCore", () => {
  test("does not call the api for an implausible token", async () => {
    let calls = 0
    const out = await verifyEmailCore(
      {
        verifyEmail: async () => {
          calls++
        },
      },
      "nope"
    )
    expect(out).toBe("invalid")
    expect(calls).toBe(0)
  })
  test("verified when the api accepts", async () => {
    expect(await verifyEmailCore({ verifyEmail: async () => {} }, good)).toBe("verified")
  })
  test("invalid when the api declares BAD_REQUEST, and when it is down", async () => {
    const bad = new ORPCError("BAD_REQUEST", { defined: true, message: "x" })
    expect(
      await verifyEmailCore(
        {
          verifyEmail: async () => {
            throw bad
          },
        },
        good
      )
    ).toBe("invalid")
    expect(
      await verifyEmailCore(
        {
          verifyEmail: async () => {
            throw new Error("down")
          },
        },
        good
      )
    ).toBe("invalid")
  })
})

describe("verifyEmailState", () => {
  test("an invalid link for a verified signed-in user is already-verified", () => {
    expect(verifyEmailState("invalid", { emailVerified: true })).toBe("already-verified")
  })
  test("otherwise the core's result stands", () => {
    expect(verifyEmailState("invalid", { emailVerified: false })).toBe("invalid")
    expect(verifyEmailState("invalid", null)).toBe("invalid")
    expect(verifyEmailState("verified", { emailVerified: true })).toBe("verified")
    expect(verifyEmailState("verified", null)).toBe("verified")
  })
})
