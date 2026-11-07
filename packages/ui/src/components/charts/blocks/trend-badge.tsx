"use client"

import { Badge } from "@repo/ui/components/badge"
import { Icon } from "@repo/ui/components/icon"
import { cn } from "@repo/ui/lib/utils"

export function TrendBadge({ value, className }: { value: number; className?: string }) {
  const positive = value >= 0

  return (
    <Badge
      className={cn(
        positive &&
          "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        className
      )}
      variant={positive ? "outline" : "destructive"}
    >
      <Icon
        className="size-3"
        data-icon="inline-start"
        icon={positive ? "lucide:arrow-up" : "lucide:arrow-down"}
      />
      {positive ? "+" : ""}
      {value.toFixed(1)}%
    </Badge>
  )
}
