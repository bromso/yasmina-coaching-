import { afterEach, expect, test } from "bun:test"
import { createLifecycle, DEFAULT_READY_TIMEOUT_MS, readyRoute } from "./lifecycle"

const servers: Array<{ stop(force?: boolean): Promise<void> }> = []
const pending: Array<() => void> = []
afterEach(async () => {
  // Settle handlers a test left open first: on Bun 1.3, stopping a server that is already stopped
  // but still holds a pending handler never resolves.
  for (const release of pending.splice(0)) release()
  for (const s of servers.splice(0)) await s.stop(true)
})

/** A real server whose /slow request stays open until `release()` is called. */
function slowServer() {
  let release = () => {}
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (req) =>
      new URL(req.url).pathname === "/slow"
        ? new Promise<Response>((resolve) => {
            release = () => resolve(new Response("finished"))
            pending.push(release)
          })
        : new Response("fast"),
  })
  servers.push(server)
  return { server, release: () => release() }
}

test("readiness flips first, and cleanup runs once after draining", async () => {
  let cleanups = 0
  const { server } = slowServer()
  const lifecycle = createLifecycle({
    drainMs: 1_000,
    cleanup: () => void cleanups++,
    log: () => {},
  })
  expect(lifecycle.ready()).toBe(true)
  const done = lifecycle.shutdown(server)
  expect(lifecycle.ready()).toBe(false)
  await done
  expect(cleanups).toBe(1)
})

test("an in-flight request finishes inside drainMs", async () => {
  const { server, release } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 2_000, log: () => {} })
  const inflight = fetch(new URL("/slow", server.url)).then((r) => r.text())
  await Bun.sleep(50)
  const done = lifecycle.shutdown(server)
  release()
  expect(await inflight).toBe("finished")
  await done
})

test("a request still running after drainMs does not hold the shutdown open", async () => {
  const { server } = slowServer()
  const messages: string[] = []
  const lifecycle = createLifecycle({ drainMs: 100, log: (m) => messages.push(m) })
  const inflight = fetch(new URL("/slow", server.url)).catch(() => undefined)
  await Bun.sleep(50)
  const started = performance.now()
  await lifecycle.shutdown(server)
  // drainMs, then at most FORCE_STOP_WAIT_MS for the forced stop to report back.
  expect(performance.now() - started).toBeLessThan(1_000)
  expect(messages.join(" ")).toContain("cut off")
  // Bun 1.4 severs the connection here; Bun 1.3 only when the process exits (next test).
  void inflight
})

test("SIGTERM with a request still running: the process exits promptly and the client is cut off", async () => {
  // A real service process holding one request open forever, shut down by a real signal.
  const script = `
    import { createLifecycle } from ${JSON.stringify(new URL("./lifecycle.ts", import.meta.url).pathname)}
    const server = Bun.serve({
      hostname: "127.0.0.1",
      port: 0,
      fetch: () => new Promise(() => {}),
    })
    createLifecycle({ drainMs: 200, log: () => {} }).installSignalHandlers(server)
    console.log(server.url.href)
  `
  const child = Bun.spawn([process.execPath, "-e", script], { stdout: "pipe", stderr: "pipe" })
  const reader = child.stdout.getReader()
  const { value } = await reader.read()
  const url = new TextDecoder().decode(value).trim()
  const inflight = fetch(url).then(
    () => "answered",
    () => "cut off"
  )
  await Bun.sleep(100)
  const started = performance.now()
  child.kill("SIGTERM")
  expect(await child.exited).toBe(0)
  expect(performance.now() - started).toBeLessThan(3_000)
  expect(await inflight).toBe("cut off")
}, 10_000)

test("a second shutdown is the same shutdown: cleanup still runs once", async () => {
  let cleanups = 0
  const { server } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 500, cleanup: () => void cleanups++, log: () => {} })
  await Promise.all([lifecycle.shutdown(server), lifecycle.shutdown(server)])
  await lifecycle.shutdown(server)
  expect(cleanups).toBe(1)
})

test("graceMs keeps the listener up so a probe sees 503 before draining", async () => {
  const lifecycle = createLifecycle({ drainMs: 500, graceMs: 300, log: () => {} })
  const ready = readyRoute(lifecycle)
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    routes: { "/ready": ready },
    fetch: () => new Response("x"),
  })
  servers.push(server)
  expect((await fetch(new URL("/ready", server.url))).status).toBe(200)
  const done = lifecycle.shutdown(server)
  const during = await fetch(new URL("/ready", server.url))
  expect(during.status).toBe(503)
  expect(await during.json()).toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: "Shutting down",
  })
  await done
})

