"use client"

import { Button } from "@repo/ui/components/button"
import { Icon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"
import { useTheme } from "next-themes"

/** Flips between light and dark. */
export function ThemeToggle({
  className,
  label = "Toggle theme",
}: {
  className?: string
  /** The button's accessible name, in the page's language. */
  label?: string
}) {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <Button
      variant="outline"
      size="icon"
      aria-label={label}
      className={cn("size-9", className)}
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
    >
      <Icon
        icon="lucide:sun"
        className="size-4 scale-100 rotate-0 transition-transform dark:scale-0 dark:-rotate-90"
      />
      <Icon
        icon="lucide:moon"
        className="absolute size-4 scale-0 rotate-90 transition-transform dark:scale-100 dark:rotate-0"
      />
    </Button>
  )
}
