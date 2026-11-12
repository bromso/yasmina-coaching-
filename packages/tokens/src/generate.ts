/*
 * The style-dictionary build behind `bun run tokens`: reads `src/tokens/*.json` and writes the two
 * files the apps consume, both committed so nothing has to run this before a typecheck, test or
 * build, plus Storybook's (uncommitted) `dist/json`:
 *
 * - `packages/ui/src/styles/tokens.generated.css`: every token as a CSS variable, `:root` for the
 *   light theme and `.dark` for the dark one, colours kept in `oklch()`;
 * - `packages/email/src/tokens.generated.ts`: the light palette as sRGB hex plus the mail fonts,
 *   since mail clients read neither `oklch()` nor web fonts reliably.
 *
 * The rendering lives in `./render.ts`; `scripts/tokens.test.ts` fails when a committed file
 * differs from it.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import StyleDictionary from "style-dictionary"
import type { TransformedToken } from "style-dictionary/types"
import { cssName, OUTPUTS, renderEmail, renderTheme, resolveTokens, type Token } from "./render"

const local = (relative: string) => fileURLToPath(new URL(relative, import.meta.url))

/**
 * The tokens as written (style-dictionary's `original`, references unresolved), resolved in both
 * themes by `resolveTokens`: style-dictionary resolves `$value` alone, never the dark value.
 */
const themed = (tokens: TransformedToken[]): Token[] =>
  resolveTokens(
    tokens.map((token) => {
      const dark: string | undefined = token.original.$extensions?.mode?.dark
      const value = String(token.original.$value)
      return { path: token.path, value, ...(dark === undefined ? {} : { dark }) }
    })
  )

function dictionary(): StyleDictionary {
  return new StyleDictionary({
    source: [local("./tokens/**/*.json")],
    log: { verbosity: "silent" },
    hooks: {
      transforms: { "name/theme": { type: "name", transform: (token) => cssName(token.path) } },
      formats: {
        "css/theme": ({ dictionary }) => renderTheme(themed(dictionary.allTokens)),
        "typescript/email": ({ dictionary }) => renderEmail(themed(dictionary.allTokens)),
      },
    },
    platforms: {
      css: {
        transforms: ["name/theme"],
        files: [{ destination: OUTPUTS.css, format: "css/theme" }],
      },
      email: {
        transforms: ["name/theme"],
        files: [{ destination: OUTPUTS.email, format: "typescript/email" }],
      },
      // Storybook's Theme/Tokens story reads this one (`@repo/tokens/json`); it is not committed.
      json: {
        transforms: [],
        buildPath: `${local("../dist/json")}/`,
        files: [{ destination: "tokens.json", format: "json/nested" }],
      },
    },
  })
}

/** Both committed files' contents, built by style-dictionary in memory. */
export async function generate(): Promise<{ css: string; email: string }> {
  const sd = dictionary()
  const [[css], [email]] = await Promise.all([sd.formatPlatform("css"), sd.formatPlatform("email")])
  return { css: String(css?.output), email: String(email?.output) }
}

/**
 * Writes Storybook's `dist/json`, and each committed file only when its content changed: the
 * root `build` runs this alongside the apps' `next build`, which must never read a half-written
 * stylesheet.
 */
export async function build(): Promise<void> {
  const sd = dictionary()
  await sd.buildPlatform("json")
  const files = await generate()
  for (const key of ["css", "email"] as const) {
    const current = existsSync(OUTPUTS[key]) ? readFileSync(OUTPUTS[key], "utf8") : undefined
    if (current !== files[key]) writeFileSync(OUTPUTS[key], files[key])
  }
}
