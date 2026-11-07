import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { authors, blog } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { PostListView } from "@/views/post-list-view"

type Props = { params: Promise<{ n: string }> }

// Page 1 is `/`; only 2..pages exist here.
export const dynamicParams = false

export function generateStaticParams(): { n: string }[] {
  const { pages } = blog.page(1)
  return Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ({ n: String(i + 2) }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { n } = await params
  return {
    title: `Posts, page ${n}`,
    alternates: pageAlternates(`${siteUrl("blog")}/page/${n}`),
  }
}

export default async function Page({ params }: Props) {
  const { n } = await params
  const number = Number(n)
  const { pages } = blog.page(1)
  if (!Number.isInteger(number) || number < 2 || number > pages) notFound()
  const { posts, page } = blog.page(number)
  return <PostListView posts={posts} page={page} pages={pages} authors={authors} />
}
