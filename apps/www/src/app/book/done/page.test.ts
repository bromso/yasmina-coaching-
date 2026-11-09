import { describe, expect, mock, test } from "bun:test"

mock.module("server-only", () => ({}))
mock.module("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))

const { default: Page } = await import("./page")

type DoneProps = { kind: string; paid?: string; reference: string; manageUrl?: string }
const propsFor = async (query: Record<string, string>) =>
  ((await Page({ searchParams: Promise.resolve(query) })) as { props: DoneProps }).props

describe("/book/done query", () => {
  test("kind and paid are read only as known keys", async () => {
    expect(await propsFor({ ref: "BK-1", kind: "group", paid: "swish" })).toMatchObject({
      kind: "group",
      paid: "swish",
    })
    const junk = await propsFor({ ref: "BK-1", kind: "<b>", paid: "Betalt med kort" })
    expect(junk.kind).toBe("instant")
    expect(junk.paid).toBeUndefined()
  })

  test("the invoice cases pass; a mock line never shows with the mock off", async () => {
    expect((await propsFor({ ref: "BK-1", paid: "invoice_org" })).paid).toBe("invoice_org")
    const saved = process.env.NEXT_PUBLIC_BOOKING_PAYMENTS
    process.env.NEXT_PUBLIC_BOOKING_PAYMENTS = "off"
    try {
      expect((await propsFor({ ref: "BK-1", paid: "swish" })).paid).toBeUndefined()
      expect((await propsFor({ ref: "BK-1", paid: "invoice" })).paid).toBe("invoice")
    } finally {
      if (saved === undefined) delete process.env.NEXT_PUBLIC_BOOKING_PAYMENTS
      else process.env.NEXT_PUBLIC_BOOKING_PAYMENTS = saved
    }
  })

  test("a manage link off this site is dropped", async () => {
    const props = await propsFor({ ref: "BK-1", manage: "https://evil.example/book/manage/x" })
    expect(props.manageUrl).toBeUndefined()
  })
})
