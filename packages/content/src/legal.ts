import { ContentError, localePrefix } from "./posts"
import type { LegalFrontmatter, PostLocale } from "./schema"
import { legalFrontmatterSchema, POST_LOCALES } from "./schema"

export type { LegalFrontmatter } from "./schema"

/** A page id mapped to its slug in each language. */
export type LegalPageMap = Record<string, Record<PostLocale, string>>

export interface LegalInput {
  /** Repo-relative path, for error messages. */
  file: string
  slug: string
  frontmatter: unknown
  /** Plain text of the body (placeholder scan). */
  text: string
}

export type LegalDoc = Omit<LegalFrontmatter, "changes"> & {
  changes: { date: Date; summary: string }[]
  slug: string
  url: string
  /** The newest change's date. */
  updated: Date
  /** The well-formed placeholders in the body. */
  placeholders: string[]
}

export interface Legal {
  /** In the key order of the page map, then Swedish before English as `POST_LOCALES` lists them. */
  docs(): LegalDoc[]
  doc(page: string, locale: PostLocale): LegalDoc
  inLocale(locale: PostLocale): LegalDoc[]
  /** The same page in the other language. */
  translation(doc: LegalDoc): LegalDoc
  /** Every well-formed placeholder still to be filled, with the file it sits in. */
  placeholders(): { file: string; text: string }[]
}

/** Anything that begins like a placeholder, so a misspelt one is found rather than ignored. */
export const PLACEHOLDER_PATTERN = /\[(?:ATT FYLLA|TO FILL)[^\]\n]*\]?/g

const VALID_PLACEHOLDER = /^\[(ATT FYLLA|TO FILL):\s*([^\]]*?)\s*\]$/

const PLACEHOLDER_LOCALE: Record<string, PostLocale> = { "ATT FYLLA": "sv", "TO FILL": "en" }

/**
 * Every placeholder in `text`. `valid` is true only for `[ATT FYLLA: <text>]` or
 * `[TO FILL: <text>]` with something after the colon; `locale` is the language the marker is
 * written in, or null when the marker is malformed.
 */
export function findPlaceholders(
  text: string
): { text: string; locale: PostLocale | null; valid: boolean }[] {
  return [...text.matchAll(PLACEHOLDER_PATTERN)].map((match) => {
    const found = match[0]
    const parts = VALID_PLACEHOLDER.exec(found)
    if (!parts?.[2]) return { text: found, locale: null, valid: false }
    return { text: found, locale: PLACEHOLDER_LOCALE[parts[1] as string] ?? null, valid: true }
  })
}

/**
 * Builds the legal pages from already-parsed files and the page map. Re-validates every file
 * and collects every problem before throwing one `ContentError`, never stopping at the first.
 */
export function createLegal(
  inputs: LegalInput[],
  pages: LegalPageMap,
  options: { rootLocale: PostLocale }
): Legal {
  const problems: string[] = []
  const docs = new Map<string, LegalDoc>()
  const placeholderList: { file: string; text: string }[] = []
  const filesByKey = new Map<string, string>()
  const key = (page: string, locale: PostLocale) => `${page}\u0000${locale}`

  for (const input of inputs) {
    const parsed = legalFrontmatterSchema.safeParse(input.frontmatter)
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        problems.push(`${input.file}: ${issue.path.join(".") || "frontmatter"}: ${issue.message}`)
      }
      continue
    }
    const { changes, ...rest } = parsed.data
    const { page, locale } = rest

    // Placeholders are checked wherever the frontmatter is sound, whatever else is wrong.
    const found = findPlaceholders(input.text)
    const valid: string[] = []
    for (const placeholder of found) {
      if (!placeholder.valid) {
        problems.push(
          `${input.file}: malformed placeholder "${placeholder.text}" (write [ATT FYLLA: …] or [TO FILL: …])`
        )
      } else if (placeholder.locale !== locale) {
        problems.push(
          `${input.file}: placeholder "${placeholder.text}" is in the wrong language for a "${locale}" file`
        )
      } else {
        valid.push(placeholder.text)
        placeholderList.push({ file: input.file, text: placeholder.text })
      }
    }

    const slugs = pages[page]
    if (!slugs) {
      problems.push(`${input.file}: unknown page "${page}" (not in the page map)`)
      continue
    }
    if (input.slug !== slugs[locale]) {
      problems.push(
        `${input.file}: slug "${input.slug}" must be "${slugs[locale]}" for page "${page}" in "${locale}"`
      )
    }

    for (let i = 1; i < changes.length; i++) {
      if ((changes[i - 1] as { date: Date }).date < (changes[i] as { date: Date }).date) {
        problems.push(`${input.file}: changes must be sorted newest first`)
        break
      }
    }

    const existing = filesByKey.get(key(page, locale))
    if (existing) {
      problems.push(`${input.file}: duplicate "${page}" page in "${locale}" (also ${existing})`)
      continue
    }
    filesByKey.set(key(page, locale), input.file)

    docs.set(key(page, locale), {
      ...rest,
      changes,
      slug: slugs[locale],
      url: `${localePrefix(locale, options.rootLocale)}/${slugs[locale]}`,
      updated: (changes[0] as { date: Date }).date,
      placeholders: valid,
    })
  }

  for (const [page] of Object.entries(pages)) {
    for (const locale of POST_LOCALES) {
      if (!filesByKey.has(key(page, locale))) {
        problems.push(`page "${page}" has no "${locale}" version`)
      }
    }
    const root = docs.get(key(page, options.rootLocale))
    if (!root) continue
    for (const locale of POST_LOCALES) {
      if (locale === options.rootLocale) continue
      const other = docs.get(key(page, locale))
      if (other && other.updated.getTime() !== root.updated.getTime()) {
        problems.push(
          `${filesByKey.get(key(page, locale))}: newest change differs from ${filesByKey.get(key(page, options.rootLocale))} — update both languages together`
        )
      }
    }
  }

  if (problems.length > 0) throw new ContentError(problems)

  const ordered: LegalDoc[] = []
  for (const page of Object.keys(pages)) {
    for (const locale of POST_LOCALES) {
      const doc = docs.get(key(page, locale))
      if (doc) ordered.push(doc)
    }
  }

  return {
    docs: () => [...ordered],
    doc(page, locale) {
      const doc = docs.get(key(page, locale))
      if (!doc) throw new Error(`No legal page "${page}" in "${locale}"`)
      return doc
    },
    inLocale: (locale) => ordered.filter((doc) => doc.locale === locale),
    translation(doc) {
      const other = POST_LOCALES.find((locale) => locale !== doc.locale)
      if (!other) throw new Error("No other language")
      const found = docs.get(key(doc.page, other))
      if (!found) throw new Error(`No legal page "${doc.page}" in "${other}"`)
      return found
    },
    placeholders: () => [...placeholderList],
  }
}
