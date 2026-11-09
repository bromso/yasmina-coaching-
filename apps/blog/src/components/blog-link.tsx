import { MdxLink } from "@repo/ui/components/mdx/link"
import type { ComponentPropsWithoutRef } from "react"
import { resolveSiteHref } from "@/lib/site-links"

/** The MDX `a` of a post: `MdxLink`, with a `www:/…` site link resolved to its absolute URL. */
export function BlogLink({ href, ...props }: ComponentPropsWithoutRef<"a">) {
  return <MdxLink href={resolveSiteHref(href)} {...props} />
}
