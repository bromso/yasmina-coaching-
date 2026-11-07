import type { Post } from "@repo/content/posts"
import type { Author } from "@repo/content/schema"
import { blogPostingJsonLd } from "@repo/content/seo"
import { PostCard } from "@repo/ui/blocks/post-card"
import { PostHeader } from "@repo/ui/blocks/post-header"
import { PrevNext } from "@repo/ui/blocks/prev-next"
import { Toc, type TocItem } from "@repo/ui/blocks/toc"
import { TocActive } from "@repo/ui/blocks/toc-active"
import { mdxComponents } from "@repo/ui/components/mdx"
import { cn } from "@repo/ui/lib/utils"
import type { ComponentType } from "react"
import { postCardProps } from "./post-list-view"

export type PostViewProps = {
  post: Post
  author: Author
  /** The post's absolute address, for its JSON-LD. */
  url: string
  /** The compiled MDX body. */
  Body: ComponentType<{ components?: typeof mdxComponents }>
  toc: TocItem[]
  neighbours: { newer?: Post; older?: Post }
  related: Post[]
  /** Every author, by key, for the related cards' bylines. */
  authors: Record<string, Author>
}

/**
 * One post: header, body, newer/older links, related posts and its BlogPosting JSON-LD. A post
 * with headings gets a table of contents beside the body on large screens; one without is a single
 * column with no aside at all.
 */
export function PostView({
  post,
  author,
  url,
  Body,
  toc,
  neighbours,
  related,
  authors,
}: PostViewProps) {
  const hasToc = toc.length > 0
  const { newer, older } = neighbours

  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-12 py-16">
      <script
        type="application/ld+json"
        // Safe: blogPostingJsonLd escapes every "<", so no string in the post can close the tag.
        dangerouslySetInnerHTML={{ __html: blogPostingJsonLd(post, author, url) }}
      />
      <div className={cn(hasToc && "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12")}>
        <article className="flex min-w-0 max-w-3xl flex-col gap-10">
          <PostHeader
            title={post.title}
            description={post.description}
            date={post.date}
            updated={post.updated}
            readingMinutes={post.readingMinutes}
            author={{ name: author.name, avatar: author.avatar, href: `/authors/${post.author}` }}
            tags={post.tags.map((tag) => ({ tag, href: `/tags/${tag}` }))}
            cover={post.cover}
          />
          {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
          <div className="flex flex-col gap-5">
            <Body components={mdxComponents} />
          </div>
        </article>
        {hasToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-24">
              <TocActive>
                <Toc items={toc} />
              </TocActive>
            </div>
          </aside>
        )}
      </div>

      <PrevNext
        prev={newer && { href: newer.url, title: newer.title, label: "Newer" }}
        next={older && { href: older.url, title: older.title, label: "Older" }}
      />

      {related.length > 0 && (
        <section aria-labelledby="related-posts" className="flex flex-col gap-6">
          <h2 id="related-posts" className="font-semibold text-2xl tracking-tight">
            Related posts
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <PostCard {...postCardProps(item, authors)} headingAs="h3" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
