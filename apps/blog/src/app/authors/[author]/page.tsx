import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { authors, blog } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { AuthorView } from "@/views/author-view"

type Props = { params: Promise<{ author: string }> }

export const dynamicParams = false

export function generateStaticParams(): { author: string }[] {
  return blog.authors().map((author) => ({ author }))
}

function load(key: string) {
  const author = blog.author(key)
  const posts = blog.byAuthor(key)
  if (!author || posts.length === 0) notFound()
  return { author, posts }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { author: key } = await params
  const { author } = load(key)
  return {
    title: author.name,
    description: author.bio,
    alternates: pageAlternates(`${siteUrl("blog")}/authors/${key}`),
  }
}

export default async function Page({ params }: Props) {
  const { author: key } = await params
  const { author, posts } = load(key)
  return <AuthorView author={author} posts={posts} authors={authors} />
}
