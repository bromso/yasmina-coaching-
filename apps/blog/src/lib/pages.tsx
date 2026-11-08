// The blog's pages, once for both languages. Each `page.tsx` / `opengraph-image.tsx` under
// `src/app/(sv)/` and `src/app/(en)/en/` is a few lines over one of these factories, plus the
// route segment config Next reads from the file itself (`dynamicParams`, `dynamic`). Loading the
// blog validates every post, so a bad post fails `next build` on every page.

import type { Post } from "@repo/content/posts"
import { siteUrl } from "@repo/sites"
import { OG_SIZE, ogImage } from "@repo/ui/lib/og"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { PageHeader } from "@/components/page-header"
import { type BlogLocale, otherLocale, prefixFor, UI } from "@/content/ui"
import { authorsFor, blog, postPage } from "@/lib/blog"
import { pageAlternates } from "@/lib/feed-types"
import { AuthorView } from "@/views/author-view"
import { PostListView } from "@/views/post-list-view"
import { PostView } from "@/views/post-view"
import { TagView } from "@/views/tag-view"

type Params<K extends string> = { params: Promise<Record<K, string>> }

const blogUrl = () => siteUrl("blog")

/** The other language's index: every list page's language link and hreflang counterpart. */
function otherIndex(locale: BlogLocale): string {
  return prefixFor(otherLocale(locale)) || "/"
}

/** A post's route param: its slug in Swedish, the part after `en-` in English. */
export function postParam(post: Post): string {
  return post.url.split("/").pop() ?? post.slug
}

/** The slug behind a route param in `locale`. */
export function slugFor(locale: BlogLocale, param: string): string {
  return prefixFor(locale) ? `${locale}-${param}` : param
}

/** The index (`/`, `/en`): the hero over the newest posts. */
export function indexRoute(locale: BlogLocale) {
  const ui = UI[locale]
  const prefix = prefixFor(locale)
  const metadata: Metadata = {
    alternates: pageAlternates(`${blogUrl()}${prefix || "/"}`, locale, {
      sv: `${blogUrl()}/`,
      en: `${blogUrl()}/en`,
    }),
  }
  function Page() {
    const own = blog.inLocale(locale)
    const { posts, page, pages } = own.page(1)
    return (
      <>
        <PageHeader locale={locale} />
        <PostListView
          posts={posts}
          page={page}
          pages={pages}
          authors={authorsFor(locale)}
          ui={ui}
          prefix={prefix}
        />
      </>
    )
  }
  return { metadata, Page }
}

/** The index's further pages, `<prefix>/page/<n>` for n >= 2. */
export function listPageRoute(locale: BlogLocale) {
  const ui = UI[locale]
  const prefix = prefixFor(locale)
  const own = () => blog.inLocale(locale)
  return {
    generateStaticParams(): { n: string }[] {
      const { pages } = own().page(1)
      return Array.from({ length: Math.max(0, pages - 1) }, (_, i) => ({ n: String(i + 2) }))
    },
    async generateMetadata({ params }: Params<"n">): Promise<Metadata> {
      const { n } = await params
      return {
        title: ui.list.page(Number(n)),
        alternates: pageAlternates(`${blogUrl()}${prefix}/page/${n}`, locale),
      }
    },
    async Page({ params }: Params<"n">) {
      const number = Number((await params).n)
      const { pages } = own().page(1)
      if (!Number.isInteger(number) || number < 2 || number > pages) notFound()
      const { posts, page } = own().page(number)
      return (
        <>
          <PageHeader locale={locale} />
          <PostListView
            posts={posts}
            page={page}
            pages={pages}
            authors={authorsFor(locale)}
            ui={ui}
            prefix={prefix}
          />
        </>
      )
    },
  }
}

