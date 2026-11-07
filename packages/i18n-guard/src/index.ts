import { readFileSync } from "node:fs"
import { join } from "node:path"
import ts from "typescript"

/**
 * A hard-coded-string guard for a translated app's surface. It parses each `.tsx` file with the
 * TypeScript compiler (`ts.createSourceFile`) and walks the JSX, flagging:
 *
 * - a `JsxText` node containing a letter (`<p>Hello</p>`, text across several lines, the words
 *   around an expression in `<p>{name} signed in</p>`);
 * - a string literal or template literal written directly as a JSX child (`{"Hello"}`,
 *   `` {`Hello`} ``), including either branch of a conditional (`{ok ? "Saved" : "Failed"}`) and
 *   the operands of `&&` / `||` / `??` there;
 * - the same literals as the value of a user-facing attribute — `placeholder`, `aria-label`,
 *   `alt`, `title`, `label`, `aria-description` — plain (`alt="Logo"`) or in braces.
 *
 * JSX text and plain attribute values are tested after decoding HTML entities (`&nbsp;`,
 * `&middot;`, `&copy;`, `&#160;`, `&#xA0;` …), so a purely decorative entity is not text; an
 * unknown named entity stays as written, letters and all, so a typo is still flagged. The report
 * keeps the text as written.
 *
 * It sees only what is written inside JSX. Blind spots: a string built or held in a variable, a
 * constant or a function's return value outside the JSX and then rendered (`const msg = "Hi"`,
 * `<p>{msg}</p>`), any attribute not in the list above, strings passed as props of another name to
 * a component (`<Card heading="Hi" />`), and anything a `.ts` file renders. It is a floor, not a
 * guarantee: the rest is `t(...)` by convention, checked in review.
 */

export type Violation = { file: string; line: number; text: string }
/** Matched by file and by text (`text` a substring of the flagged text); never by line number. */
export type AllowEntry = { file: string; text: string; reason: string }

/** Attributes whose value a person reads or hears. */
const TEXT_ATTRIBUTES = new Set([
  "placeholder",
  "aria-label",
  "alt",
  "title",
  "label",
  "aria-description",
])

const HAS_LETTER = /\p{L}/u

/** The named entities decoded before the letter test; any other name is left as written. */
const NAMED_ENTITIES: Record<string, string> = {
  nbsp: " ",
  middot: "·",
  copy: "©",
  reg: "®",
  trade: "™",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  rsquo: "’",
  lsquo: "‘",
  rdquo: "”",
  ldquo: "“",
  bull: "•",
  times: "×",
}

function codePoint(value: number, entity: string): string {
  return Number.isInteger(value) && value >= 0 && value <= 0x10ffff
    ? String.fromCodePoint(value)
    : entity
}

/** `text` with the known named entities and every numeric entity replaced by its character. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[A-Za-z][A-Za-z0-9]*);/g, (entity, body) => {
    if (body[0] !== "#") return NAMED_ENTITIES[body] ?? entity
    const hex = body[1] === "x" || body[1] === "X"
    return codePoint(Number.parseInt(body.slice(hex ? 2 : 1), hex ? 16 : 10), entity)
  })
}

/** The literal text a string-ish expression carries, or null when it is not a literal. */
function literalText(node: ts.Expression): string | null {
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return node.text
  if (ts.isTemplateExpression(node)) {
    return [node.head.text, ...node.templateSpans.map((s) => s.literal.text)].join(" ")
  }
  return null
}

/**
 * Every literal with a letter that an expression in JSX renders as it stands: the expression
 * itself, either branch of a conditional, either side of `&&` / `||` / `??`, through parentheses.
 */
function renderedLiterals(node: ts.Expression): ts.Expression[] {
  if (ts.isParenthesizedExpression(node)) return renderedLiterals(node.expression)
  if (ts.isConditionalExpression(node)) {
    return [...renderedLiterals(node.whenTrue), ...renderedLiterals(node.whenFalse)]
  }
  if (ts.isBinaryExpression(node)) {
    const op = node.operatorToken.kind
    if (
      op === ts.SyntaxKind.AmpersandAmpersandToken ||
      op === ts.SyntaxKind.BarBarToken ||
      op === ts.SyntaxKind.QuestionQuestionToken
    ) {
      return [...renderedLiterals(node.left), ...renderedLiterals(node.right)]
    }
    return []
  }
  const text = literalText(node)
  return text !== null && HAS_LETTER.test(text) ? [node] : []
}

/**
 * Every piece of hard-coded, user-facing text in `content`, reported under the name `file`.
 * Throws when the file does not parse: a broken tree would be scanned only in part, silently.
 */
