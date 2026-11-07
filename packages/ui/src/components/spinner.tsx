import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"
import { Icon } from "./icon"

function Spinner({ className, ...props }: Omit<React.ComponentProps<typeof Icon>, "icon">) {
  return (
    <Icon
      icon="lucide:loader-2"
      role="status"
      aria-label="Loading"
      className={cn("size-4 animate-spin", className)}
      {...props}
    />
  )
}

export { Spinner }
