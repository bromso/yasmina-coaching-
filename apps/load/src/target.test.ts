import { describe, expect, test } from "bun:test"
import { DEV_TOKEN } from "@repo/ai-contract"
import { DEV_API_TOKEN } from "@repo/api-contract"
import { isLocalHost, targets } from "./target"

describe("targets", () => {
  test("defaults to the local dev ports and the public dev tokens", () => {
    const t = targets({})
    expect(t.api.origin).toBe("http://api.brand.localhost:3007")
    expect(t.ai.origin).toBe("http://ai.brand.localhost:3008")
    expect(t.apiToken).toBe(DEV_API_TOKEN)
    expect(t.aiToken).toBe(DEV_TOKEN)
  })

  test("a remote host is refused", () => {
    expect(() => targets({ LOAD_TARGET_API: "https://api.example.com" })).toThrow(
      "LOAD_ALLOW_REMOTE"
    )
    expect(() => targets({ LOAD_TARGET_AI: "https://ai.example.com" })).toThrow("not a local host")
  })

  test("LOAD_ALLOW_REMOTE=1 lets it through", () => {
    const t = targets({ LOAD_TARGET_API: "https://api.example.com", LOAD_ALLOW_REMOTE: "1" })
    expect(t.api.hostname).toBe("api.example.com")
  })

  test("local hosts pass", () => {
    const t = targets({
      LOAD_TARGET_API: "http://api.brand.localhost:3007",
      LOAD_TARGET_AI: "http://127.0.0.1:3038",
      API_SERVICE_TOKEN: "a",
      AI_SERVICE_TOKEN: "b",
    })
    expect(t.api.port).toBe("3007")
    expect(t.apiToken).toBe("a")
    expect(t.aiToken).toBe("b")
    for (const host of ["127.0.0.1", "localhost", "[::1]", "x.localhost", "LOCALHOST"]) {
      expect(isLocalHost(host)).toBe(true)
    }
    for (const host of ["localhost.example.com", "10.0.0.1", "127.0.0.2.nip.io", "example.com"]) {
      expect(isLocalHost(host)).toBe(false)
    }
  })
})
