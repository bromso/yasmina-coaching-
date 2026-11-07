import { expect, mock, test } from "bun:test"

// `server-only` throws outside a react-server bundle, and createAuth reads Next's request scope:
// stub both so getAuth loads under bun test. Must run before the dynamic import below.
mock.module("server-only", () => ({}))
// The rest of next/headers and next/navigation stays real: a mock is process-wide under bun test,
// and other files import from them (the views' LiveNotes imports useRouter).
const nextHeaders = await import("next/headers")
mock.module("next/headers", () => ({
  ...nextHeaders,
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}))
const navigation = await import("next/navigation")
mock.module("next/navigation", () => ({
  ...navigation,
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`)
  },
}))
const { getAuth } = await import("./auth")

test("getAuth is built once with the dev defaults and keeps next= on our site", () => {
  const auth = getAuth()
  expect(getAuth()).toBe(auth)
  expect(auth.safeNextUrl("http://app.brand.localhost:3001/notes")).toBe(
    "http://app.brand.localhost:3001/notes"
  )
  expect(auth.safeNextUrl("https://evil.com")).toBe("http://app.brand.localhost:3001")
})
