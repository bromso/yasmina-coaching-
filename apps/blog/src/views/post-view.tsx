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
import { BlogLink } from "@/components/blog-link"
import { CallToAction } from "@/components/call-to-action"
import { Cover } from "@/components/cover"
import type { BlogUi } from "@/content/ui"
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
  /** The words, in the post's language. */
  ui: BlogUi
  /** `""` for Swedish, `/en` for English. */
  prefix: string
  /** www's free intro-call form (`/#contact`), the closing call to action's target. */
  ctaHref: string
}

/** The MDX components of a post's body: the shared ones, with `www:/…` links resolved. */
const bodyComponents = { ...mdxComponents, a: BlogLink }

/**
 * One post: its cover in a rounded frame, the header with a serif title, the body at a reading
 * width, the closing call to action, newer/older links, related posts and its BlogPosting
 * JSON-LD. A post with headings gets a table of contents beside the body on large screens; one
 * without is a single column with no aside at all.
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
  ui,
  prefix,
  ctaHref,
}: PostViewProps) {
  const hasToc = toc.length > 0
  const { newer, older } = neighbours

  return (
    <main id="main" className="container flex max-w-5xl flex-col gap-12 py-12 md:py-16">
      <script
        type="application/ld+json"
        // Safe: blogPostingJsonLd escapes every "<", so no string in the post can close the tag.
        dangerouslySetInnerHTML={{ __html: blogPostingJsonLd(post, author, url) }}
      />
      {post.cover && <Cover src={post.cover.src} alt={post.cover.alt} />}
      <div className={cn(hasToc && "lg:grid lg:grid-cols-[minmax(0,1fr)_14rem] lg:gap-12")}>
        <article className="flex min-w-0 max-w-[68ch] flex-col gap-10">
          <PostHeader
            title={post.title}
            description={post.description}
            date={post.date}
            updated={post.updated}
            readingMinutes={post.readingMinutes}
            readingTime={ui.post.readingTime(post.readingMinutes)}
            updatedLabel={ui.post.updated}
            dateLocale={ui.dateLocale}
            author={{
              name: author.name,
              avatar: author.avatar,
              href: `${prefix}/authors/${post.author}`,
            }}
            tags={post.tags.map((tag) => ({ tag: ui.tag(tag), href: `${prefix}/tags/${tag}` }))}
            titleClassName="font-display font-normal text-4xl md:text-6xl"
          />
          {/* Layout only: mdxComponents styles each element; this spaces the blocks. */}
          <div className="flex flex-col gap-5 text-lg leading-relaxed [&_h2]:mt-4 [&_h2]:text-3xl">
            <Body components={bodyComponents} />
          </div>
        </article>
        {hasToc && (
          <aside className="hidden lg:block">
            <div className="sticky top-28">
              <TocActive>
                <Toc items={toc} label={ui.post.toc} navLabel={ui.post.toc} />
              </TocActive>
            </div>
          </aside>
        )}
      </div>

      <CallToAction ui={ui} href={ctaHref} />

      <PrevNext
        label={ui.post.prevNext}
        prev={newer && { href: newer.url, title: newer.title, label: ui.post.newer }}
        next={older && { href: older.url, title: older.title, label: ui.post.older }}
      />

      {related.length > 0 && (
        <section aria-labelledby="related-posts" className="flex flex-col gap-6">
          <h2 id="related-posts" className="text-3xl">
            {ui.post.related}
          </h2>
          <ul className="grid gap-6 md:grid-cols-3">
            {related.map((item) => (
              <li key={item.slug}>
                <PostCard {...postCardProps(item, authors, ui, prefix)} headingAs="h3" />
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
