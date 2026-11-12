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
  /** The ids of the body's headings, as the renderer slugs them, without `#`. */
  anchors?: string[]
  /** Every link target in the body (`extractLinks`). */
  links?: string[]
}

export interface LegalOptions {
  rootLocale: PostLocale
  /**
   * The id each language's change log heading carries. It is a link target too, and no body
   * heading may take it, so the contents list and `aria-labelledby` never point at two elements.
   */
  changeLogIds?: Record<PostLocale, string>
  /** The marketing site's pages a `www:/…` link may name; without it only the shape is checked. */
  wwwPaths?: readonly string[]
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
  options: LegalOptions
): Legal {
  const problems: string[] = []
  const docs = new Map<string, LegalDoc>()
  const placeholderList: { file: string; text: string }[] = []
  const filesByKey = new Map<string, string>()
  const built: { input: LegalInput; key: string; locale: PostLocale }[] = []
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

    const changeLogId = options.changeLogIds?.[locale]
    if (changeLogId && input.anchors?.includes(changeLogId)) {
      problems.push(
        `${input.file}: heading id "${changeLogId}" is the change log's — rename the heading`
      )
    }

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
    built.push({ input, key: key(page, locale), locale })

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

  problems.push(...linkProblems(built, docs, options))

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

/** A link to another app of the site, `<app>:<path>`; only `www:` is checked here. */
const WWW_LINK = /^www:(.*)$/
const IGNORED_SCHEME = /^(mailto|tel):/i
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/** `/a/?x#y` → `/a`: the query and fragment dropped, one trailing slash stripped (not from `/`). */
function bare(path: string): string {
  const head = path.split(/[?#]/)[0] ?? path
  return head.length > 1 && head.endsWith("/") ? head.slice(0, -1) : head
}

/**
 * Links that would not land, in every built page. A root-relative link must name a page or a
 * language's index, and a fragment a heading on that page (or its change log); a `www:/…` link a
 * page in `wwwPaths`. External links, `mailto:` and `tel:` are left alone, and any other relative
 * link is refused: it cannot be resolved without knowing the page's own path.
 */
function linkProblems(
  built: { input: LegalInput; key: string; locale: PostLocale }[],
  docs: Map<string, LegalDoc>,
  options: LegalOptions
): string[] {
  const targets = new Map<string, Set<string>>()
  for (const locale of POST_LOCALES) {
    targets.set(localePrefix(locale, options.rootLocale) || "/", new Set())
  }
  const anchorsOf = (entry: (typeof built)[number]) => {
    const own = new Set(entry.input.anchors ?? [])
    const changeLogId = options.changeLogIds?.[entry.locale]
    if (changeLogId) own.add(changeLogId)
    return own
  }
  for (const entry of built) {
    const doc = docs.get(entry.key)
    if (doc) targets.set(doc.url, anchorsOf(entry))
  }
  const www = options.wwwPaths ? new Set(options.wwwPaths) : null

  const problems: string[] = []
  for (const entry of built) {
    const { file } = entry.input
    for (const href of entry.input.links ?? []) {
      if (IGNORED_SCHEME.test(href)) continue
      const site = WWW_LINK.exec(href)
      if (site) {
        const path = site[1] ?? ""
        if (!path.startsWith("/") || path.startsWith("//")) {
          problems.push(`${file}: link "${href}" needs a path starting with "/"`)
        } else if (www && !www.has(bare(path))) {
          problems.push(`${file}: link "${href}" is not a page on the marketing site`)
        }
        continue
      }
      if (href.startsWith("#") || (href.startsWith("/") && !href.startsWith("//"))) {
        const anchors = href.startsWith("#") ? anchorsOf(entry) : targets.get(bare(href))
        if (!anchors) {
          problems.push(`${file}: broken link "${href}"`)
          continue
        }
        const fragment = href.split("#")[1]
        if (fragment !== undefined && !anchors.has(decodeFragment(fragment))) {
          problems.push(`${file}: link "${href}" names no heading on that page`)
        }
        continue
      }
      if (href.startsWith("//") || OTHER_SCHEME.test(href)) continue
      problems.push(`${file}: link "${href}" must be root-relative (start with "/")`)
    }
  }
  return problems
}

/** A fragment as written (`#%C3%A4ndringar`) compared as the id it names (`ändringar`). */
function decodeFragment(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}
