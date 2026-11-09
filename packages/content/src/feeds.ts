import type { Post } from "./posts"

export interface FeedSite {
  title: string
  description: string
  /** `siteUrl("blog")` */
  url: string
  /**
   * Where this feed's home page and its feed files sit under `url`, for a blog with one feed per
   * language: `"/en"` serves `/en/rss.xml` and links home to `/en`. Defaults to the root.
   */
  path?: string
  /** The feed's language (`"sv"`, `"en"`): RSS `<language>`, Atom `xml:lang`, JSON `language`. */
  language?: string
  /** The feed-level updated time of an empty feed; ignored once there is at least one entry. */
  updated?: Date
}

export interface FeedEntry {
  post: Post
  html: string
  authorName: string
}

/** C0 control characters other than tab, LF and CR are invalid in XML text, so they are dropped. */
function stripControlCharacters(text: string): string {
  let result = ""
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0
    const isDisallowedControl = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d
    if (!isDisallowedControl) result += char
  }
  return result
}

function escapeXml(text: string): string {
  return stripControlCharacters(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;")
}

/** `]]>` cannot appear inside a CDATA section, so it is split across two of them. */
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`
}

/** Joins a base URL and a path without doubling the slash when `base` already ends in one. */
function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, "")}${path.startsWith("/") ? path : `/${path}`}`
}

function link(site: FeedSite, post: Post): string {
  return joinUrl(site.url, post.url)
}

/** The feed's own home page: `url` itself, or `url` + `path`. */
function home(site: FeedSite): string {
  return site.path ? joinUrl(site.url, site.path) : site.url
}

/** One of the feed files, under `path`. */
function feedFile(site: FeedSite, file: string): string {
  return joinUrl(site.url, `${site.path ?? ""}${file}`)
}

export function rssFeed(site: FeedSite, entries: FeedEntry[]): string {
  const selfHref = feedFile(site, "/rss.xml")

  const items = entries
    .map(({ post, html }) => {
      const href = link(site, post)
      return [
        "    <item>",
        `      <title>${escapeXml(post.title)}</title>`,
        `      <link>${escapeXml(href)}</link>`,
        `      <guid isPermaLink="true">${escapeXml(href)}</guid>`,
        `      <pubDate>${post.date.toUTCString()}</pubDate>`,
        `      <description>${escapeXml(post.description)}</description>`,
        `      <content:encoded>${cdata(html)}</content:encoded>`,
        "    </item>",
      ].join("\n")
    })
    .join("\n")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">',
    "  <channel>",
    `    <title>${escapeXml(site.title)}</title>`,
    `    <link>${escapeXml(home(site))}</link>`,
    `    <atom:link href="${escapeXml(selfHref)}" rel="self" type="application/rss+xml"/>`,
    `    <description>${escapeXml(site.description)}</description>`,
    site.language ? `    <language>${escapeXml(site.language)}</language>` : "",
    items,
    "  </channel>",
    "</rss>",
  ]
    .filter(Boolean)
    .join("\n")
}

export function atomFeed(site: FeedSite, entries: FeedEntry[]): string {
  const updated = entries.reduce<Date>((latest, { post }) => {
    const candidate = post.updated ?? post.date
    return candidate.getTime() > latest.getTime() ? candidate : latest
  }, site.updated ?? new Date(0))
  const selfHref = feedFile(site, "/atom.xml")

  const items = entries
    .map(({ post, html, authorName }) => {
      const href = link(site, post)
      const updatedAt = post.updated ?? post.date
      return [
        "  <entry>",
        `    <id>${escapeXml(href)}</id>`,
        `    <title>${escapeXml(post.title)}</title>`,
        `    <link href="${escapeXml(href)}"/>`,
        `    <published>${post.date.toISOString()}</published>`,
        `    <updated>${updatedAt.toISOString()}</updated>`,
        "    <author>",
        `      <name>${escapeXml(authorName)}</name>`,
        "    </author>",
        `    <summary>${escapeXml(post.description)}</summary>`,
        `    <content type="html">${cdata(html)}</content>`,
        "  </entry>",
      ].join("\n")
    })
    .join("\n")

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    site.language
      ? `<feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${escapeXml(site.language)}">`
      : '<feed xmlns="http://www.w3.org/2005/Atom">',
    `  <id>${escapeXml(home(site))}</id>`,
    `  <title>${escapeXml(site.title)}</title>`,
    `  <updated>${updated.toISOString()}</updated>`,
    `  <link rel="alternate" type="text/html" href="${escapeXml(home(site))}"/>`,
    `  <link rel="self" type="application/atom+xml" href="${escapeXml(selfHref)}"/>`,
    items,
    "</feed>",
  ]
    .filter(Boolean)
    .join("\n")
}

export function jsonFeed(site: FeedSite, entries: FeedEntry[]): string {
  return JSON.stringify(
    {
      version: "https://jsonfeed.org/version/1.1",
      title: site.title,
      description: site.description,
      home_page_url: home(site),
      feed_url: feedFile(site, "/feed.json"),
      ...(site.language ? { language: site.language } : {}),
      items: entries.map(({ post, html, authorName }) => ({
        id: link(site, post),
        url: link(site, post),
        title: post.title,
        summary: post.description,
        content_html: html,
        date_published: post.date.toISOString(),
        date_modified: (post.updated ?? post.date).toISOString(),
        author: { name: authorName },
        authors: [{ name: authorName }],
        tags: post.tags,
      })),
    },
    null,
    2
  )
}
