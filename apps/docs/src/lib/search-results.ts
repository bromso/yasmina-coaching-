import type { DocsSearchResult } from "@repo/ui/blocks/docs-search"
import type { SortedResult } from "fumadocs-core/search"
import type { ReactNode } from "react"
import { textOf } from "./nav"

/** fumadocs' highlighting: each match wrapped in `<mark>…</mark>`, inside Markdown. */
const MARK = /<\/?mark>/gi
/** The inline Markdown fumadocs keeps in a hit (its index holds each paragraph's source): a link
 * keeps its text, code its content, strong and emphasis their words. Emphasis needs a non-word
 * character (or an edge) outside each marker, so `SITE_DOMAIN` and `2 * 3` are left alone. */
const INLINE_MARKDOWN: [RegExp, string][] = [
  [/\[([^\]]*)\]\([^)]*\)/g, "$1"],
  [/`([^`]*)`/g, "$1"],
  [/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2"],
  [/(^|\W)([*_])(?=\S)(.+?)(?<=\S)\2(?!\w)/g, "$1$3"],
]

/**
 * A search hit's text as plain text: a React node flattened (`textOf`), fumadocs' `<mark>`
 * highlighting dropped, then simple inline Markdown reduced to its text. Nothing else is stripped:
 * `DocsSearch` renders it as text, never as HTML, so a literal `<Search />` in the docs stays
 * readable and injects nothing.
 */
export function plainText(content: ReactNode): string {
  return INLINE_MARKDOWN.reduce(
    (text, [pattern, replacement]) => text.replace(pattern, replacement),
    textOf(content).replace(MARK, "")
  )
}

/**
 * fumadocs' hits as `DocsSearch` results. fumadocs lists each matching page followed by its own
 * heading and text hits, so a page hit sets the title its hits are shown under: a heading hit is
 * the heading (`url#id`, as fumadocs gives it) with its page as the excerpt; a text hit is the
 * text as the excerpt, titled by the heading it sits under when that heading is among the hits
 * (same URL), else by its page.
 */
export function toSearchResults(hits: SortedResult<ReactNode>[]): DocsSearchResult[] {
  const headings = new Map<string, string>()
  for (const hit of hits) if (hit.type === "heading") headings.set(hit.url, plainText(hit.content))
  let page = ""
  return hits.map((hit): DocsSearchResult => {
    const content = plainText(hit.content)
    const base = { id: hit.id, href: hit.url }
    if (hit.type === "page") {
      page = content
      return { ...base, kind: "page", title: content }
    }
    if (hit.type === "heading")
      return { ...base, kind: "heading", title: content, excerpt: page || undefined }
    return { ...base, kind: "text", title: headings.get(hit.url) ?? page, excerpt: content }
  })
}

/** `useDocsSearch`'s `query`, as far as the results depend on it. */
export interface SearchQueryState {
  isLoading: boolean
  data?: SortedResult<ReactNode>[] | "empty"
  error?: Error
}

/**
 * What `DocsSearch` shows for `search` and fumadocs' query state: nothing for a blank query;
 * "loading" while a query runs — including the first one, which also downloads the index, and one
 * still waiting out the debounce (fumadocs answers `"empty"` only for an empty query, so `"empty"`
 * next to a non-empty one means it has not run yet); "error" for a failed query (the index could
 * not be fetched); "empty" for no hits; otherwise the mapped hits.
 *
 * fumadocs' static client caches the index download, a rejected one included, so after one failed
 * fetch every query fails the same way and "error" stays until the page is reloaded.
 */
export function searchResultsFor(
  search: string,
  query: SearchQueryState
): DocsSearchResult[] | "loading" | "empty" | "error" {
  if (search.trim() === "") return []
  if (query.isLoading) return "loading"
  if (query.error) return "error"
  if (query.data === undefined || query.data === "empty") return "loading"
  if (query.data.length === 0) return "empty"
  return toSearchResults(query.data)
}
