import type React from "react"

import { cn } from "@/lib/utils"

type BackgroundProps = {
  children: React.ReactNode
  variant?: "top" | "bottom"
  className?: string
}

/** The site's sun glow: a soft yellow that fades into the page, behind a status page or a section. */
export const Background = ({ children, variant = "top", className }: BackgroundProps) => {
  return (
    <div
      className={cn(
        "relative mx-2.5 mt-2.5 lg:mx-4",
        variant === "top" &&
          "rounded-t-4xl rounded-b-2xl bg-linear-to-b from-sun via-sun-soft via-30% to-background",
        variant === "bottom" &&
          "rounded-t-2xl rounded-b-4xl bg-linear-to-b from-background via-sun-soft to-sun",
        className
      )}
    >
      {children}
    </div>
  )
}
