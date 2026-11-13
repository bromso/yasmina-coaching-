import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

// A markdown table, styled from the tokens. Pure (no "use client"), so `mdx-static` shares it.
// Unlike `components/table` (shadcn's, for data UI), cells wrap: these hold sentences.

/** The table inside its own scroll box: on a narrow screen a wide table scrolls sideways there
 * and the page never does. Focusable so a keyboard user can scroll it (WCAG 2.1.1, axe's
 * scrollable-region-focusable); its cells hold no focusable control of their own. */
export function MdxTable({ className, ...props }: ComponentPropsWithoutRef<"table">) {
  return (
    <div
      data-slot="mdx-table"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard
      tabIndex={0}
      className="w-full overflow-x-auto rounded-md border outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
    >
      {/* Inline code (a cookie's name, say) keeps to one line: the box scrolls rather than break
          a name mid-word, as `MdxCode`'s `overflow-wrap: anywhere` would in a narrow column. */}
      <table
        className={cn(
          "w-full border-collapse text-left text-base [&_code]:whitespace-nowrap [&_code]:[overflow-wrap:normal]",
          className
        )}
        {...props}
      />
    </div>
  )
}

export function MdxThead({ className, ...props }: ComponentPropsWithoutRef<"thead">) {
  return <thead className={cn("bg-muted text-foreground", className)} {...props} />
}

export function MdxTbody(props: ComponentPropsWithoutRef<"tbody">) {
  return <tbody {...props} />
}

export function MdxTr({ className, ...props }: ComponentPropsWithoutRef<"tr">) {
  return <tr className={cn("border-b last:border-b-0", className)} {...props} />
}

/** A header cell. Markdown only puts them in the header row, so each heads its column. */
export function MdxTh({ className, scope = "col", ...props }: ComponentPropsWithoutRef<"th">) {
  return (
    <th
      scope={scope}
      className={cn("px-3 py-2 align-bottom font-semibold", className)}
      {...props}
    />
  )
}

export function MdxTd({ className, ...props }: ComponentPropsWithoutRef<"td">) {
  return <td className={cn("px-3 py-2 align-top", className)} {...props} />
}
