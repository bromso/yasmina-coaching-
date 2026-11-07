import { cn } from "@repo/ui/lib/utils"
import type { ComponentProps } from "react"

/**
 * A plain `<select>` styled like `Input`. The Radix `Select` needs JavaScript to submit a value; the
 * Workspace forms must work without it.
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "border-input dark:bg-input/30 h-9 min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs outline-none transition-[color,box-shadow] disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
        "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}
