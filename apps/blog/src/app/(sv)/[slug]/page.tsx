import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { authors, blog, postPage } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { PostView } from "@/views/post-view"

type Props = { params: Promise<{ slug: string }> }

export const dynamicParams = false

export function generateStaticParams(): { slug: string }[] {
  return blog.posts().map((post) => ({ slug: post.slug }))
}

/** A published post, its author and its compiled page; drafts and future posts are not found. */
function load(slug: string) {
  const post = blog.post(slug)
  const author = post && blog.author(post.author)
  const page = post && postPage(slug)
  if (!post || !author || !page) notFound()
  return { post, author, page, url: `${siteUrl("blog")}${post.url}` }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { post, author, url } = load((await params).slug)
  return {
    title: post.title,
    description: post.description,
    alternates: pageAlternates(url),
    openGraph: {
      type: "article",
      url,
      title: post.title,
      description: post.description,
      publishedTime: post.date.toISOString(),
      modifiedTime: (post.updated ?? post.date).toISOString(),
      tags: post.tags,
      authors: [author.name],
    },
  }
}

export default async function Page({ params }: Props) {
  const { post, author, page, url } = load((await params).slug)
  return (
    <PostView
      post={post}
      author={author}
      url={url}
      Body={page.data.body}
      toc={page.data.toc}
      neighbours={blog.neighbours(post.slug)}
      related={blog.related(post.slug, 3)}
      authors={authors}
    />
  )
}
