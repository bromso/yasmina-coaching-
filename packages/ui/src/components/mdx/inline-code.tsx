import { cn } from "@repo/ui/lib/utils"
import type { ComponentPropsWithoutRef } from "react"

/**
 * The MDX `code`. MDX maps every `<code>` — inline spans and the one Shiki puts inside `<pre>` —
 * to this component. Telling the two apart used to need a Client Component (a React Context
 * provided by `CodeBlock`, consumed here), which kept this file — and anything that imported it
 * — out of the static feed renderer. Instead, the inline pill styling is always applied and then
 * reset by a `pre &` CSS variant whenever this `<code>` actually sits inside a real `<pre>`
 * (Shiki's own highlighted block): no JavaScript or Context needed, so this is a pure component
 * and belongs in `mdxStaticComponents` too.
 */
export function MdxCode({ className, ...props }: ComponentPropsWithoutRef<"code">) {
  return (
    <code
      data-slot="inline-code"
      className={cn(
        "rounded bg-muted px-1.5 py-0.5 font-mono text-[0.875em] [overflow-wrap:anywhere]",
        "[pre_&]:rounded-none [pre_&]:bg-transparent [pre_&]:p-0 [pre_&]:text-[length:inherit] [pre_&]:[overflow-wrap:normal]",
        className
      )}
      {...props}
    />
  )
}
