import type { ReactNode } from "react"

/** A numbered walkthrough: `Steps` is the `<ol>`, each `Step` an `<li>` with a counter bullet. */
export function Steps({ children }: { children: ReactNode }) {
  return (
    <ol
      data-slot="steps"
      className="my-4 flex flex-col gap-6 border-l pl-8 [counter-reset:mdx-step]"
    >
      {children}
    </ol>
  )
}

export function Step({ children }: { children: ReactNode }) {
  return (
    <li
      data-slot="step"
      className="relative [counter-increment:mdx-step] before:absolute before:-left-[2.1rem] before:flex before:size-6 before:items-center before:justify-center before:rounded-full before:bg-muted before:text-xs before:font-semibold before:text-muted-foreground before:content-[counter(mdx-step)]"
    >
      {children}
    </li>
  )
}
