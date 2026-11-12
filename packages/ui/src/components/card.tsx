import { cn } from "@repo/ui/lib/utils"
import type * as React from "react"

type CardProps<T extends React.ElementType = "article"> = {
  as?: T
  /**
   * `default` has www's rounded-4xl corners. `compact` is for dense screens (admin stat tiles,
   * tables, list rows): the same padding and gaps, with a tighter radius that a short card or a
   * full-width table row does not turn into a stadium.
   */
  size?: "default" | "compact"
  className?: string
} & Omit<React.ComponentPropsWithoutRef<T>, "as" | "className" | "size">

function Card<T extends React.ElementType = "article">({
  as,
  size = "default",
  className,
  ...props
}: CardProps<T>) {
  const Component = as || "article"
  return (
    <Component
      data-slot="card"
      data-size={size}
      className={cn(
        "bg-card text-card-foreground flex min-w-0 flex-col gap-6 border py-6 shadow-sm",
        size === "compact" ? "rounded-2xl" : "rounded-4xl",
        className
      )}
      {...props}
    />
  )
}

function CardHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6",
        className
      )}
      {...props}
    />
  )
}

function CardTitle({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-title"
      className={cn("leading-none font-semibold", className)}
      {...props}
    />
  )
}

function CardDescription({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-description"
      className={cn("text-muted-foreground text-sm", className)}
      {...props}
    />
  )
}

function CardAction({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-action"
      className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)}
      {...props}
    />
  )
}

function CardContent({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-6", className)} {...props} />
}

function CardFooter({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="card-footer"
      className={cn("flex items-center px-6 [.border-t]:pt-6", className)}
      {...props}
    />
  )
}

export { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle }
