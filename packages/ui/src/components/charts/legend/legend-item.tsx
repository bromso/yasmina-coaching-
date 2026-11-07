"use client"

import { cn } from "@repo/ui/lib/utils"
import type { ReactNode } from "react"
import { useLegend, useLegendItem } from "./legend-context"

export interface LegendItemProps {
  /** Container class name */
  className?: string
  /** Children components (LegendMarker, LegendLabel, LegendValue, LegendProgress) */
  children: ReactNode
}

export function LegendItem({ className = "", children }: LegendItemProps) {
  const { setHoveredIndex } = useLegend()
  const { index, isHovered } = useLegendItem()

  return (
    // Legend item hover interaction
    <div
      className={cn(
        "cursor-pointer rounded-lg px-2 py-1.5 transition-all duration-150 ease-out",
        isHovered && "bg-legend-muted",
        className
      )}
      data-hovered={isHovered ? "" : undefined}
      onMouseEnter={() => setHoveredIndex(index)}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      {children}
    </div>
  )
}

LegendItem.displayName = "LegendItem"
