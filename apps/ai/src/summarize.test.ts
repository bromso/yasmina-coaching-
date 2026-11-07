import { afterEach, describe, expect, test } from "bun:test"
import { createORPCClient, safe } from "@orpc/client"
import { RPCLink } from "@orpc/client/fetch"
import { call } from "@orpc/server"
import type { AiClient, Summary } from "@repo/ai-contract"
import { createMemoryRateLimiter } from "@repo/service-kit"
import { MockLanguageModelV4 } from "ai/test"
import type { UsageEntry } from "./log"
import { router } from "./router"
import { createServer } from "./server"
import { failingModel, jsonModel } from "./test-models"

const TOKEN = "test-token"
const summary: Summary = { title: "A title", summary: "Short.", keyPoints: ["one", "two"] }

let stop: (() => Promise<void>) | undefined
afterEach(async () => {
  await stop?.()
  stop = undefined
})

function start(model: MockLanguageModelV4) {
  const logs = { usage: [] as UsageEntry[], errors: [] as unknown[] }
  const app = createServer({
    hostname: "127.0.0.1",
    port: 0,
    model,
    modelId: "mock:test",
    token: TOKEN,
    allowedOrigins: [],
    allowLocalhostOrigins: false,
    limits: { maxMessages: 3, maxMessageBytes: 2_000, maxOutputTokens: 256, maxSteps: 3 },
    rateLimiter: createMemoryRateLimiter({ limit: 100, windowMs: 60_000 }),
    log: { usage: (e) => logs.usage.push(e), error: (_m, e) => logs.errors.push(e) },
  })
  stop = app.stop
  const url = (path: string) => new URL(path, app.server.url)
  const client: AiClient = createORPCClient(
    new RPCLink({ url: url("/rpc").href, headers: { authorization: `Bearer ${TOKEN}` } })
  )
  return { client, logs, url }
}

describe("summarize over typed RPC", () => {
  test("returns the model's structured output and logs usage", async () => {
    const { client, logs } = start(jsonModel(JSON.stringify(summary)))
    expect(await client.summarize({ text: "Long text…" })).toEqual(summary)
    expect(logs.usage[0]).toMatchObject({
      route: "summarize",
      model: "mock:test",
      steps: 1,
      outcome: "ok",
    })
  })

  test("output that fails the schema is GENERATION_FAILED", async () => {
    const { client, logs } = start(jsonModel('{"title": 42}'))
    const { error, isDefined } = await safe(client.summarize({ text: "x" }))
    expect(isDefined).toBe(true)
    expect(error).toMatchObject({ code: "GENERATION_FAILED", status: 502 })
    expect(logs.errors).toHaveLength(1)
    // The model answered, so the call cost tokens even though the output was rejected.
    expect(logs.usage).toEqual([
      expect.objectContaining({
        route: "summarize",
        inputTokens: 12,
        outputTokens: 5,
        cachedInputTokens: 10,
        steps: 1,
        outcome: "error",
      }),
    ])
  })

  test("a provider failure is GENERATION_FAILED and its details stay server-side", async () => {
    const { client, logs } = start(failingModel("upstream exploded: sk-live-secret"))
    const { error } = await safe(client.summarize({ text: "x" }))
    expect(error).toMatchObject({ code: "GENERATION_FAILED" })
    expect(JSON.stringify(error)).not.toContain("sk-live-secret")
    expect(String(logs.errors[0])).toContain("sk-live-secret")
    expect(logs.usage).toEqual([
      expect.objectContaining({
        route: "summarize",
        inputTokens: undefined,
        steps: 0,
        outcome: "error",
      }),
    ])
  })

  test("a cancelled call logs an aborted usage line, not an error", async () => {
    const model = new MockLanguageModelV4({
      doGenerate: ({ abortSignal }) =>
        new Promise((_, reject) =>
          abortSignal?.addEventListener("abort", () => reject(abortSignal.reason))
        ),
    })
    const logs = { usage: [] as UsageEntry[], errors: [] as unknown[] }
    const log = {
      usage: (e: UsageEntry) => logs.usage.push(e),
      error: (_m: string, e: unknown) => logs.errors.push(e),
    }
    const controller = new AbortController()
    const pending = call(
      router.summarize,
      { text: "x" },
      {
        context: { model, modelId: "mock:test", log, maxOutputTokens: 256 },
        signal: controller.signal,
      }
    )
    while (model.doGenerateCalls.length === 0) await Bun.sleep(5)
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: "GENERATION_FAILED" })
    expect(logs.usage).toEqual([
      expect.objectContaining({ route: "summarize", outcome: "aborted" }),
    ])
    expect(logs.errors).toHaveLength(0)
  })

  test("empty text is BAD_REQUEST without a model call", async () => {
    const model = jsonModel(JSON.stringify(summary))
    const { client } = start(model)
    const { error } = await safe(client.summarize({ text: "" }))
    expect(error).toMatchObject({ code: "BAD_REQUEST", status: 400 })
    expect(model.doGenerateCalls).toHaveLength(0)
  })
})

describe("REST / OpenAPI", () => {
  test("POST /openapi/summarize works with the token", async () => {
    const { url } = start(jsonModel(JSON.stringify(summary)))
    const res = await fetch(url("/openapi/summarize"), {
      method: "POST",
      headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json" },
      body: JSON.stringify({ text: "Long text…" }),
    })
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual(summary)
  })

  test("REST procedures are guarded", async () => {
    const { url } = start(jsonModel(JSON.stringify(summary)))
    const res = await fetch(url("/openapi/summarize"), { method: "POST", body: "{}" })
    expect(res.status).toBe(401)
  })

  test("/rpc is guarded", async () => {
    const { url } = start(jsonModel(JSON.stringify(summary)))
    const res = await fetch(url("/rpc/summarize"), { method: "POST", body: "{}" })
    expect(res.status).toBe(401)
  })

  test("docs routes answer GET only", async () => {
    const model = jsonModel(JSON.stringify(summary))
    const { url } = start(model)
    const post = await fetch(url("/openapi"), { method: "POST", body: "{}" })
    expect(post.status).not.toBe(200)
    const postSpec = await fetch(url("/openapi/spec.json"), { method: "POST", body: "{}" })
    expect(postSpec.status).not.toBe(200)
    expect(model.doGenerateCalls).toHaveLength(0)
    expect((await fetch(url("/openapi"))).status).toBe(200)
  })

  test("docs and spec are open, and the spec lists /summarize", async () => {
    const { url } = start(jsonModel("{}"))
    expect((await fetch(url("/openapi"))).status).toBe(200)
    const spec = (await (await fetch(url("/openapi/spec.json"))).json()) as {
      paths: Record<string, unknown>
    }
    expect(Object.keys(spec.paths)).toContain("/summarize")
  })
})
