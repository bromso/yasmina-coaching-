import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// `@ai-sdk/react` pins `ai` to an exact version. When the catalog's `ai` resolves to a different
// one, bun installs a second, nested copy and `useChat`'s transport types stop matching (PR #119
// failed `chat-view.tsx`'s typecheck this way). Bump `ai`, `@ai-sdk/react` and `@ai-sdk/anthropic`
// together, to the `ai` version `@ai-sdk/react` pins.
const SHARED = ["ai", "@ai-sdk/provider", "@ai-sdk/provider-utils"]

/** Lockfile keys like `"@ai-sdk/react/ai"`: a nested copy of a package that must be single. */
export function nestedCopies(lock: string): string[] {
  const found: string[] = []
  for (const match of lock.matchAll(/^\s+"([^"]+)": \["([^"]+)@/gm)) {
    const [, key = "", name = ""] = match
    if (key !== name && SHARED.includes(name) && key.endsWith(`/${name}`)) found.push(key)
  }
  return found
}

describe("AI SDK lockstep", () => {
  test("finds a nested copy", () => {
    const lock = `    "ai": ["ai@7.0.152", "", {}],\n    "@ai-sdk/react/ai": ["ai@7.0.148", "", {}],\n`
    expect(nestedCopies(lock)).toEqual(["@ai-sdk/react/ai"])
  })

  test("bun.lock holds one copy each of ai, @ai-sdk/provider and @ai-sdk/provider-utils", () => {
    const lock = readFileSync(join(import.meta.dirname, "..", "bun.lock"), "utf8")
    const nested = nestedCopies(lock)
    if (nested.length > 0) {
      throw new Error(
        `Nested AI SDK copies in bun.lock: ${nested.join(", ")}. Bump ai, @ai-sdk/react and ` +
          "@ai-sdk/anthropic together in the root catalog, to the ai version @ai-sdk/react pins."
      )
    }
  })
})
