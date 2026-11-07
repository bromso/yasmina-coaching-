import { afterAll, describe, expect, test } from "bun:test"
import {
  bunWebhookFetch,
  classifyStatus,
  dialUrl,
  hostHeader,
  postToCheckedAddresses,
  type WebhookFetch,
} from "./deliver"
import { checkWebhookUrl, type Resolver } from "./ssrf"

const resolveTo =
  (...addresses: string[]): Resolver =>
  async () =>
    addresses

async function checked(url: string, resolve: Resolver = resolveTo("93.184.216.34")) {
  const check = await checkWebhookUrl(url, { resolve, allowLocalhostHttp: true })
  if (!check.ok) throw new Error(`refused: ${check.reason}`)
  return check
}

describe("dialUrl and hostHeader", () => {
  test("the checked address replaces the host; path and query stay; the port stays", async () => {
    const check = await checked("https://hooks.example.com:8443/in/x?a=1&b=2")
    expect(dialUrl(check, "93.184.216.34")).toBe("https://93.184.216.34:8443/in/x?a=1&b=2")
    expect(hostHeader(check)).toBe("hooks.example.com:8443")
  })

  test("IPv6 addresses (and IPv6 literal hosts) are bracketed", async () => {
    const check = await checked("https://hooks.example.com/in")
    expect(dialUrl(check, "2606:4700::1")).toBe("https://[2606:4700::1]/in")
    const literal = await checked("https://[2606:4700::1111]/in")
    expect(hostHeader(literal)).toBe("[2606:4700::1111]")
  })

  test("a trailing dot never reaches Host (or SNI)", async () => {
    const check = await checked("https://hooks.example.com./in")
    expect(check.host).toBe("hooks.example.com")
    expect(hostHeader(check)).toBe("hooks.example.com")
  })
})

describe("classifyStatus", () => {
  test("2xx success, 410 gone, 3xx redirect, anything else http", () => {
    expect(classifyStatus(200)).toEqual({ kind: "success", status: 200 })
    expect(classifyStatus(299)).toEqual({ kind: "success", status: 299 })
    expect(classifyStatus(410)).toEqual({ kind: "gone", status: 410 })
    for (const status of [300, 301, 302, 307, 308])
      expect(classifyStatus(status)).toEqual({ kind: "failure", status, error: "redirect" })
    for (const status of [199, 400, 404, 429, 500, 503])
      expect(classifyStatus(status)).toEqual({ kind: "failure", status, error: "http" })
  })
})

describe("postToCheckedAddresses against a real server", () => {
  const slow = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch() {
      await Bun.sleep(500)
      return new Response("late")
    },
  })
  const chatty = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch() {
      const stream = new ReadableStream({
        pull(controller) {
          controller.enqueue(new TextEncoder().encode("x".repeat(1024)))
        },
      })
      return new Response(stream, { status: 200 })
    },
  })
  afterAll(() => {
    slow.stop(true)
    chatty.stop(true)
  })

  test("an answer slower than the attempt's deadline is a timeout", async () => {
    const check = await checked(`http://slow.localhost:${slow.port}/`)
    const outcome = await postToCheckedAddresses({
      check,
      body: "{}",
      headers: {},
      fetch: bunWebhookFetch,
      signal: new AbortController().signal,
      timeoutMs: 50,
    })
    expect(outcome).toEqual({ kind: "failure", status: null, error: "timeout" })
  })

  test("a 2xx with an endless body succeeds without reading it", async () => {
    const check = await checked(`http://chatty.localhost:${chatty.port}/`)
    const outcome = await postToCheckedAddresses({
      check,
      body: "{}",
      headers: {},
      fetch: bunWebhookFetch,
      signal: new AbortController().signal,
    })
    // Returning at all proves the body was cancelled, not read: it never ends.
    expect(outcome).toEqual({ kind: "success", status: 200 })
  })

  test("nothing is dialled once the job's own signal has fired", async () => {
    const controller = new AbortController()
    controller.abort()
    const calls: string[] = []
    const fetch: WebhookFetch = async (url) => {
      calls.push(url)
      return new Response(null, { status: 204 })
    }
    const outcome = await postToCheckedAddresses({
      check: await checked("https://hooks.example.com/"),
      body: "{}",
      headers: {},
      fetch,
      signal: controller.signal,
    })
    expect(outcome).toEqual({ kind: "failure", status: null, error: "timeout" })
    expect(calls).toEqual([])
  })

  test("every address refusing the connection is a network failure", async () => {
    const calls: string[] = []
    const fetch: WebhookFetch = async (url) => {
      calls.push(url)
      throw new Error("ECONNREFUSED")
    }
    const outcome = await postToCheckedAddresses({
      check: await checked("https://hooks.example.com/", resolveTo("203.0.114.1", "203.0.114.2")),
      body: "{}",
      headers: {},
      fetch,
      signal: new AbortController().signal,
    })
    expect(outcome).toEqual({ kind: "failure", status: null, error: "network" })
    expect(calls).toEqual(["https://203.0.114.1/", "https://203.0.114.2/"])
  })
})

