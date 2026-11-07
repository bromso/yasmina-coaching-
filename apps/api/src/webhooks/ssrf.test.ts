import { describe, expect, test } from "bun:test"
import {
  checkWebhookUrl,
  isPublicAddress,
  type Resolver,
  resolverWithTimeout,
  type WebhookUrlRefusal,
} from "./ssrf"

describe("isPublicAddress: IPv4", () => {
  // One address at each edge of every refused range, plus one inside.
  const refused = [
    ["0.0.0.0/8", ["0.0.0.0", "0.255.255.255"]],
    ["10.0.0.0/8", ["10.0.0.0", "10.1.2.3", "10.255.255.255"]],
    ["100.64.0.0/10", ["100.64.0.0", "100.100.100.100", "100.127.255.255"]],
    ["127.0.0.0/8", ["127.0.0.1", "127.255.255.255"]],
    ["169.254.0.0/16", ["169.254.0.0", "169.254.169.254", "169.254.255.255"]],
    ["172.16.0.0/12", ["172.16.0.0", "172.20.1.1", "172.31.255.255"]],
    ["192.0.0.0/24", ["192.0.0.0", "192.0.0.255"]],
    ["192.0.2.0/24", ["192.0.2.0", "192.0.2.255"]],
    ["192.168.0.0/16", ["192.168.0.0", "192.168.1.1", "192.168.255.255"]],
    ["198.18.0.0/15", ["198.18.0.0", "198.19.255.255"]],
    ["198.51.100.0/24", ["198.51.100.0", "198.51.100.255"]],
    ["203.0.113.0/24", ["203.0.113.0", "203.0.113.255"]],
    ["224.0.0.0/4", ["224.0.0.0", "239.255.255.255"]],
    ["240.0.0.0/4", ["240.0.0.0", "254.255.255.255"]],
    ["broadcast", ["255.255.255.255"]],
    ["192.88.99.0/24 (6to4 relay anycast)", ["192.88.99.0", "192.88.99.255"]],
  ] as const
  for (const [range, addresses] of refused) {
    test(`refuses ${range}`, () => {
      for (const address of addresses) expect(isPublicAddress(address)).toBe(false)
    })
  }

  test("accepts public addresses, including the neighbours of every refused range", () => {
    for (const address of [
      "1.1.1.1",
      "8.8.8.8",
      "9.255.255.255",
      "11.0.0.0",
      "100.63.255.255",
      "100.128.0.0",
      "126.255.255.255",
      "128.0.0.0",
      "169.253.255.255",
      "169.255.0.0",
      "172.15.255.255",
      "172.32.0.0",
      "192.0.1.0",
      "192.0.3.0",
      "192.167.255.255",
      "192.169.0.0",
      "198.17.255.255",
      "198.20.0.0",
      "198.51.99.255",
      "198.51.101.0",
      "203.0.112.255",
      "203.0.114.0",
      "192.88.98.255",
      "192.88.100.0",
      "223.255.255.255",
    ])
      expect(isPublicAddress(address)).toBe(true)
  })
})