test("readyRoute answers 503 when its check fails", async () => {
  const lifecycle = createLifecycle({ drainMs: 100, log: () => {} })
  const ok = await readyRoute(lifecycle, () => undefined)()
  expect(ok.status).toBe(200)
  const failing = await readyRoute(lifecycle, async () => {
    throw new Error("db down")
  })()
  expect(failing.status).toBe(503)
  expect(await failing.json()).toMatchObject({ code: "SERVICE_UNAVAILABLE", message: "Not ready" })
})

test("readyRoute answers 503 when its check outlasts timeoutMs", async () => {
  const lifecycle = createLifecycle({ drainMs: 100, log: () => {} })
  let settle: () => void = () => {}
  const hanging = new Promise<void>((resolve) => (settle = resolve))
  const started = performance.now()
  const res = await readyRoute(lifecycle, () => hanging, { timeoutMs: 50 })()
  const ms = performance.now() - started
  expect(res.status).toBe(503)
  expect(await res.json()).toMatchObject({
    code: "SERVICE_UNAVAILABLE",
    message: "Not ready (timed out)",
  })
  expect(ms).toBeLessThan(1_000)
  // The check settling late changes nothing, and a later probe still runs it again.
  settle()
  await hanging
  expect((await readyRoute(lifecycle, () => undefined, { timeoutMs: 50 })()).status).toBe(200)
})

test("readyRoute's check that rejects after the timeout is not an unhandled rejection", async () => {
  const lifecycle = createLifecycle({ drainMs: 100, log: () => {} })
  const res = await readyRoute(
    lifecycle,
    () => Bun.sleep(80).then(() => Promise.reject(new Error("late"))),
    {
      timeoutMs: 20,
    }
  )()
  expect(res.status).toBe(503)
  await Bun.sleep(120)
})

test("readyRoute defaults to a 2 s timeout", () => {
  expect(DEFAULT_READY_TIMEOUT_MS).toBe(2_000)
})

test("a fast drain does not wait out drainMs: no timer outlives the shutdown", async () => {
  const { server } = slowServer()
  const lifecycle = createLifecycle({ drainMs: 5_000, log: () => {} })
  const started = performance.now()
  await lifecycle.shutdown(server)
  expect(performance.now() - started).toBeLessThan(1_000)
})

test("no drain timer keeps the process alive after a fast drain", async () => {
  // A process that shuts down an idle server with drainMs: 5_000 and never calls process.exit:
  // it ends as soon as the event loop is empty, so a leftover drain timer would hold it for 5 s.
  const script = `
    import { createLifecycle } from ${JSON.stringify(new URL("./lifecycle.ts", import.meta.url).pathname)}
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response("x") })
    await createLifecycle({ drainMs: 5_000, log: () => {} }).shutdown(server)
  `
  const started = performance.now()
  const child = Bun.spawn([process.execPath, "-e", script], { stdout: "ignore", stderr: "pipe" })
  expect(await child.exited).toBe(0)
  expect(performance.now() - started).toBeLessThan(3_000)
}, 10_000)

test("cleanup still runs once when server.stop() rejects", async () => {
  let cleanups = 0
  let calls = 0
  const failing = {
    stop: async () => {
      calls++
      if (calls === 1) throw new Error("stop failed")
    },
  }
  const lifecycle = createLifecycle({ drainMs: 100, cleanup: () => void cleanups++, log: () => {} })
  await expect(lifecycle.shutdown(failing)).rejects.toThrow("stop failed")
  await expect(lifecycle.shutdown(failing)).rejects.toThrow("stop failed")
  expect(cleanups).toBe(1)
})

test("shutdown logs when it starts draining", async () => {
  const { server } = slowServer()
  const messages: string[] = []
  await createLifecycle({ drainMs: 1_234, log: (m) => messages.push(m) }).shutdown(server)
  expect(messages[0]).toBe("shutting down: draining in-flight requests (up to 1234 ms)")
})

test("onShutdown runs once, first: before the grace period, the drain and cleanup", async () => {
  const events: string[] = []
  const lifecycle = createLifecycle({
    drainMs: 500,
    graceMs: 100,
    onShutdown: () => void events.push(`onShutdown ready=${lifecycle.ready()}`),
    cleanup: () => void events.push("cleanup"),
    log: () => {},
  })
  const server = {
    stop: async () => {
      events.push("stop")
    },
  }
  const done = lifecycle.shutdown(server)
  // Synchronous: already called before the grace period's first await.
  expect(events).toEqual(["onShutdown ready=false"])
  await Promise.all([done, lifecycle.shutdown(server)])
  expect(events).toEqual(["onShutdown ready=false", "stop", "cleanup"])
})