/** One post, `/<slug>` or `/en/<rest>`; drafts and future posts are not found. */
export function postRoute(locale: BlogLocale) {
  const ui = UI[locale]
  const prefix = prefixFor(locale)
  function load(param: string) {
    const own = blog.inLocale(locale)
    const slug = slugFor(locale, param)
    const post = own.post(slug)
    const author = post && authorsFor(locale)[post.author]
    const page = post && postPage(slug)
    if (!post || !author || !page) notFound()
    return { own, post, author, page, url: `${blogUrl()}${post.url}` }
  }
  return {
    generateStaticParams(): { slug: string }[] {
      return blog
        .inLocale(locale)
        .posts()
        .map((post) => ({ slug: postParam(post) }))
    },
    async generateMetadata({ params }: Params<"slug">): Promise<Metadata> {
      const { own, post, author, url } = load((await params).slug)
      const translation = own.translation(post.slug)
      return {
        title: post.title,
        description: post.description,
        alternates: pageAlternates(
          url,
          locale,
          translation && {
            [locale]: url,
            [translation.locale]: `${blogUrl()}${translation.url}`,
          }
        ),
        openGraph: {
          type: "article",
          url,
          title: post.title,
          description: post.description,
          locale: ui.ogLocale,
          publishedTime: post.date.toISOString(),
          modifiedTime: (post.updated ?? post.date).toISOString(),
          tags: post.tags,
          authors: [author.name],
        },
      }
    },
    async Page({ params }: Params<"slug">) {
      const { own, post, author, page, url } = load((await params).slug)
      return (
        <>
          <PageHeader
            locale={locale}
            languageHref={own.translation(post.slug)?.url ?? otherIndex(locale)}
          />
          <PostView
            post={post}
            author={author}
            url={url}
            Body={page.data.body}
            toc={page.data.toc}
            neighbours={own.neighbours(post.slug)}
            related={own.related(post.slug, 3)}
            authors={authorsFor(locale)}
            ui={ui}
            prefix={prefix}
            bookHref={`${siteUrl("www")}/book`}
          />
        </>
      )
    },
  }
}

/** Every post of one language with a tag. */
export function tagRoute(locale: BlogLocale) {
  const ui = UI[locale]
  const prefix = prefixFor(locale)
  function load(tag: string) {
    const posts = blog.inLocale(locale).byTag(tag)
    if (posts.length === 0) notFound()
    return posts
  }
  return {
    generateStaticParams(): { tag: string }[] {
      return blog
        .inLocale(locale)
        .tags()
        .map(({ tag }) => ({ tag }))
    },
    async generateMetadata({ params }: Params<"tag">): Promise<Metadata> {
      const { tag } = await params
      load(tag)
      return {
        title: ui.list.tagTitle(tag),
        description: ui.list.tagDescription(tag),
        alternates: pageAlternates(`${blogUrl()}${prefix}/tags/${tag}`, locale),
      }
    },
    async Page({ params }: Params<"tag">) {
      const { tag } = await params
      return (
        <>
          <PageHeader locale={locale} />
          <TagView
            tag={tag}
            posts={load(tag)}
            authors={authorsFor(locale)}
            ui={ui}
            prefix={prefix}
          />
        </>
      )
    },
  }
}

/** Every post of one language by an author. */
export function authorRoute(locale: BlogLocale) {
  const ui = UI[locale]
  const prefix = prefixFor(locale)
  function load(key: string) {
    const author = authorsFor(locale)[key]
    const posts = blog.inLocale(locale).byAuthor(key)
    if (!author || posts.length === 0) notFound()
    return { author, posts }
  }
  return {
    generateStaticParams(): { author: string }[] {
      return blog
        .inLocale(locale)
        .authors()
        .map((author) => ({ author }))
    },
    async generateMetadata({ params }: Params<"author">): Promise<Metadata> {
      const { author: key } = await params
      const { author } = load(key)
      return {
        title: author.name,
        description: author.bio,
        alternates: pageAlternates(`${blogUrl()}${prefix}/authors/${key}`, locale),
      }
    },
    async Page({ params }: Params<"author">) {
      const { author: key } = await params
      const { author, posts } = load(key)
      return (
        <>
          <PageHeader locale={locale} />
          <AuthorView
            author={author}
            posts={posts}
            authors={authorsFor(locale)}
            ui={ui}
            prefix={prefix}
          />
        </>
      )
    },
  }
}

/** The index's OG/Twitter image: the blog's name and description in `locale`. */
export function indexImage(locale: BlogLocale) {
  const ui = UI[locale]
  return {
    size: OG_SIZE,
    contentType: "image/png",
    alt: ui.title,
    Image() {
      return ogImage({ title: ui.title, subtitle: ui.description })
    },
  }
}

/** A post's OG/Twitter image: its title over the blog's name. */
export function postImage(locale: BlogLocale) {
  const ui = UI[locale]
  return {
    size: OG_SIZE,
    contentType: "image/png",
    alt: ui.title,
    generateStaticParams(): { slug: string }[] {
      return blog
        .inLocale(locale)
        .posts()
        .map((post) => ({ slug: postParam(post) }))
    },
    async Image({ params }: Params<"slug">) {
      const post = blog.inLocale(locale).post(slugFor(locale, (await params).slug))
      if (!post) notFound()
      return ogImage({ title: post.title, subtitle: ui.title })
    },
  }
}
