import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { PostListView } from "./post-list-view"

export type AuthorViewProps = {
  author: Author
  posts: Post[]
  authors: Record<string, Author>
}

/** Every post by one author, on one page, under the author's name and bio. */
export function AuthorView({ author, posts, authors }: AuthorViewProps) {
  return (
    <PostListView
      posts={posts}
      page={1}
      pages={1}
      authors={authors}
      heading={{ title: author.name, description: author.bio }}
    />
  )
}
