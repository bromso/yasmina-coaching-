import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { type AllowEntry, describeViolations, findViolations, scanApp } from "./index"

const flagged = (source: string) => findViolations("fake/probe.tsx", source).map((v) => v.text)

describe("findViolations", () => {
  test("flags JSX text, on one line or across several", () => {
    expect(flagged('export const X = () => <p className="x">Reset your password</p>')).toEqual([
      "Reset your password",
    ])
    const multiLine = [
      "const X = () => (",
      "  <p>",
      "    Reset your",
      "    password",
      "  </p>",
      ")",
    ]
    expect(flagged(multiLine.join("\n"))).toEqual(["Reset your password"])
  })

  test("flags the text around an expression: `{name} text`", () => {
    expect(flagged("const X = () => <p>{name} signed in</p>")).toEqual(["signed in"])
  })

  test("flags a string or template literal written as a JSX child", () => {
    expect(flagged('const X = () => <p>{"Sign in"}</p>')).toEqual(["Sign in"])
    expect(flagged("const X = () => <p>{`Sign in`}</p>")).toEqual(["Sign in"])
    expect(flagged(["const X = () => <p>{`Hi $", "{name}`}</p>"].join(""))).toHaveLength(1)
  })

  test("flags both branches of a conditional of strings, and && operands", () => {
    expect(flagged('const X = () => <p>{ok ? "Saved" : "Failed"}</p>')).toEqual(["Saved", "Failed"])
    expect(flagged('const X = () => <p>{busy && "Saving…"}</p>')).toEqual(["Saving…"])
    expect(flagged('const X = () => <p>{a || "None"}</p>')).toEqual(["None"])
    expect(flagged('const X = () => <p>{a ?? "None"}</p>')).toEqual(["None"])
    expect(flagged('const X = () => <p>{(ok ? ("Yes") : "No")}</p>')).toEqual(["Yes", "No"])
  })

  test("flags a user-facing attribute's literal value, plain or in braces", () => {
    for (const name of ["placeholder", "aria-label", "alt", "title", "label", "aria-description"]) {
      expect(flagged(`const X = () => <input ${name}="Email address" />`)).toHaveLength(1)
      expect(flagged(`const X = () => <input ${name}={"Email address"} />`)).toHaveLength(1)
    }
    expect(flagged('const X = () => <input title={ok ? "Yes" : "No"} />')).toEqual(["Yes", "No"])
  })

  test("does not flag t(...), an expression, a className or a decorative attribute", () => {
    const clean = [
      'const t = useTranslations("auth")',
      "export function X(): Promise<ReactElement> {",
      "  return (",
      '    <p className="text-sm text-muted-foreground" data-state="open">',
      '      {t("resetPassword.title")}',
      "      {value}",
      '      {ok ? t("yes") : t("no")}',
      '      <img src={src} alt="" />',
      '      <input aria-label={label} placeholder={t("email")} type="email" />',
      "      {' · '}",
      "    </p>",
      "  )",
      "}",
    ].join("\n")
    expect(flagged(clean)).toEqual([])
  })

  test("reports the line the flagged text is on", () => {
    const found = findViolations("fake/probe.tsx", "const X = () => (\n  <p>\n    Hello\n  </p>\n)")
    expect(found).toEqual([{ file: "fake/probe.tsx", line: 3, text: "Hello" }])
  })

  test("a decorative entity alone is not flagged, in text or in an attribute", () => {
    for (const entity of [
      "&nbsp;",
      "&middot;",
      "&copy;",
      "&amp;",
      "&#160;",
      "&#xA0;",
      "&hellip;",
    ]) {
      expect(flagged(`const X = () => <p>${entity}</p>`)).toEqual([])
      expect(flagged(`const X = () => <img alt="${entity}" />`)).toEqual([])
    }
    expect(
      flagged("const X = () => <p>{year}&nbsp;&middot;&nbsp;&copy;&#8212;&#x2014;</p>")
    ).toEqual([])
  })

  test("words around an entity are still flagged, as written", () => {
    expect(flagged("const X = () => <p>Hello&nbsp;world</p>")).toEqual(["Hello&nbsp;world"])
    expect(flagged('const X = () => <img alt="&copy; Brand" />')).toEqual(['alt="&copy; Brand"'])
  })

  test("an unknown or misspelled entity still has letters, so it is flagged", () => {
    expect(flagged("const X = () => <p>&nbps;</p>")).toEqual(["&nbps;"])
  })

  test("a numeric entity that decodes to a letter is flagged", () => {
    expect(flagged("const X = () => <p>&#65;&#x42;</p>")).toEqual(["&#65;&#x42;"])
  })

  test("an out-of-range numeric entity is left as written, pinning today's behaviour", () => {
    // 0x110000 / 1114112 is one past the last valid code point (0x10FFFF): `codePoint` returns
    // the entity unchanged rather than a replacement character. The hex spelling still has a
    // letter (its own "x"), so it is flagged as written; the decimal spelling has none, so it
    // passes — not because it is safe, but because the guard only ever looks for letters.
    expect(flagged("const X = () => <p>&#x110000;</p>")).toEqual(["&#x110000;"])
    expect(flagged("const X = () => <p>&#1114112;</p>")).toEqual([])
  })

  test("a file with a syntax error throws, naming the file, instead of scanning a broken tree", () => {
    expect(() => findViolations("apps/x/src/broken.tsx", "const X = () => <p>Hi</p")).toThrow(
      /^apps\/x\/src\/broken\.tsx: cannot parse \(.+\) — fix the syntax/
    )
  })
})

