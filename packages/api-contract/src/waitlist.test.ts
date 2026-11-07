import { describe, expect, test } from "bun:test"
import { WaitlistJoinResultSchema, WaitlistJoinSchema } from "./waitlist"

describe("waitlist schemas", () => {
  test("the email is normalised and the source defaults to www", () => {
    expect(WaitlistJoinSchema.parse({ email: " Ada@Example.com " })).toEqual({
      email: "ada@example.com",
      source: "www",
    })
    expect(WaitlistJoinSchema.parse({ email: "a@b.co", source: "jobs" }).source).toBe("jobs")
  })

  test("an unknown source or an invalid email is rejected", () => {
    expect(WaitlistJoinSchema.safeParse({ email: "a@b.co", source: "auth" }).success).toBe(false)
    expect(WaitlistJoinSchema.safeParse({ email: "nope" }).success).toBe(false)
  })

  test("the result only ever says joined", () => {
    expect(WaitlistJoinResultSchema.safeParse({ joined: true }).success).toBe(true)
    expect(WaitlistJoinResultSchema.safeParse({ joined: false }).success).toBe(false)
  })
})
