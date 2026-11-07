import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { PostCard, type PostCardProps } from "@repo/ui/blocks/post-card"
import { Empty, EmptyHeader, EmptyTitle } from "@repo/ui/components/empty"
import {
  Pagination,
  PaginationContent,
  PaginationItem,
  PaginationLink,
} from "@repo/ui/components/pagination"

/** The address of list page `n`: page 1 is the index, the rest `/page/<n>`. */
export function pageHref(n: number): string {
  return n <= 1 ? "/" : `/page/${n}`
}

/** A post as a `PostCard`: linked to its address, its tags and its author's name and avatar. */
export function postCardProps(
  post: Post,
  authors: Record<string, Author>,
  featured = false
): PostCardProps {
  const author = authors[post.author]
  return {
    href: post.url,
    title: post.title,
    description: post.description,
    date: post.date,
    readingMinutes: post.readingMinutes,
    author: author?.avatar
      ? { name: author.name, avatar: author.avatar }
      : { name: author?.name ?? post.author },
    tags: post.tags.map((tag) => ({ tag, href: `/tags/${tag}` })),
    featured,
  }
}

export type PostListViewProps = {
  posts: Post[]
  page: number
  pages: number
  /** Every author, by key, for the cards' bylines. */
  authors: Record<string, Author>
  /** A tag or author page's heading. Without one this is the index, whose newest post is featured. */
  heading?: { title: string; description?: string }
}

/** A list of post cards: the index and its further pages, a tag's posts or an author's. */
export function PostListView({ posts, page, pages, authors, heading }: PostListViewProps) {
  const featureFirst = !heading && page === 1

  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-10 py-16">
      {heading ? (
        <header className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-balance font-semibold text-3xl tracking-tight md:text-4xl">
            {heading.title}
          </h1>
          {heading.description && (
            <p className="text-balance text-muted-foreground md:text-lg">{heading.description}</p>
          )}
        </header>
      ) : (
        <h1 className="sr-only">{page === 1 ? "Latest posts" : `Posts, page ${page}`}</h1>
      )}

      {posts.length === 0 ? (
        <Empty className="border">
          <EmptyHeader>
            <EmptyTitle>No posts yet.</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {posts.map((post, index) => {
            const featured = featureFirst && index === 0
            return (
              <li key={post.slug} className={featured ? "md:col-span-2" : undefined}>
                <PostCard {...postCardProps(post, authors, featured)} />
              </li>
            )
          })}
        </ul>
      )}

      {pages > 1 && (
        <Pagination aria-label="Pagination">
          <PaginationContent className="w-full justify-between">
            <PaginationItem>
              {page > 1 && (
                <PaginationLink size="default" href={pageHref(page - 1)} rel="prev">
                  Newer posts
                </PaginationLink>
              )}
            </PaginationItem>
            <PaginationItem>
              {page < pages && (
                <PaginationLink size="default" href={pageHref(page + 1)} rel="next">
                  Older posts
                </PaginationLink>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </main>
  )
}
