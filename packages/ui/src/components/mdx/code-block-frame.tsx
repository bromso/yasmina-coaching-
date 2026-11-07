import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef, ReactNode } from "react"

export type CodeBlockFrameProps = ComponentPropsWithoutRef<"pre"> & {
  title?: string
  /** A slot next to the `<pre>` for `CodeBlock`'s copy button; empty for the static feed map. */
  actions?: ReactNode
}

/**
 * The frame `pre` fumadocs' Shiki renderer hands us, with an optional title bar above it and a
 * slot for actions. A pure component — no hooks, no Client Component anywhere in its graph — so
 * it is both `CodeBlock`'s own wrapper and `mdxStaticComponents.pre` directly.
 */
export function CodeBlockFrame({
  title,
  actions,
  className,
  children,
  ...props
}: CodeBlockFrameProps) {
  return (
    <div data-slot="code-block" className="group relative my-4">
      {title && (
        <div className="rounded-t-lg border border-b-0 bg-muted px-4 py-2 text-xs font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <pre
        className={cn(
          "overflow-x-auto rounded-lg p-4 text-sm",
          title && "rounded-t-none",
          className
        )}
        {...props}
      >
        {children}
      </pre>
      {actions}
    </div>
  )
}