export function findViolations(file: string, content: string): Violation[] {
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  // `parseDiagnostics` is an internal field, not part of the public `typescript` API — a future
  // TypeScript upgrade could rename, move or drop it without a type error here (the cast hides
  // that), silently turning every syntax error back into a partially-walked tree. The guard
  // against that is this package's own test of a file with a syntax error (it must throw), which
  // runs in `test:services` on every change that resolves a new `typescript` — the catalog's
  // `^5.9.3` range does not pin it.
  const diagnostics = (source as unknown as { parseDiagnostics?: ts.Diagnostic[] }).parseDiagnostics
  const first = diagnostics?.[0]
  if (first) {
    const message = ts.flattenDiagnosticMessageText(first.messageText, " ")
    throw new Error(
      `${file}: cannot parse (${message}) — fix the syntax before the i18n guard can check it`
    )
  }

  const violations: Violation[] = []
  const report = (node: ts.Node, text: string) => {
    const { line } = source.getLineAndCharacterOfPosition(node.getStart(source))
    violations.push({ file, line: line + 1, text: text.replace(/\s+/g, " ").trim() })
  }
  const reportLiterals = (expression: ts.Expression | undefined) => {
    if (!expression) return
    for (const literal of renderedLiterals(expression)) {
      report(literal, literalText(literal) ?? literal.getText(source))
    }
  }

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      if (HAS_LETTER.test(decodeEntities(node.text))) report(node, node.text)
    } else if (ts.isJsxExpression(node) && !ts.isJsxAttribute(node.parent)) {
      // A JSX child (`<p>{…}</p>`); attribute values are handled below.
      reportLiterals(node.expression)
    } else if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(source))) {
      const value = node.initializer
      if (value && ts.isStringLiteral(value)) {
        if (HAS_LETTER.test(decodeEntities(value.text)))
          report(value, `${node.name.getText(source)}="${value.text}"`)
      } else if (value && ts.isJsxExpression(value)) {
        reportLiterals(value.expression)
      }
    }
    ts.forEachChild(node, visit)
  }
  visit(source)
  return violations
}

export type ScanOptions = {
  /** The directory to scan, recursively, for `.tsx` files. */
  srcDir: string
  /** The prefix files are reported and allow-listed under, e.g. `apps/auth/src`. */
  label: string
  /** A JSON array of `AllowEntry`. */
  allowlistPath: string
  /** Paths relative to `srcDir`, `/`-separated, that are never scanned. */
  isExcluded: (rel: string) => boolean
}

/**
 * Scans an app's `.tsx` files and returns the violations its allow-list does not cover. Throws
 * when the allow-list is wrong: an entry outside `label`, on an excluded file, without a reason,
 * or matching nothing any more (stale) — and when a file does not parse.
 */
export function scanApp({ srcDir, label, allowlistPath, isExcluded }: ScanOptions): Violation[] {
  const allowlist: AllowEntry[] = JSON.parse(readFileSync(allowlistPath, "utf8"))
  const prefix = `${label}/`
  for (const entry of allowlist) {
    const where = JSON.stringify(entry)
    if (!entry.file.startsWith(prefix)) {
      throw new Error(`allow-list entry outside ${label}: ${where}`)
    }
    if (isExcluded(entry.file.slice(prefix.length))) {
      throw new Error(`allow-list entry names an excluded file: ${where}`)
    }
    if (!entry.reason?.trim()) throw new Error(`allow-list entry without a reason: ${where}`)
  }

  const violations: Violation[] = []
  const files = [...new Bun.Glob("**/*.tsx").scanSync(srcDir)].map((f) => f.replaceAll("\\", "/"))
  for (const rel of files.sort()) {
    if (isExcluded(rel)) continue
    violations.push(...findViolations(`${prefix}${rel}`, readFileSync(join(srcDir, rel), "utf8")))
  }

  const matches = (entry: AllowEntry, v: Violation) =>
    entry.file === v.file && v.text.includes(entry.text)
  for (const entry of allowlist) {
    if (!violations.some((v) => matches(entry, v))) {
      throw new Error(
        `stale allow-list entry, nothing matches it any more: ${JSON.stringify(entry)}`
      )
    }
  }
  return violations.filter((v) => !allowlist.some((entry) => matches(entry, v)))
}

/** The failure message an app's guard test throws for `violations`. */
export function describeViolations(violations: Violation[], allowlistLabel: string): string {
  const lines = violations.map((v) => `  ${v.file}:${v.line}: ${JSON.stringify(v.text)}`)
  return (
    `Found ${violations.length} hard-coded string(s) outside the catalogs:\n${lines.join("\n")}\n` +
    `Translate them through t(...), or add an allow-list entry with a reason (${allowlistLabel}).`
  )
}
