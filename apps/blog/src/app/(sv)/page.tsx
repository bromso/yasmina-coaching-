// Loading the blog validates every post, so a bad post fails `next build` on every page.

import { siteUrl } from "@repo/sites"
import type { Metadata } from "next"
import { authors, blog } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { PostListView } from "@/views/post-list-view"

export const metadata: Metadata = {
  alternates: pageAlternates(`${siteUrl("blog")}/`),
}

export default function Page() {
  const { posts, page, pages } = blog.page(1)
  return <PostListView posts={posts} page={page} pages={pages} authors={authors} />
}
