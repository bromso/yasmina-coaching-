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
import { cn } from "@repo/ui/lib/utils"
import { CoverImage } from "@/components/cover"
import type { BlogUi } from "@/content/ui"

/** The address of list page `n` under `prefix` (`""` or `/en`): page 1 is the index. */
export function pageHref(n: number, prefix = ""): string {
  return n <= 1 ? prefix || "/" : `${prefix}/page/${n}`
}

/** A post as a `PostCard`: linked to its address, its tags and its author, in `ui`'s words. */
export function postCardProps(
  post: Post,
  authors: Record<string, Author>,
  ui: BlogUi,
  prefix: string,
  featured = false
): PostCardProps {
  const author = authors[post.author]
  return {
    href: post.url,
    title: post.title,
    description: post.description,
    date: post.date,
    readingMinutes: post.readingMinutes,
    readingTime: ui.post.readingTime(post.readingMinutes),
    dateLocale: ui.dateLocale,
    featuredLabel: ui.post.featured,
    author: author?.avatar
      ? { name: author.name, avatar: author.avatar }
      : { name: author?.name ?? post.author },
    tags: post.tags.map((tag) => ({ tag: ui.tag(tag), href: `${prefix}/tags/${tag}` })),
    featured,
    // www's cards: the photo across the top, rounded corners; the featured one larger and on the
    // warm sun-soft ground instead of the shared tint.
    className: cn(
      "overflow-hidden rounded-3xl",
      featured && "border-transparent bg-sun-soft hover:border-foreground/20"
    ),
    titleClassName: cn(
      "font-display font-normal leading-tight",
      featured ? "text-3xl md:text-4xl" : "text-2xl"
    ),
    media: post.cover && <CoverImage src={post.cover.src} alt={post.cover.alt} />,
    mediaClassName: featured ? "aspect-[3/2] md:aspect-[2/1]" : "aspect-[3/2]",
  }
}

export type PostListViewProps = {
  posts: Post[]
  page: number
  pages: number
  /** Every author, by key, for the cards' bylines. */
  authors: Record<string, Author>
  /** The words, in the page's language. */
  ui: BlogUi
  /** `""` for Swedish, `/en` for English. */
  prefix: string
  /** A tag or author page's heading. Without one this is the index, whose newest post is featured. */
  heading?: { title: string; description?: string }
}

/** A list of post cards: the index and its further pages, a tag's posts or an author's. */
export function PostListView({
  posts,
  page,
  pages,
  authors,
  ui,
  prefix,
  heading,
}: PostListViewProps) {
  const isIndex = !heading && page === 1

  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-10 py-12 md:py-16">
      {heading ? (
        <header className="flex max-w-2xl flex-col gap-3">
          <h1 className="text-balance text-4xl md:text-5xl">{heading.title}</h1>
          {heading.description && (
            <p className="text-balance text-muted-foreground md:text-lg">{heading.description}</p>
          )}
        </header>
      ) : isIndex ? (
        <header className="flex flex-col gap-4 rounded-4xl bg-sun px-5 py-10 sm:px-8 sm:py-12 md:px-12 md:py-16">
          <p className="text-sm tracking-[0.035em]">{ui.hero.eyebrow}</p>
          <h1 className="max-w-3xl text-balance break-words text-4xl sm:text-6xl md:text-7xl">
            {ui.hero.title}
          </h1>
          <p className="max-w-2xl text-balance text-lg md:text-xl">{ui.hero.lead}</p>
        </header>
      ) : (
        <h1 className="sr-only">{ui.list.page(page)}</h1>
      )}

      {posts.length === 0 ? (
        <Empty className="rounded-3xl border">
          <EmptyHeader>
            <EmptyTitle>{ui.list.empty}</EmptyTitle>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-6 md:grid-cols-2">
          {posts.map((post, index) => {
            const featured = isIndex && index === 0
            return (
              <li key={post.slug} className={featured ? "md:col-span-2" : undefined}>
                <PostCard {...postCardProps(post, authors, ui, prefix, featured)} />
              </li>
            )
          })}
        </ul>
      )}

      {pages > 1 && (
        <Pagination aria-label={ui.list.pagination}>
          <PaginationContent className="w-full justify-between">
            <PaginationItem>
              {page > 1 && (
                <PaginationLink size="default" href={pageHref(page - 1, prefix)} rel="prev">
                  {ui.list.newer}
                </PaginationLink>
              )}
            </PaginationItem>
            <PaginationItem>
              {page < pages && (
                <PaginationLink size="default" href={pageHref(page + 1, prefix)} rel="next">
                  {ui.list.older}
                </PaginationLink>
              )}
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      )}
    </main>
  )
}
