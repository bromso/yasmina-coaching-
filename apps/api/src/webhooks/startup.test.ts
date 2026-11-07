import { describe, expect, test } from "bun:test"
import { loadEnv } from "../env"
import { serverOptionsFromEnv } from "../server-options"
import {
  WEBHOOK_LOCALHOST_PRODUCTION_WARNING,
  webhookProxyWarning,
  webhookStartupWarnings,
} from "./startup"

describe("WEBHOOK_ALLOW_LOCALHOST_HTTP", () => {
  test("off by default in every NODE_ENV, development and test included", () => {
    for (const NODE_ENV of ["development", "test"] as const)
      expect(loadEnv({ NODE_ENV }).WEBHOOK_ALLOW_LOCALHOST_HTTP).toBe(false)
  })

  test("on when set, in any NODE_ENV; it is what reaches the server", () => {
    const env = loadEnv({ NODE_ENV: "development", WEBHOOK_ALLOW_LOCALHOST_HTTP: "true" })
    expect(env.WEBHOOK_ALLOW_LOCALHOST_HTTP).toBe(true)
    const production = { ...env, NODE_ENV: "production" as const }
    expect(production.WEBHOOK_ALLOW_LOCALHOST_HTTP).toBe(true)
    const deps = {} as Parameters<typeof serverOptionsFromEnv>[1]
    expect(serverOptionsFromEnv(env, deps).webhookAllowLocalhostHttp).toBe(true)
    expect(
      serverOptionsFromEnv(loadEnv({ NODE_ENV: "test" }), deps).webhookAllowLocalhostHttp
    ).toBe(false)
  })

  test("a value that is not a boolean is refused at startup", () => {
    expect(() => loadEnv({ NODE_ENV: "test", WEBHOOK_ALLOW_LOCALHOST_HTTP: "sometimes" })).toThrow()
  })

  test("on in production: one loud warning; on outside production: none", () => {
    expect(
      webhookStartupWarnings({ NODE_ENV: "production", WEBHOOK_ALLOW_LOCALHOST_HTTP: true }, {})
    ).toEqual([WEBHOOK_LOCALHOST_PRODUCTION_WARNING])
    expect(WEBHOOK_LOCALHOST_PRODUCTION_WARNING).toContain("never in a real deployment")
    expect(
      webhookStartupWarnings({ NODE_ENV: "development", WEBHOOK_ALLOW_LOCALHOST_HTTP: true }, {})
    ).toEqual([])
    expect(
      webhookStartupWarnings({ NODE_ENV: "production", WEBHOOK_ALLOW_LOCALHOST_HTTP: false }, {})
    ).toEqual([])
  })
})

describe("a proxy in the environment", () => {
  const off = { NODE_ENV: "production" as const, WEBHOOK_ALLOW_LOCALHOST_HTTP: false }

  test("HTTP_PROXY, HTTPS_PROXY or ALL_PROXY, in either case, gets one warning naming it", () => {
    for (const key of [
      "HTTP_PROXY",
      "http_proxy",
      "HTTPS_PROXY",
      "https_proxy",
      "ALL_PROXY",
      "all_proxy",
    ])
      expect(webhookStartupWarnings(off, { [key]: "http://proxy.internal:3128" })).toEqual([
        webhookProxyWarning(key),
      ])
    expect(
      webhookStartupWarnings(off, { HTTP_PROXY: "http://a:1", https_proxy: "http://b:2" })
    ).toEqual([webhookProxyWarning("HTTP_PROXY")])
  })

  test("blank or absent: no warning", () => {
    expect(webhookStartupWarnings(off, { HTTP_PROXY: "  ", NO_PROXY: "*" })).toEqual([])
  })
})
