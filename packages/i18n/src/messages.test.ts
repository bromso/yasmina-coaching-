import { describe, expect, test } from "bun:test"
import { createTranslator, IntlErrorCode } from "use-intl/core"
import { ALL_LOCALE_MESSAGES, deepMerge } from "./catalog"
import { LOCALES, type Locale } from "./locales"
import { messagesFor, type Namespace } from "./messages"

const NAMESPACES: Namespace[] = ["common", "ui", "auth", "app", "account", "email", "api"]

describe("deepMerge", () => {
  test("the override's own key wins", () => {
    expect(deepMerge({ a: "A" }, { a: "A2" })).toEqual({ a: "A2" })
  })
  test("a key the override is missing falls back to the base's value", () => {
    expect(deepMerge({ a: "A", b: "B" }, { a: "A2" })).toEqual({ a: "A2", b: "B" })
  })
  test("merges recursively, not just at the top level", () => {
    const base = { group: { a: "A", b: "B" } }
    const override = { group: { a: "A2" } }
    expect(deepMerge(base, override)).toEqual({ group: { a: "A2", b: "B" } })
  })
  test("an override that is not an object replaces the base outright", () => {
    expect(deepMerge({ a: "A" }, "not an object")).toBe("not an object")
  })
  test("no override at all keeps the base", () => {
    expect(deepMerge({ a: "A" }, undefined)).toEqual({ a: "A" })
  })
})

describe("messagesFor", () => {
  test("English is unchanged by the merge", () => {
    expect(messagesFor("en", ["common"])).toEqual({ common: { languageName: "English" } })
  })
  test("sv's own translation wins over English for a key it has", () => {
    expect(messagesFor("sv", ["common"])).toEqual({ common: { languageName: "Svenska" } })
  })
  test("only the requested namespaces come back", () => {
    const messages = messagesFor("en", ["common", "ui"])
    expect(Object.keys(messages).sort()).toEqual(["common", "ui"])
  })
})

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return prefix ? [prefix] : []
  }
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    flattenKeys(v, prefix ? `${prefix}.${key}` : key)
  )
}

// Compares every locale's OWN (unmerged) catalog file to English's — unlike messagesFor, which
// always equals English's key set by construction (that is the fallback). This is what actually
// catches a translation gap as later tasks add keys.
describe("catalog parity", () => {
  for (const namespace of NAMESPACES) {
    test(`${namespace}: every locale has exactly English's key set`, () => {
      const englishKeys = flattenKeys(ALL_LOCALE_MESSAGES.en[namespace]).sort()
      for (const locale of LOCALES) {
        expect(flattenKeys(ALL_LOCALE_MESSAGES[locale][namespace]).sort()).toEqual(englishKeys)
      }
    })
  }
})

function leafEntries(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") return [[prefix, value]]
  if (typeof value !== "object" || value === null || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).flatMap(([key, v]) =>
    leafEntries(v, prefix ? `${prefix}.${key}` : key)
  )
}

// Uses createTranslator (use-intl, already a dependency) rather than reaching for
// intl-messageformat directly: Bun's isolated installer only resolves a package to the
// workspaces that declare it, and the one new dependency this task adds is use-intl.
//
// Calling `t(key)` with NO values argument skips ICU compilation entirely (verified against the
// installed use-intl@4.14.9: a message as broken as "{unclosed" comes back unchanged, with no
// error at all) — so every call below passes `{}` to force a real compile-and-format pass. That
// surfaces a genuine syntax error as `IntlErrorCode.INVALID_MESSAGE` (use-intl's code for
// `new IntlMessageFormat(...)` throwing while compiling — see its format-message
// implementation), which `invalidIcuMessages` below treats as a failure. A *valid* message called
// with no real values (a plural with no `count`, say) raises `IntlErrorCode.FORMATTING_ERROR`
// instead, which is not a syntax problem and is deliberately not reported.
function invalidIcuMessages(locale: Locale, namespaceMessages: unknown): string[] {
  const invalid: string[] = []
  const translator = createTranslator({
    locale,
    messages: { fixture: namespaceMessages },
    namespace: "fixture",
    getMessageFallback: () => "",
    onError: (error) => {
      if (error.code === IntlErrorCode.INVALID_MESSAGE) invalid.push(error.message)
    },
  })
  // Loosened on purpose: this walks every key dynamically rather than a literal union.
  const t = translator as unknown as (key: string, values: Record<string, unknown>) => string
  for (const [key] of leafEntries(namespaceMessages)) t(key, {})
  return invalid
}

// Fixtures, not the real catalogs: proves the detector above actually distinguishes a syntax
// error from a merely unformatted-but-valid message, so the real-catalog check right after it can
// be trusted.
describe("invalidIcuMessages (fixtures) actually catches a syntax error", () => {
  test("an unclosed brace", () => {
    expect(invalidIcuMessages("en", { bad: "{unclosed" })).not.toEqual([])
  })
  test("unbalanced braces", () => {
    expect(invalidIcuMessages("en", { bad: "{a} {b" })).not.toEqual([])
  })
  test("a plural missing the required `other` case", () => {
    expect(invalidIcuMessages("en", { bad: "{count, plural, one {#}}" })).not.toEqual([])
  })
  test("a typo'd plural keyword", () => {
    expect(invalidIcuMessages("en", { bad: "{count, plurale, one {#} other {#}}" })).not.toEqual([])
  })
  test("a valid plural called with no values is not reported as invalid", () => {
    expect(invalidIcuMessages("en", { ok: "{count, plural, one {#} other {#}}" })).toEqual([])
  })
})

describe("every message string in every locale compiles as valid ICU", () => {
  for (const locale of LOCALES) {
    test(locale, () => {
      for (const namespace of NAMESPACES) {
        expect(invalidIcuMessages(locale, ALL_LOCALE_MESSAGES[locale][namespace])).toEqual([])
      }
    })
  }
})
