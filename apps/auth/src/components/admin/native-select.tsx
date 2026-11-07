import { cn } from "@repo/ui/lib/utils"
import type { ComponentProps } from "react"

/**
 * A plain `<select>` styled like `Input`: the admin forms submit without JavaScript, which the
 * Radix Select cannot (it renders no form control until hydrated).
 */
export function NativeSelect({ className, ...props }: ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "h-9 w-full rounded-md border border-input bg-background px-2 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive",
        className
      )}
      {...props}
    />
  )
}
