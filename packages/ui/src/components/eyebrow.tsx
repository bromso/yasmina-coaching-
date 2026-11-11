import { cn } from "@repo/ui/lib/utils"

/** The small uppercase label above a section's headline. */
export function Eyebrow({ children, className }: { children: string; className?: string }) {
  return (
    <span
      className={cn(
        "block font-medium text-muted-foreground text-xs uppercase tracking-[0.18em]",
        className
      )}
    >
      {children}
    </span>
  )
}
