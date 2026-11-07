import {
  CardDescription,
  CardHeader,
  Card as CardPrimitive,
  CardTitle,
} from "@repo/ui/components/card"
import type { ReactElement, ReactNode } from "react"

export type CardsProps = {
  children: ReactNode
}

/**
 * A responsive grid of `Card`s, for an MDX body's `<Cards>` block. A pure component — no Client
 * Component anywhere in its graph — so it belongs in `mdxStaticComponents` too, alongside `Card`
 * below.
 */
export function Cards({ children }: CardsProps): ReactElement {
  return (
    <div data-slot="cards" className="my-4 grid gap-4 sm:grid-cols-2">
      {children}
    </div>
  )
}

export type CardProps = {
  title: string
  href: string
  children?: ReactNode
}

/**
 * A single card inside `<Cards>`: a stretched link over the `card` primitive — the whole card is
 * clickable, the title is the link text (`after:absolute after:inset-0`, the same technique
 * `PostCard` uses) — with an optional description from `children`.
 */
export function Card({ title, href, children }: CardProps): ReactElement {
  return (
    <CardPrimitive
      data-slot="mdx-card"
      className="relative gap-2 py-4 transition-colors hover:border-foreground/30"
    >
      <CardHeader>
        <CardTitle>
          <a href={href} className="after:absolute after:inset-0 hover:underline">
            {title}
          </a>
        </CardTitle>
        {children && <CardDescription>{children}</CardDescription>}
      </CardHeader>
    </CardPrimitive>
  )
}
