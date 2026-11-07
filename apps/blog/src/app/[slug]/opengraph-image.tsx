import { BRAND_NAME } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"
import { notFound } from "next/navigation"
import { blog } from "@/lib/blog"

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false
export const size = OG_SIZE
export const contentType = "image/png"
export const alt = `${BRAND_NAME} — Blog post`

export function generateStaticParams(): { slug: string }[] {
  return blog.posts().map((post) => ({ slug: post.slug }))
}

export default async function Image({ params }: Props) {
  const post = blog.post((await params).slug)
  if (!post) notFound()
  return ogImage({ title: post.title, subtitle: "Blog" })
}
