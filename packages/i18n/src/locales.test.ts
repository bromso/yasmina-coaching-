import { describe, expect, test } from "bun:test"
import {
  DEFAULT_LOCALE,
  isLocale,
  LOCALE_NAMES,
  LOCALES,
  negotiateLocale,
  resolveLocale,
  resolveLocaleWithSource,
} from "./locales"

describe("LOCALES / DEFAULT_LOCALE / LOCALE_NAMES", () => {
  test("en and sv, English default", () => {
    expect(LOCALES).toEqual(["en", "sv"])
    expect(DEFAULT_LOCALE).toBe("en")
    expect(LOCALE_NAMES).toEqual({ en: "English", sv: "Svenska" })
  })
})

describe("isLocale", () => {
  test("accepts a supported locale", () => {
    expect(isLocale("en")).toBe(true)
    expect(isLocale("sv")).toBe(true)
  })
  test("refuses anything else", () => {
    expect(isLocale("de")).toBe(false)
    expect(isLocale("")).toBe(false)
    expect(isLocale(null)).toBe(false)
    expect(isLocale(undefined)).toBe(false)
    expect(isLocale(1)).toBe(false)
    expect(isLocale("EN")).toBe(false)
  })
})

describe("negotiateLocale", () => {
  test("a region falls back to its language subtag", () => {
    expect(negotiateLocale("sv-SE,sv;q=0.9,en;q=0.8")).toBe("sv")
  })
  test("the first supported tag in q order wins", () => {
    expect(negotiateLocale("de,en;q=0.5")).toBe("en")
  })
  test("an unsupported language falls back to en", () => {
    expect(negotiateLocale("fr")).toBe("en")
  })
  test("no header falls back to en", () => {
    expect(negotiateLocale("")).toBe("en")
    expect(negotiateLocale(null)).toBe("en")
    expect(negotiateLocale(undefined)).toBe("en")
  })
  test("q-weights ordering is respected over header order", () => {
    expect(negotiateLocale("en;q=0.1,sv;q=0.9")).toBe("sv")
  })
  test("ties are broken per tag (exact code, then subtag) before moving to the next tag", () => {
    // Two-phase readings ("every tag's exact code first, in q order, then every tag's subtag")
    // would return "sv" here (its own exact code, found in the second pass); the per-tag rule
    // this package implements finds "en-GB"'s subtag "en" before ever looking at "sv".
    expect(negotiateLocale("en-GB;q=0.9,sv;q=0.5")).toBe("en")
  })
  test("garbage of any length falls back to en", () => {
    expect(negotiateLocale("x".repeat(500))).toBe("en")
    expect(negotiateLocale(",,,;;;q=,garbage;q=2,???")).toBe("en")
  })
  test("caps the number of tags parsed, so a huge header can't cost unbounded work", () => {
    // 55 junk tags (never valid locales on their own), then a real, unweighted "sv" as the 56th
    // part: splitting on "," first and capping the part count (rather than slicing characters,
    // which could cut a tag in half) must drop it before it is ever parsed.
    const header = `${Array.from({ length: 55 }, () => "x").join(",")},sv`
    expect(negotiateLocale(header)).toBe("en")
  })
  test("case-insensitive tag matching", () => {
    expect(negotiateLocale("SV-se")).toBe("sv")
  })
  test("q=0 means not acceptable: such a tag never matches", () => {
    expect(negotiateLocale("de, sv;q=0")).toBe("en")
    expect(negotiateLocale("sv;q=0.0, en;q=0.1")).toBe("en")
    expect(negotiateLocale("sv;q=0.001")).toBe("sv")
  })
  test("malformed q values are ignored, not fatal to the rest of the header", () => {
    expect(negotiateLocale("en;q=notanumber,sv;q=0.5")).toBe("sv")
    expect(negotiateLocale("en;q=5,sv;q=0.5")).toBe("sv")
  })
})

describe("resolveLocale", () => {
  test("a saved preference wins over the cookie and the header", () => {
    expect(resolveLocale({ saved: "sv", cookie: "en", acceptLanguage: "en" })).toBe("sv")
  })
  test("the cookie wins over the header when there is no saved preference", () => {
    expect(resolveLocale({ cookie: "sv", acceptLanguage: "en" })).toBe("sv")
  })
  test("the header is the last resort", () => {
    expect(resolveLocale({ acceptLanguage: "sv" })).toBe("sv")
  })
  test("an invalid saved value is ignored, falling through to the cookie", () => {
    expect(resolveLocale({ saved: "xx", cookie: "sv" })).toBe("sv")
  })
  test("an invalid cookie is ignored, falling through to the header", () => {
    expect(resolveLocale({ cookie: "xx", acceptLanguage: "sv" })).toBe("sv")
  })
  test("nothing at all falls back to en", () => {
    expect(resolveLocale({})).toBe("en")
  })
})

describe("resolveLocaleWithSource", () => {
  test("names where the locale came from", () => {
    expect(resolveLocaleWithSource({ saved: "sv", cookie: "en" })).toEqual({
      locale: "sv",
      source: "saved",
    })
    expect(resolveLocaleWithSource({ saved: "xx", cookie: "sv" })).toEqual({
      locale: "sv",
      source: "cookie",
    })
    expect(resolveLocaleWithSource({ acceptLanguage: "sv-SE" })).toEqual({
      locale: "sv",
      source: "header",
    })
    expect(resolveLocaleWithSource({ acceptLanguage: "en-US" })).toEqual({
      locale: "en",
      source: "header",
    })
  })
  test("an unsupported browser language is the default, not a header choice", () => {
    expect(resolveLocaleWithSource({ acceptLanguage: "de, fr;q=0.5" })).toEqual({
      locale: "en",
      source: "default",
    })
    expect(resolveLocaleWithSource({})).toEqual({ locale: "en", source: "default" })
  })
  test("resolveLocale is its locale", () => {
    expect(resolveLocale({ acceptLanguage: "de" })).toBe("en")
    expect(resolveLocale({ cookie: "sv" })).toBe("sv")
  })
})
