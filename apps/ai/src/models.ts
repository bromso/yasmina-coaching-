import { anthropic } from "@ai-sdk/anthropic"
import { createProviderRegistry, customProvider, type LanguageModel } from "ai"
import type { Env } from "./env"
import { echoModel } from "./mock-models"

/**
 * Every provider the service can use. To add one: `bun add @ai-sdk/<name>` (via the catalog),
 * register it here, and add its key variable to `providerKeys`.
 */
export const registry = createProviderRegistry({
  anthropic,
  mock: customProvider({ languageModels: { echo: echoModel } }),
})

// The environment variable each provider reads its API key from (undefined: needs none).
const providerKeys: Record<string, string | undefined> = {
  anthropic: "ANTHROPIC_API_KEY",
  mock: undefined,
}

export const MOCK_MODEL_ID = "mock:echo"

type RegistryModelId = Parameters<typeof registry.languageModel>[0]

export function resolveModel(
  env: Env,
  keys: Record<string, string | undefined>,
  warn: (message: string) => void = console.warn
): { id: string; model: LanguageModel } {
  const provider = env.AI_MODEL.split(":")[0] ?? ""
  if (!(provider in providerKeys)) {
    const known = Object.keys(providerKeys).join(", ")
    throw new Error(`Unknown provider "${provider}" in AI_MODEL. Known providers: ${known}`)
  }

  const keyVar = providerKeys[provider]
  if (keyVar && !keys[keyVar]) {
    if (env.NODE_ENV === "production") {
      throw new Error(`${keyVar} is required for AI_MODEL=${env.AI_MODEL}`)
    }
    warn(
      `⚠ ${keyVar} is not set — serving ${MOCK_MODEL_ID} instead of ${env.AI_MODEL}. ` +
        "Set it in apps/ai/.env to use the real model."
    )
    return { id: MOCK_MODEL_ID, model: registry.languageModel(MOCK_MODEL_ID) }
  }

  return { id: env.AI_MODEL, model: registry.languageModel(env.AI_MODEL as RegistryModelId) }
}
