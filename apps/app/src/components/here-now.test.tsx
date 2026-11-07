import { describe, expect, test } from "bun:test"
import type { PresenceMember } from "@repo/api-contract/realtime"
import { renderIn } from "@/test-intl"
import { HereNow } from "./here-now"

describe("HereNow", () => {
  test("renders nothing when no one is here", () => {
    const html = renderIn("en", <HereNow members={[]} />)
    expect(html).toBe("")
  })

  test("one member reads '1 person here'", () => {
    const members: PresenceMember[] = [{ userId: 1, name: "Ada Lovelace", avatarUrl: null }]
    const html = renderIn("en", <HereNow members={members} />)
    expect(html).toContain("1 person here")
    expect(html).toContain(">AL<")
  })

  test("three members read '3 people here' with an image or initials each", () => {
    const members: PresenceMember[] = [
      { userId: 1, name: "Ada Lovelace", avatarUrl: null },
      { userId: 2, name: "Zoe", avatarUrl: "https://cdn.example.com/zoe.png" },
      { userId: 3, name: "Max Headroom", avatarUrl: null },
    ]
    const html = renderIn("en", <HereNow members={members} />)
    expect(html).toContain("3 people here")
    expect(html).toContain(">AL<")
    expect(html).toContain(">MH<")
    expect(html).toMatch(/<img[^>]*src="https:\/\/cdn\.example\.com\/zoe\.png"[^>]*alt=""/)
    // Names are the title attribute, never an email — PresenceMember carries none.
    expect(html).toContain('title="Zoe"')
    expect(html).not.toContain("@")
  })

  test("in Swedish the count is an ICU plural", () => {
    const one: PresenceMember[] = [{ userId: 1, name: "Ada Lovelace", avatarUrl: null }]
    expect(renderIn("sv", <HereNow members={one} />)).toContain("1 person här")
    const three: PresenceMember[] = [1, 2, 3].map((userId) => ({
      userId,
      name: "Ada Lovelace",
      avatarUrl: null,
    }))
    expect(renderIn("sv", <HereNow members={three} />)).toContain("3 personer här")
  })
})
