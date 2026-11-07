import { describe, expect, test } from "bun:test"
import { createTranslatorFrom, translatorFor } from "./translate"

describe("translatorFor", () => {
  test("translates a key the locale has its own value for", () => {
    const t = translatorFor("sv", "common")
    expect(t("languageName")).toBe("Svenska")
  })

  test("English stays English", () => {
    const t = translatorFor("en", "common")
    expect(t("languageName")).toBe("English")
  })

  test("a key missing from every locale's catalog returns the key itself, not a throw", () => {
    const t = translatorFor("sv", "ui")
    expect(() => t("doesNotExist")).not.toThrow()
    expect(t("doesNotExist")).toBe("doesNotExist")
  })

  test("a nested key missing everywhere also returns the key path, not a throw", () => {
    const t = translatorFor("en", "auth")
    expect(t("signIn.title")).toBe("signIn.title")
  })

  test("never throws regardless of locale or namespace", () => {
    for (const locale of ["en", "sv"] as const) {
      for (const namespace of ["common", "ui", "auth", "app", "account", "email", "api"] as const) {
        const t = translatorFor(locale, namespace)
        expect(() => t("anything.at.all")).not.toThrow()
      }
    }
  })
})

// The shipped catalogs have no real translation gap yet (sv/common.json's one key is fully
// translated; every other namespace is `{}` in both locales — see the brief's ruling 2), so these
// two cases — brief Step 1's "a key missing from the locale but present in English" and a
// malformed locale message — are exercised through fixture catalogs injected into
// `createTranslatorFrom`, the mechanism `translatorFor` itself just closes over the real ones.
describe("createTranslatorFrom (fixtures, not the real catalogs)", () => {
  test("a key missing from the locale but present in English falls back to the English text", () => {
    const catalogs = {
      en: { test: { greeting: "Hello", farewell: "Bye" } },
      sv: { test: { greeting: "Hej" } }, // sv has no "farewell" yet
    }
    const t = createTranslatorFrom("sv", "test", catalogs)
    expect(t("greeting")).toBe("Hej") // sv's own translation still wins where it has one
    expect(t("farewell")).toBe("Bye") // falls back to English where sv has a gap
  })

  test("a malformed locale message falls back to the English text (getMessageFallback/readPath)", () => {
    const catalogs = {
      en: { test: { broken: "All good" } },
      sv: { test: { broken: "{unclosed" } }, // sv's own translation is invalid ICU
    }
    const t = createTranslatorFrom("sv", "test", catalogs)
    // No values passed skips ICU compilation (see messages.test.ts); {} forces the real
    // compile-and-format pass that an actual broken translation would hit in production.
    expect(t("broken", {})).toBe("All good")
  })
})
