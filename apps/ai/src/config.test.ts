import { describe, expect, test } from "bun:test"
import { SummarySchema } from "@repo/ai-contract"
import { generateText, Output, streamText } from "ai"
import { DEV_TOKEN, loadEnv } from "./env"
import { echoModel } from "./mock-models"
import { MOCK_MODEL_ID, resolveModel } from "./models"
import { tools } from "./tools"

// Production tokens must be at least 32 characters.
const prodToken = "p".repeat(32)

describe("loadEnv", () => {
  test("NODE_ENV defaults to production, which requires a token", () => {
    expect(() => loadEnv({})).toThrow(/AI_SERVICE_TOKEN/)
  })

  test("development defaults", () => {
    const env = loadEnv({ NODE_ENV: "development" })
    expect(env).toMatchObject({
      NODE_ENV: "development",
      HOST: "ai.brand.localhost",
      PORT: 3008,
      AI_MODEL: "anthropic:claude-opus-5",
      AI_SERVICE_TOKEN: DEV_TOKEN,
      AI_ALLOWED_ORIGINS: [],
      AI_MAX_MESSAGES: 50,
      AI_MAX_MESSAGE_BYTES: 32_768,
      AI_MAX_OUTPUT_TOKENS: 4096,
      AI_MAX_STEPS: 5,
      AI_RATE_LIMIT: 30,
      AI_RATE_WINDOW_SECONDS: 60,
      REQUEST_TIMEOUT_MS: 30_000,
    })
  })

  test("REQUEST_TIMEOUT_MS is an integer from 1000 to 600000; blank means 30000", () => {
    expect(loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "" }).REQUEST_TIMEOUT_MS).toBe(30_000)
    expect(loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: "5000" }).REQUEST_TIMEOUT_MS).toBe(5_000)
    for (const value of ["999", "600001", "1.5", "soon"]) {
      expect(() => loadEnv({ NODE_ENV: "test", REQUEST_TIMEOUT_MS: value })).toThrow()
    }
  })

  test("API_URL and API_SERVICE_TOKEN are optional and come through when set", () => {
    const unset = loadEnv({ NODE_ENV: "test" })
    expect(unset.API_URL).toBeUndefined()
    expect(unset.API_SERVICE_TOKEN).toBeUndefined()
    const set = loadEnv({
      NODE_ENV: "test",
      API_URL: "http://api.brand.localhost:3007",
      API_SERVICE_TOKEN: " api-token\n",
    })
    expect(set.API_URL).toBe("http://api.brand.localhost:3007")
    expect(set.API_SERVICE_TOKEN).toBe("api-token")
    expect(() => loadEnv({ NODE_ENV: "test", API_URL: "not a url" })).toThrow()
  })

  test("test mode also gets the dev token", () => {
    expect(loadEnv({ NODE_ENV: "test" }).AI_SERVICE_TOKEN).toBe(DEV_TOKEN)
  })

  test("production requires AI_SERVICE_TOKEN", () => {
    expect(() => loadEnv({ NODE_ENV: "production" })).toThrow(/AI_SERVICE_TOKEN/)
  })

  test("a blank token counts as missing", () => {
    expect(() => loadEnv({ NODE_ENV: "production", AI_SERVICE_TOKEN: "" })).toThrow(
      /AI_SERVICE_TOKEN/
    )
  })

  test("the token is trimmed of surrounding whitespace", () => {
    const env = loadEnv({ NODE_ENV: "production", AI_SERVICE_TOKEN: ` ${prodToken}\n` })
    expect(env.AI_SERVICE_TOKEN).toBe(prodToken)
  })

  test("a whitespace-only token counts as missing", () => {
    expect(() => loadEnv({ NODE_ENV: "production", AI_SERVICE_TOKEN: " \n\t " })).toThrow(
      "AI_SERVICE_TOKEN is required in production"
    )
  })

  test("AI_MODEL must be provider:model", () => {
    expect(() => loadEnv({ NODE_ENV: "development", AI_MODEL: "claude" })).toThrow(/provider:model/)
  })

  test("AI_ALLOWED_ORIGINS is a trimmed comma-separated list", () => {
    const env = loadEnv({
      NODE_ENV: "development",
      AI_ALLOWED_ORIGINS: " https://a.example , https://b.example,",
    })
    expect(env.AI_ALLOWED_ORIGINS).toEqual(["https://a.example", "https://b.example"])
  })
})

const dev = (source: Record<string, string> = {}) => loadEnv({ NODE_ENV: "development", ...source })

describe("resolveModel", () => {
  test("development without a key falls back to the echo model and warns", () => {
    const warnings: string[] = []
    const resolved = resolveModel(dev(), {}, (m) => warnings.push(m))
    expect(resolved.id).toBe(MOCK_MODEL_ID)
    expect(warnings.join()).toContain("ANTHROPIC_API_KEY")
  })

  test("a blank key also falls back in development", () => {
    const resolved = resolveModel(dev(), { ANTHROPIC_API_KEY: "" }, () => {})
    expect(resolved.id).toBe(MOCK_MODEL_ID)
  })

  test("production without a key refuses to start", () => {
    const env = loadEnv({ NODE_ENV: "production", AI_SERVICE_TOKEN: prodToken })
    expect(() => resolveModel(env, {})).toThrow(/ANTHROPIC_API_KEY/)
  })

  test("with a key the configured model is used", () => {
    const resolved = resolveModel(dev(), { ANTHROPIC_API_KEY: "sk-test" })
    expect(resolved.id).toBe("anthropic:claude-opus-5")
  })

  test("the mock provider needs no key", () => {
    const resolved = resolveModel(dev({ AI_MODEL: "mock:echo" }), {})
    expect(resolved.id).toBe("mock:echo")
  })

  test("an unknown provider is rejected with the known list", () => {
    expect(() => resolveModel(dev({ AI_MODEL: "nope:x" }), {})).toThrow(/anthropic, mock/)
  })
})

describe("echoModel", () => {
  test("streams the last user message back", async () => {
    const result = streamText({ model: echoModel, prompt: "hello there" })
    expect(await result.text).toBe("Echo: hello there")
  })

  test("asking for the time calls getCurrentTime for UTC", async () => {
    const result = streamText({ model: echoModel, prompt: "What TIME is it?", tools })
    const parts = []
    for await (const part of result.fullStream) parts.push(part)
    expect(parts).toContainEqual(
      expect.objectContaining({
        type: "tool-call",
        toolName: "getCurrentTime",
        input: { timeZone: "UTC" },
      })
    )
    expect(await result.finishReason).toBe("tool-calls")
  })

  test("a word that only contains 'time' is echoed, not a tool call", async () => {
    const result = streamText({ model: echoModel, prompt: "sometimes", tools })
    expect(await result.text).toBe("Echo: sometimes")
    expect(await result.toolCalls).toHaveLength(0)
  })

  test("a prompt ending in the tool's result echoes the time", async () => {
    const result = streamText({
      model: echoModel,
      messages: [
        { role: "user", content: "what time is it?" },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "getCurrentTime",
              input: { timeZone: "UTC" },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "getCurrentTime",
              output: {
                type: "json",
                value: { timeZone: "UTC", iso: "x", formatted: "Thursday at noon" },
              },
            },
          ],
        },
      ],
    })
    expect(await result.text).toBe("Echo: it's Thursday at noon (UTC)")
  })

  test("produces a schema-valid summary", async () => {
    const { output } = await generateText({
      model: echoModel,
      prompt: "Some long text",
      output: Output.object({ schema: SummarySchema }),
    })
    expect(SummarySchema.parse(output).summary).toBe("Some long text")
  })
})