describe("isPublicAddress: IPv6", () => {
  const refused = [
    ["::/128", ["::", "0:0:0:0:0:0:0:0"]],
    ["::1/128", ["::1", "0:0:0:0:0:0:0:1"]],
    ["fc00::/7", ["fc00::", "fd12:3456:789a::1", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"]],
    ["fe80::/10", ["fe80::", "fe80::1", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fe80::1%lo0"]],
    ["ff00::/8", ["ff00::", "ff02::1", "ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff"]],
    ["64:ff9b::/96 (NAT64)", ["64:ff9b::", "64:ff9b::8.8.8.8", "64:ff9b::ffff:ffff"]],
    ["64:ff9b:1::/48 (local NAT64)", ["64:ff9b:1::1"]],
    ["2001:db8::/32", ["2001:db8::", "2001:db8::1", "2001:db8:ffff:ffff:ffff:ffff:ffff:ffff"]],
    ["2001::/32 (Teredo)", ["2001::1", "2001:0:4136:e378:8000:63bf:3fff:fdd2"]],
    [
      "2001::/23 (IANA special-purpose: ORCHID, benchmarking…)",
      ["2001:10::1", "2001:20::1", "2001:1ff::1"],
    ],
    ["3fff::/20 (documentation)", ["3fff::", "3fff:fff:ffff::1"]],
    ["6to4 of a private address", ["2002:7f00:1::", "2002:0a00:0001::1", "2002:c0a8:0101::"]],
    ["outside 2000::/3", ["100::1", "1000::1", "4000::1", "e000::1"]],
  ] as const
  for (const [range, addresses] of refused) {
    test(`refuses ${range}`, () => {
      for (const address of addresses) expect(isPublicAddress(address)).toBe(false)
    })
  }

  test("IPv4-mapped (::ffff:a.b.c.d) is judged by its IPv4 address, in either spelling", () => {
    for (const address of [
      "::ffff:127.0.0.1",
      "::ffff:7f00:1",
      "::ffff:10.0.0.1",
      "::ffff:169.254.169.254",
      "::ffff:a9fe:a9fe",
      "::ffff:192.168.1.1",
      "::ffff:0.0.0.0",
      "0:0:0:0:0:ffff:127.0.0.1",
      "::ffff:255.255.255.255",
    ])
      expect(isPublicAddress(address)).toBe(false)
    expect(isPublicAddress("::ffff:8.8.8.8")).toBe(true)
    expect(isPublicAddress("::ffff:808:808")).toBe(true)
  })

  test("IPv4-compatible (::a.b.c.d) is judged by its IPv4 address", () => {
    for (const address of ["::127.0.0.1", "::7f00:1", "::10.0.0.1", "::169.254.169.254"])
      expect(isPublicAddress(address)).toBe(false)
    expect(isPublicAddress("::8.8.8.8")).toBe(true)
  })

  test("IPv4-translated (::ffff:0:a.b.c.d) is judged by its IPv4 address", () => {
    expect(isPublicAddress("::ffff:0:127.0.0.1")).toBe(false)
    expect(isPublicAddress("::ffff:0:8.8.8.8")).toBe(true)
  })

  test("accepts global unicast", () => {
    for (const address of [
      "2606:4700:4700::1111",
      "2001:4860:4860::8888",
      "2a00:1450:4001::200e",
      "2002:0808:0808::1",
      "2001:db7:ffff::1",
      "2001:db9::1",
      "2001:200::1",
      "3ffe:ffff::1",
      "3fff:1000::1",
    ])
      expect(isPublicAddress(address)).toBe(true)
  })

  test("anything that is not an IP address is not public", () => {
    for (const value of ["", "example.com", "256.0.0.1", "1.2.3", "::g", "[::1]", " 8.8.8.8"])
      expect(isPublicAddress(value)).toBe(false)
  })
})

const resolveTo =
  (...addresses: string[]): Resolver =>
  async () =>
    addresses
const strict = (resolve: Resolver) => ({ resolve, allowLocalhostHttp: false })

describe("checkWebhookUrl", () => {
  test("a public https URL passes with every checked address, the host and the port", async () => {
    const calls: string[] = []
    const resolve: Resolver = async (host) => {
      calls.push(host)
      return ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"]
    }
    const result = await checkWebhookUrl("https://hooks.example.com/in?x=1", strict(resolve))
    expect(result).toEqual({
      ok: true,
      url: new URL("https://hooks.example.com/in?x=1"),
      host: "hooks.example.com",
      port: 443,
      addresses: ["93.184.216.34", "2606:2800:220:1:248:1893:25c8:1946"],
    })
    expect(calls).toEqual(["hooks.example.com"])
  })

  test("a non-default port is kept", async () => {
    const result = await checkWebhookUrl("https://example.com:8443/", strict(resolveTo("1.1.1.1")))
    expect(result).toMatchObject({ ok: true, port: 8443 })
  })

  test("any non-public address among the answers refuses the whole URL", async () => {
    for (const mixed of [
      ["93.184.216.34", "10.0.0.1"],
      ["2606:4700::1", "::1"],
      ["1.1.1.1", "::ffff:127.0.0.1"],
      ["169.254.169.254"],
    ]) {
      const result = await checkWebhookUrl("https://example.com/", strict(resolveTo(...mixed)))
      expect(result).toEqual({ ok: false, reason: "blocked" })
    }
  })

  test("a host that does not resolve, or resolves to nothing, is unresolvable", async () => {
    const failing: Resolver = async () => {
      throw new Error("ENOTFOUND")
    }
    expect(await checkWebhookUrl("https://nope.example/", strict(failing))).toEqual({
      ok: false,
      reason: "unresolvable",
    })
    expect(await checkWebhookUrl("https://nope.example/", strict(resolveTo()))).toEqual({
      ok: false,
      reason: "unresolvable",
    })
  })

  test("an IP-literal host is checked as is, without resolving", async () => {
    const never: Resolver = async () => {
      throw new Error("must not resolve")
    }
    for (const url of [
      "https://127.0.0.1/",
      "https://10.0.0.1/",
      "https://169.254.169.254/latest/meta-data",
      "https://[::1]/",
      "https://[::ffff:127.0.0.1]/",
      "https://[fe80::1]/",
      // WHATWG URL spells these as 127.0.0.1.
      "https://2130706433/",
      "https://0x7f.1/",
      "https://0/",
    ])
      expect(await checkWebhookUrl(url, strict(never))).toEqual({ ok: false, reason: "blocked" })
    expect(await checkWebhookUrl("https://8.8.8.8/", strict(never))).toMatchObject({
      ok: true,
      host: "8.8.8.8",
      addresses: ["8.8.8.8"],
    })
    expect(await checkWebhookUrl("https://[2606:4700::1111]/", strict(never))).toMatchObject({
      ok: true,
      host: "2606:4700::1111",
      addresses: ["2606:4700::1111"],
    })
  })

  test("only https; no userinfo; no fragment; at most 2000 characters; a real URL", async () => {
    const resolve = resolveTo("1.1.1.1")
    const cases: Array<[string, WebhookUrlRefusal]> = [
      ["http://example.com/", "scheme"],
      ["ftp://example.com/", "scheme"],
      ["file:///etc/passwd", "scheme"],
      ["javascript:alert(1)", "scheme"],
      ["https://user@example.com/", "credentials"],
      ["https://user:pass@example.com/", "credentials"],
      ["https://:pass@example.com/", "credentials"],
      ["https://example.com/#frag", "fragment"],
      ["https://example.com/#", "fragment"],
      [`https://example.com/${"a".repeat(2000)}`, "too_long"],
      ["not a url", "invalid"],
      ["", "invalid"],
      ["https://", "invalid"],
    ]
    for (const [url, reason] of cases)
      expect(await checkWebhookUrl(url, strict(resolve))).toEqual({ ok: false, reason })
    const exactly = `https://example.com/${"a".repeat(2000 - "https://example.com/".length)}`
    expect(exactly).toHaveLength(2000)
    expect(await checkWebhookUrl(exactly, strict(resolve))).toMatchObject({ ok: true })
    // The limit is on the normalised URL that is stored: 1017 characters typed, but every "é"
    // becomes "%C3%A9", 6017 once parsed.
    const accented = `https://example.com/${"é".repeat(1000)}`
    expect(accented.length).toBeLessThan(2000)
    expect(new URL(accented).href.length).toBeGreaterThan(2000)
    expect(await checkWebhookUrl(accented, strict(resolve))).toEqual({
      ok: false,
      reason: "too_long",
    })
  })

  test("localhost: refused in production mode, whatever the scheme and without resolving", async () => {
    const never: Resolver = async () => {
      throw new Error("must not resolve")
    }
    for (const url of [
      "https://localhost/",
      "https://app.brand.localhost:3001/hook",
      "https://LOCALHOST./",
      "http://receiver.localhost:4000/",
    ]) {
      const result = await checkWebhookUrl(url, strict(never))
      expect(result.ok).toBe(false)
    }
    expect(await checkWebhookUrl("https://a.localhost/", strict(never))).toEqual({
      ok: false,
      reason: "blocked",
    })
  })

  test("allowLocalhostHttp: http or https to localhost and *.localhost, pinned to loopback", async () => {
    const never: Resolver = async () => {
      throw new Error("must not resolve")
    }
    const dev = { resolve: never, allowLocalhostHttp: true }
    expect(await checkWebhookUrl("http://receiver.brand.localhost:4100/hook", dev)).toEqual({
      ok: true,
      url: new URL("http://receiver.brand.localhost:4100/hook"),
      host: "receiver.brand.localhost",
      port: 4100,
      addresses: ["127.0.0.1"],
    })
    expect(await checkWebhookUrl("http://localhost/", dev)).toMatchObject({ ok: true, port: 80 })
    expect(await checkWebhookUrl("https://x.localhost/", dev)).toMatchObject({
      ok: true,
      port: 443,
    })
  })

  test("allowLocalhostHttp opens nothing else: http elsewhere, private literals, lookalikes", async () => {
    const dev = { resolve: resolveTo("127.0.0.1"), allowLocalhostHttp: true }
    expect(await checkWebhookUrl("http://example.com/", dev)).toEqual({
      ok: false,
      reason: "scheme",
    })
    expect(await checkWebhookUrl("http://127.0.0.1/", dev)).toEqual({ ok: false, reason: "scheme" })
    expect(await checkWebhookUrl("https://127.0.0.1/", dev)).toEqual({
      ok: false,
      reason: "blocked",
    })
    // A public-looking name ending in "localhost" without the dot is an ordinary name.
    expect(await checkWebhookUrl("https://evillocalhost/", dev)).toEqual({
      ok: false,
      reason: "blocked",
    })
    expect(await checkWebhookUrl("https://localhost.example.com/", dev)).toEqual({
      ok: false,
      reason: "blocked",
    })
    expect(await checkWebhookUrl("http://user@x.localhost/", dev)).toEqual({
      ok: false,
      reason: "credentials",
    })
  })

  // Pinned so a refactor away from WHATWG `new URL` (or a Bun URL change) cannot regress quietly.
  test("URL-parsing quirks: numeric, dotted and encoded loopback, empty userinfo, zone ids", async () => {
    const never: Resolver = async () => {
      throw new Error("must not resolve")
    }
    const cases: Array<[string, WebhookUrlRefusal]> = [
      ["https://127.1/", "blocked"],
      ["https://0177.0.0.1/", "blocked"],
      ["https://0x7f000001/", "blocked"],
      ["https://127.0.0.1./", "blocked"],
      ["https://127.0.0.1.:443/", "blocked"],
      ["https://[::ffff:7f00:1]/", "blocked"],
      ["https://[64:ff9b::7f00:1]/", "blocked"],
      ["https://@example.com/", "credentials"],
      ["https://[fe80::1%25lo0]/", "invalid"],
      ["https://loc%61lhost/", "blocked"],
      ["https://localhost%2e/", "blocked"],
      ["https://foo.localhost\u3002/", "blocked"],
    ]
    for (const [url, reason] of cases)
      expect(await checkWebhookUrl(url, strict(never))).toEqual({ ok: false, reason })
  })

  test("an IDN host is resolved as punycode", async () => {
    const calls: string[] = []
    const resolve: Resolver = async (host) => {
      calls.push(host)
      return ["93.184.216.34"]
    }
    expect(await checkWebhookUrl("https://bücher.example/", strict(resolve))).toMatchObject({
      ok: true,
      host: "xn--bcher-kva.example",
    })
    expect(calls).toEqual(["xn--bcher-kva.example"])
  })

  test("a trailing dot is dropped from the host (SNI forbids it); the URL keeps it", async () => {
    const calls: string[] = []
    const resolve: Resolver = async (host) => {
      calls.push(host)
      return ["93.184.216.34"]
    }
    const result = await checkWebhookUrl("https://hooks.example.com./in", strict(resolve))
    expect(result).toMatchObject({ ok: true, host: "hooks.example.com", port: 443 })
    expect(result.ok && result.url.href).toBe("https://hooks.example.com./in")
    expect(calls).toEqual(["hooks.example.com"])
    const dev = { resolve, allowLocalhostHttp: true }
    expect(await checkWebhookUrl("http://receiver.localhost.:4100/", dev)).toMatchObject({
      ok: true,
      host: "receiver.localhost",
    })
  })

  test("port 0 is not a port", async () => {
    expect(await checkWebhookUrl("https://example.com:0/", strict(resolveTo("1.1.1.1")))).toEqual({
      ok: false,
      reason: "invalid",
    })
  })
})

describe("resolverWithTimeout", () => {
  test("rejects a lookup that takes too long (the guard reads it as unresolvable)", async () => {
    const hanging: Resolver = () => new Promise(() => {})
    const resolve = resolverWithTimeout(hanging, 20)
    await expect(resolve("slow.example")).rejects.toThrow(/timed out/)
    expect(await checkWebhookUrl("https://slow.example/", strict(resolve))).toEqual({
      ok: false,
      reason: "unresolvable",
    })
  })

  test("passes a timely answer through", async () => {
    const resolve = resolverWithTimeout(resolveTo("1.1.1.1"), 1_000)
    expect(await resolve("fast.example")).toEqual(["1.1.1.1"])
  })
})
