import { describe, expect, test } from "bun:test"
import { requestInfo } from "./request-info"

describe("requestInfo", () => {
  test("x-real-ip wins over x-forwarded-for", () => {
    const h = new Headers({
      "x-real-ip": "203.0.113.7",
      "x-forwarded-for": "198.51.100.1, 10.0.0.1",
    })
    expect(requestInfo(h).ip).toBe("203.0.113.7")
  })

  test("falls back to the first x-forwarded-for hop", () => {
    const h = new Headers({ "x-forwarded-for": " 198.51.100.1 , 10.0.0.1" })
    expect(requestInfo(h).ip).toBe("198.51.100.1")
  })

  test("neither header leaves ip undefined", () => {
    expect(requestInfo(new Headers()).ip).toBeUndefined()
    expect(requestInfo(new Headers({ "x-real-ip": "  " })).ip).toBeUndefined()
  })

  test("caps ip at 45 and user agent at 500 characters", () => {
    const h = new Headers({ "x-real-ip": "1".repeat(60), "user-agent": "u".repeat(600) })
    const info = requestInfo(h)
    expect(info.ip).toHaveLength(45)
    expect(info.userAgent).toHaveLength(500)
  })
})
