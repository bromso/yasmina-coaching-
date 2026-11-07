import { Button } from "@repo/ui/components/button"
import Link from "next/link"

/** Keyset paging: only "Older" exists, carrying the current query along. */
export function Pager({
  href,
  nextCursor,
  params,
}: {
  href: string
  nextCursor: number | null
  params: Record<string, string | undefined>
}) {
  if (nextCursor === null) return null
  const search = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v) search.set(k, v)
  search.set("cursor", String(nextCursor))
  return (
    <div className="flex justify-end">
      <Button asChild variant="outline" size="sm">
        <Link href={`${href}?${search}`} rel="next">
          Older
        </Link>
      </Button>
    </div>
  )
}
