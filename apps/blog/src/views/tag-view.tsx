import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import type { BlogUi } from "@/content/ui"
import { PostListView } from "./post-list-view"

export type TagViewProps = {
  tag: string
  posts: Post[]
  authors: Record<string, Author>
  ui: BlogUi
  prefix: string
}

/** Every post with one tag, on one page. */
export function TagView({ tag, posts, authors, ui, prefix }: TagViewProps) {
  return (
    <PostListView
      posts={posts}
      page={1}
      pages={1}
      authors={authors}
      ui={ui}
      prefix={prefix}
      heading={{ title: ui.list.tagTitle(tag) }}
    />
  )
}
