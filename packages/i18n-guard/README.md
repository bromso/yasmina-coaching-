# @repo/i18n-guard

The hard-coded-string guard every translated app runs inside its own `bun test`. A workspace
package rather than a file under `scripts/`: it needs `typescript` (declared here via `catalog:`),
and CI's planner job runs `bun test scripts` before `bun install`.

```ts
import { describeViolations, findViolations, scanApp } from "@repo/i18n-guard"
```

## What it flags

`findViolations(file, content)` parses one `.tsx` source with the TypeScript compiler and walks the
JSX, returning `{ file, line, text }[]` for:

- a `JsxText` node containing a letter (`<p>Hello</p>`, text across lines, the words around an
  expression in `<p>{name} signed in</p>`);
- a string or template literal written as a JSX child (`{"Hello"}`), either branch of a conditional
  and the operands of `&&` / `||` / `??`, through parentheses;
- the same literals as the value, plain or in braces, of `placeholder`, `aria-label`, `alt`,
  `title`, `label` or `aria-description`.

JSX text and plain attribute values are decoded before the letter test: numeric entities
(`&#160;`, `&#xA0;`) and a short list of named ones (`nbsp middot copy reg trade amp lt gt quot
apos hellip mdash ndash rsquo lsquo rdquo ldquo bull times`), so `<p>&nbsp;&middot;&nbsp;</p>` is
not text, while `Hello&nbsp;world` is. An unknown named entity stays as written — letters and all —
so a typo (`&nbps;`) is still flagged. A numeric entity past the last valid code point (`&#x110000;`,
`&#1114112;`) is left as written too, rather than replaced: the hex spelling still has a letter (its
own `x`) and so is flagged, while the decimal spelling has none and passes — a pinned quirk of
looking only for letters, not a claim that it is safe. The report keeps the text as written in the
source.

A file with a syntax error throws `<file>: cannot parse (<first diagnostic>) — …` instead of being
walked as the partial tree TypeScript recovers.

Blind spots: a string held in a variable outside the JSX, other attributes or props
(`<Card heading="Hi" />`), and anything a `.ts` file renders. It is a floor, not a guarantee.

## Per app

`scanApp({ srcDir, label, allowlistPath, isExcluded })` scans every `.tsx` under `srcDir` (paths
relative to it, `/`-separated, skipped when `isExcluded(rel)`), names each file `<label>/<rel>`,
and returns the violations the allow-list does not cover. The allow-list is a JSON array of
`{ file, text, reason }`, matched by file and by `text` as a substring of the flagged text — never by
line. `scanApp` throws when an entry is outside `label`, names an excluded file, has no reason, or
matches nothing any more (stale).

An app's guard is one short test (see `apps/auth/src/i18n-guard.test.ts`):

```ts
test("apps/<name>'s translated surface has no hard-coded, user-facing JSX text", () => {
  const violations = scanApp({
    srcDir: import.meta.dir,
    label: "apps/<name>/src",
    allowlistPath: join(import.meta.dir, "..", "i18n-guard.allowlist.json"),
    isExcluded,
  })
  if (violations.length > 0) {
    throw new Error(describeViolations(violations, "apps/<name>/i18n-guard.allowlist.json"))
  }
  expect(violations).toEqual([])
})
```

The app adds `@repo/i18n-guard` (`workspace:*`) to its `devDependencies`.
