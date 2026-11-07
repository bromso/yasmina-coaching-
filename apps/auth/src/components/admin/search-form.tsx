import { Button } from "@repo/ui/components/button"
import { Input } from "@repo/ui/components/input"
import { Label } from "@repo/ui/components/label"
import type * as React from "react"

/** A GET form: the query lives in the URL, so a search is a link and works without JS. */
export function SearchForm({
  action,
  q,
  placeholder,
  children,
}: {
  action: string
  q?: string
  placeholder: string
  /** Extra filter controls, submitted in the same GET request as `q` (e.g. a checkbox). */
  children?: React.ReactNode
}) {
  return (
    <form action={action} method="get" className="flex flex-wrap items-end gap-3">
      <div className="grid flex-1 gap-1.5">
        <Label htmlFor="q">Search</Label>
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={q ?? ""}
          placeholder={placeholder}
          maxLength={100}
        />
      </div>
      {children}
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  )
}
