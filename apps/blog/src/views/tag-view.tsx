import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { PostListView } from "./post-list-view"

export type TagViewProps = {
  tag: string
  posts: Post[]
  authors: Record<string, Author>
}

/** Every post with one tag, on one page. */
export function TagView({ tag, posts, authors }: TagViewProps) {
  return (
    <PostListView
      posts={posts}
      page={1}
      pages={1}
      authors={authors}
      heading={{ title: `Posts tagged ${tag}` }}
    />
  )
}