describe("scanApp", () => {
  let root = ""
  const write = (rel: string, content: string) => {
    const path = join(root, rel)
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, content)
  }
  const setup = (allow: AllowEntry[]) => {
    root = mkdtempSync(join(tmpdir(), "i18n-guard-"))
    write("src/views/home.tsx", "export const X = () => <p>Welcome home</p>\n")
    write("src/views/clean.tsx", 'export const Y = () => <p>{t("ok")}</p>\n')
    write("src/admin/page.tsx", "export const Z = () => <p>Admin only</p>\n")
    write("src/lib/text.ts", 'export const s = "Not JSX"\n')
    write("allowlist.json", JSON.stringify(allow))
    return {
      srcDir: join(root, "src"),
      label: "apps/x/src",
      allowlistPath: join(root, "allowlist.json"),
      isExcluded: (rel: string) => rel.startsWith("admin/"),
    }
  }
  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true })
    root = ""
  })

  test("scans every .tsx under srcDir, naming files by the label, skipping exclusions", () => {
    expect(scanApp(setup([]))).toEqual([
      { file: "apps/x/src/views/home.tsx", line: 1, text: "Welcome home" },
    ])
  })

  test("an allow-list entry (file and a substring of the text) hides its violation", () => {
    const options = setup([
      { file: "apps/x/src/views/home.tsx", text: "Welcome", reason: "a brand slogan" },
    ])
    expect(scanApp(options)).toEqual([])
  })

  test("a stale allow-list entry fails the scan", () => {
    const options = setup([
      { file: "apps/x/src/views/clean.tsx", text: "Gone", reason: "no longer there" },
    ])
    expect(() => scanApp(options)).toThrow(/stale allow-list entry/)
  })

  test("an entry outside the label, on an excluded file or without a reason fails the scan", () => {
    const outside = { file: "apps/y/src/views/home.tsx", text: "Welcome", reason: "r" }
    expect(() => scanApp(setup([outside]))).toThrow(/outside apps\/x\/src/)
    const excluded = { file: "apps/x/src/admin/page.tsx", text: "Admin", reason: "r" }
    expect(() => scanApp(setup([excluded]))).toThrow(/excluded/)
    const noReason = { file: "apps/x/src/views/home.tsx", text: "Welcome", reason: "" }
    expect(() => scanApp(setup([noReason]))).toThrow(/reason/)
  })

  test("describeViolations names each file:line and points at the allow-list", () => {
    const text = describeViolations(
      [{ file: "apps/x/src/a.tsx", line: 4, text: "Hi" }],
      "apps/x/i18n-guard.allowlist.json"
    )
    expect(text).toContain('apps/x/src/a.tsx:4: "Hi"')
    expect(text).toContain("apps/x/i18n-guard.allowlist.json")
  })
})
