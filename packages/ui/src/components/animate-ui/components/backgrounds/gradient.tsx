"use client"

import { cn } from "@repo/ui/lib/utils"
import { type HTMLMotionProps, motion } from "motion/react"

type GradientBackgroundProps = HTMLMotionProps<"div">

function GradientBackground({
  className,
  transition = { duration: 15, ease: "easeInOut", repeat: Infinity },
  ...props
}: GradientBackgroundProps) {
  return (
    <motion.div
      data-slot="gradient-background"
      className={cn(
        "size-full bg-gradient-to-br from-blue-500 via-purple-500 to-pink-500 bg-[length:400%_400%]",
        className
      )}
      animate={{ backgroundPosition: ["0% 50%", "100% 50%", "0% 50%"] }}
      transition={transition}
      {...props}
    />
  )
}

export { GradientBackground, type GradientBackgroundProps }