describe("one deadline for the whole attempt", () => {
  test("addresses failing slowly one after another end as a timeout, not network", async () => {
    const fetch: WebhookFetch = async () => {
      await Bun.sleep(40)
      throw new Error("ECONNRESET")
    }
    const outcome = await postToCheckedAddresses({
      check: await checked("https://hooks.example.com/", resolveTo("203.0.114.1", "203.0.114.2")),
      body: "{}",
      headers: {},
      fetch,
      signal: new AbortController().signal,
      timeoutMs: 60,
    })
    expect(outcome).toEqual({ kind: "failure", status: null, error: "timeout" })
  })
})

// Bun 1.4.2 ignores `proxy: false`: with HTTP_PROXY set, a delivery still goes through the proxy.
// What must hold either way is that the request names the address the guard checked (never the
// hostname, which the proxy would resolve again). Bun reads the proxy env once per process, so
// this runs the delivery in a child process with HTTP_PROXY pointing at a recording proxy here.
describe("with HTTP_PROXY set", () => {
  test("whatever reaches the network asks for the checked address, never the hostname", async () => {
    const proxied: string[][] = []
    const proxy = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: {
        data(socket, data) {
          proxied.push(data.toString().split("\r\n"))
          socket.write("HTTP/1.1 204 No Content\r\nconnection: close\r\n\r\n")
          socket.end()
        },
      },
    })
    const direct: string[] = []
    const receiver = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch(req) {
        direct.push(req.url)
        return new Response(null, { status: 204 })
      },
    })
    try {
      const script = `
        import { bunWebhookFetch, postToCheckedAddresses } from ${JSON.stringify(`${import.meta.dir}/deliver.ts`)}
        import { checkWebhookUrl } from ${JSON.stringify(`${import.meta.dir}/ssrf.ts`)}
        const check = await checkWebhookUrl("http://receiver.localhost:${receiver.port}/hook?x=1", {
          resolve: async () => [],
          allowLocalhostHttp: true,
        })
        const outcome = await postToCheckedAddresses({
          check, body: "{}", headers: {}, fetch: bunWebhookFetch,
          signal: new AbortController().signal,
        })
        console.log(JSON.stringify(outcome))
      `
      const child = Bun.spawn([process.execPath, "-e", script], {
        env: { ...process.env, HTTP_PROXY: `http://127.0.0.1:${proxy.port}`, NO_PROXY: "" },
        stdout: "pipe",
        stderr: "pipe",
      })
      const [out, code] = await Promise.all([new Response(child.stdout).text(), child.exited])
      expect(code).toBe(0)
      expect(JSON.parse(out.trim())).toEqual({ kind: "success", status: 204 })
      expect(proxied.length + direct.length).toBe(1)
      if (proxied.length === 1) {
        // Today (Bun 1.4.2): through the proxy, asking for the checked IP, Host naming the host.
        const [requestLine, ...headers] = proxied[0] as string[]
        expect(requestLine).toBe(`POST http://127.0.0.1:${receiver.port}/hook?x=1 HTTP/1.1`)
        expect(headers).toContain(`Host: receiver.localhost:${receiver.port}`)
      } else {
        // A runtime that honours `proxy: false` connects to the checked address itself.
        expect(direct).toHaveLength(1)
      }
    } finally {
      proxy.stop(true)
      receiver.stop(true)
    }
  })
})
