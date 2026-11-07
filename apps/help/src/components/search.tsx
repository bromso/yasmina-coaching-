"use client"

import { DocsSearch } from "@repo/ui/blocks/docs-search"
import { useDocsSearch } from "fumadocs-core/search/client"
import { staticClient } from "fumadocs-core/search/client/orama-static"
import { useRouter } from "next/navigation"
import { searchResultsFor } from "@/lib/search-results"

/** One client for the page's lifetime: it downloads `/api/search` (same origin) on the first
 * query and searches it in the browser from then on. */
const client = staticClient({ from: "/api/search" })

/** `DocsSearch`'s own copy is written for `apps/docs`; this app searches help articles, not
 * "the docs", so every string it shows is renamed here rather than left to the block's default. */
const LABELS = {
  trigger: "Search help",
  dialogTitle: "Search help",
  description: "Search help articles",
  placeholder: "Search help…",
  hint: "Type to search help articles",
}

/**
 * The help center's search: `DocsSearch` (a link to `/all` without JavaScript, then the ⌘K / Ctrl
 * K dialog) over fumadocs' static index. A result opens through the router, so navigation stays
 * client-side.
 */
export function Search() {
  const router = useRouter()
  const { search, setSearch, query } = useDocsSearch({ client })
  return (
    <DocsSearch
      fallbackHref="/all"
      query={search}
      onQueryChange={setSearch}
      results={searchResultsFor(search, query)}
      onNavigate={(href) => router.push(href)}
      labels={LABELS}
    />
  )
}
