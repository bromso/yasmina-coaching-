import { describe, expect, mock, test } from "bun:test"
import { MEMBER_OFFERING_KEYS, OFFERING_KEYS } from "@repo/api-contract/booking-limits"

mock.module("server-only", () => ({}))
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))

const { generateMetadata } = await import("./page")

const metadataFor = (offering: string) =>
  generateMetadata({ params: Promise.resolve({ offering }), searchParams: Promise.resolve({}) })

describe("/book/[offering] metadata", () => {
  test("members' booking pages are kept out of search engines", async () => {
    for (const key of MEMBER_OFFERING_KEYS) {
      expect((await metadataFor(key)).robots).toEqual({ index: false })
    }
  })

  test("every listed offering stays indexable", async () => {
    const members: readonly string[] = MEMBER_OFFERING_KEYS
    for (const key of OFFERING_KEYS.filter((k) => !members.includes(k))) {
      const metadata = await metadataFor(key)
      expect(metadata.title).toBeTruthy()
      expect(metadata.robots).toBeUndefined()
    }
  })
})
