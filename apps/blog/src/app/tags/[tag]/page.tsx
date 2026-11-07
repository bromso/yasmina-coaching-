import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { authors, blog } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { TagView } from "@/views/tag-view"

type Props = { params: Promise<{ tag: string }> }

export const dynamicParams = false

export function generateStaticParams(): { tag: string }[] {
  return blog.tags().map(({ tag }) => ({ tag }))
}

function load(tag: string) {
  const posts = blog.byTag(tag)
  if (posts.length === 0) notFound()
  return posts
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { tag } = await params
  load(tag)
  return {
    title: `Posts tagged ${tag}`,
    description: `Every post tagged “${tag}”.`,
    alternates: pageAlternates(`${siteUrl("blog")}/tags/${tag}`),
  }
}

export default async function Page({ params }: Props) {
  const { tag } = await params
  return <TagView tag={tag} posts={load(tag)} authors={authors} />
}
