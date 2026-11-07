import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

// Plain markdown prose. Tailwind's preflight resets margins and list markers, so each element gets
// its own line height and markers here; the spacing between blocks belongs to the page's layout.

export function MdxParagraph({ className, ...props }: ComponentPropsWithoutRef<"p">) {
  return <p className={cn("leading-7", className)} {...props} />
}

export function MdxUl({ className, ...props }: ComponentPropsWithoutRef<"ul">) {
  return <ul className={cn("list-disc pl-6", className)} {...props} />
}

export function MdxOl({ className, ...props }: ComponentPropsWithoutRef<"ol">) {
  return <ol className={cn("list-decimal pl-6", className)} {...props} />
}

export function MdxLi({ className, ...props }: ComponentPropsWithoutRef<"li">) {
  return <li className={cn("mt-1 leading-7", className)} {...props} />
}
