# @repo/content

Content helpers shared by `apps/blog` and `apps/docs`: pure TypeScript, no React, no Next and no
fumadocs — both apps pair this package with fumadocs-mdx themselves. Six subpaths, like
`@repo/telemetry`:

```ts
import { postFrontmatterSchema, docFrontmatterSchema, TAG_PATTERN, SLUG_PATTERN } from "@repo/content/schema"
import { createBlog, isPublished, DEFAULT_PAGE_SIZE, ContentError } from "@repo/content/posts"
import { rssFeed, atomFeed, jsonFeed } from "@repo/content/feeds"
import { checkLinks } from "@repo/content/links"
import { blogPostingJsonLd } from "@repo/content/seo"
import { extractLinks, extractImages, imageProblems, headingProblems } from "@repo/content/checks"
```

## `schema`

`postFrontmatterSchema` is a strict Zod object: `title`, `description`, `date` and `updated` (a
`Date` or a non-empty string that parses to a valid date — never `null`, never `""`, unlike plain
`z.coerce.date()`), `author`, `tags`, an optional `cover` (`{ src, alt }`, `alt` required with
it), `draft?` and `type` (defaults to `"Blog Post"`, kept for a later Open Knowledge Format
export). An unknown key refuses the document — this is the schema `apps/blog`'s `source.config.ts`
hands fumadocs-mdx, so a shape problem (a missing title, a bad date, a `cover` with no `alt`, an
unknown key) fails at MDX compile time, before any post reaches `createBlog` below.

`docFrontmatterSchema` is the docs app's equivalent, also strict: `title`, `description`,
`icon?`, `updated?` (the same date rule as above) and `tags?` (`TAG_PATTERN`), plus `type`
(defaults to `"Documentation"`, the same Open Knowledge Format readiness as the blog's `type`). A
docs page has no `date` or `author` — there is no publish schedule and no byline.

`TAG_PATTERN` / `SLUG_PATTERN` are the same lowercase-kebab-case pattern, named separately because
a tag and a slug are different concepts even though they share a shape today.

## `posts`

`createBlog(inputs, authors, options)` builds a `Blog` from already-parsed posts
(`PostInput[]`: `file`, `slug`, `frontmatter`, `text`, `links`) and an `authors` record. It
re-validates every post (bad frontmatter, a non-kebab-case slug or tag, a reserved slug —
`RESERVED_SLUGS`, the routes a blog serves at its root — an unknown author, a duplicate slug) and
collects every problem before throwing one `ContentError` — never stops at the first.

`options.mode` decides what counts as published (`isPublished(frontmatter, options)`, exported for
callers that must apply the same rule without a built `Blog`): `"production"` drops `draft: true` posts and any
post whose UTC calendar day is after `options.now`'s (a post dated the same day as `now` is
published); `"development"` keeps everything, so drafts and scheduled posts preview locally.

The returned `Blog` exposes `posts()` (newest first), `post(slug)`, `page(n, size = DEFAULT_PAGE_SIZE)` (12),
`tags()`, `byTag`, `authors()`, `byAuthor`, `author(key)`, `related(slug, limit = 3)` (most shared
tags, then newest, never the post itself) and `neighbours(slug)` (the newest post has no `newer`).

`readingMinutes(text)` is `ceil(words / 200)`, minimum 1.

## `feeds`

`rssFeed` / `atomFeed` / `jsonFeed` each take a `FeedSite` (`title`, `description`, `url` —
`siteUrl("blog")`) and `FeedEntry[]` (`post`, rendered `html`, `authorName`) and return full-content
feeds: RSS 2.0, Atom, and JSON Feed 1.1. Text is XML-escaped (`&amp; &lt; &gt; &quot; &apos;`); the
rendered HTML body goes in `<![CDATA[…]]>`, with any `]]>` inside it split across two CDATA
sections so it cannot close the wrapper early.

## `links`

`checkLinks(input, known)` takes each post's `links` and `known` — `paths` (every path the site
serves), `hosts` (every app's `host[:port]`) and `ownHost` (this site's) — and returns one
`<file>: <problem>` line per bad link, `[]` when every link is fine:

- **Internal links are root-relative only.** `/tags/x` is checked against `known.paths`
  (`broken link "<href>"` when absent); any other relative href (`a-post`, `./x`, `../tags/x`)
  cannot be resolved without the current page's own path and is refused outright
  (`must be root-relative (start with "/")`).
- **A path compares without its query string, fragment and one trailing slash**, so
  `/tags/x?y=1#z` and `/a-post/` match `/tags/x` and `/a-post` (`/` itself stays `/`).
- **`//host/path` is absolute**, checked exactly like `https://host/path` — never as a
  root-relative path.
- **Absolute links onto the site's own domain** (`ownHost` minus its first label: every
  `*.brand.com`) are checked: on `ownHost` itself the path must be in `known.paths`; on another
  subdomain the host must be in `known.hosts`, else `unknown app "<host>" in link "<href>"`. A link
  outside the domain (`https://example.org`) is never checked; an unparseable one is
  `invalid link "<href>"`.
- **Local development hosts are refused in a real build.** When `ownHost` is not itself
  `localhost` / `*.localhost`, a link to `localhost`, `*.localhost`, any loopback IPv4 address
  (`127.0.0.0/8`), `0.0.0.0` or `[::1]` is `points at a local development host`.
- `#anchor`, `mailto:` and `tel:` links are ignored, and so is any other scheme (`data:`, `ftp:`).

## `seo`

`blogPostingJsonLd(post, author, url)` returns `BlogPosting` JSON-LD as a plain JSON string, for a
`<script type="application/ld+json">` tag the caller renders.

## `checks`

Content checks shared by the blog and the docs app, extracted from a page's raw MDX source —
`extractLinks` and `extractImages` read the source directly rather than a compiled body, so they
work the same whether the caller is fumadocs or anything else:

- `extractLinks(source)` — every link target in document order: markdown links (inline and
  reference definitions) and `href` attributes, skipping fenced/inline code. Images are not
  links — see `extractImages` — so `![alt](src)` is blanked first.
- `extractImages(source)` — every image source in document order: inline markdown images and
  `src` attributes, skipping code.
- `imageProblems(file, images, exists)` — `<file>: image "<src>" not found in public/` for each
  root-relative `src` that `exists` (asked with the path's query/fragment dropped and
  `%`-escapes decoded) says is missing. Remote, protocol-relative and other schemes are left alone.
- `headingProblems(file, source, titleOwner?)` — `<file>: use "##" for headings — the
  <titleOwner> title is the page's h1` when the body (frontmatter stripped) has an ATX or setext
  h1; `[]` otherwise. `titleOwner` defaults to `"page"`; the blog passes `"post"`, keeping its
  original message.
