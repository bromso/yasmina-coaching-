"use client"

import { DocsSearch } from "@repo/ui/blocks/docs-search"
import { useDocsSearch } from "fumadocs-core/search/client"
import { staticClient } from "fumadocs-core/search/client/orama-static"
import { useRouter } from "next/navigation"
import { searchResultsFor } from "@/lib/search-results"

/** One client for the page's lifetime: it downloads `/api/search` (same origin) on the first
 * query and searches it in the browser from then on. */
const client = staticClient({ from: "/api/search" })

/**
 * The docs search: `DocsSearch` (a link to `/all` without JavaScript, then the ⌘K / Ctrl K dialog)
 * over fumadocs' static index. A result opens through the router, so navigation stays client-side.
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
    />
  )
}
