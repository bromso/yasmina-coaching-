# Writing content

This guide covers the four MDX content apps: the blog (`apps/blog`), the docs (`apps/docs`), the
help center (`apps/help`) and the jobs board (`apps/jobs`). They share one engine (`@repo/content`)
and the same shape of build gate, with different frontmatter and routes for what each one is.

## Writing blog content

`apps/blog` is a fully static shell for MDX posts (`blog.brand.localhost:3009` in development,
`blog.<SITE_DOMAIN>` in production): every route is prerendered at build time, and the only
runtime calls it makes are the shared telemetry/analytics routes every app has. The engine is
`@repo/content` (pure validation, feeds and link checking — no React, no Next, no fumadocs) plus
fumadocs-mdx (the MDX compiler) and `@repo/ui/components/mdx` (the components a post's body can
use). The how and why — the pipeline, the routes, what each `@repo/content` subpath does — are in
CLAUDE.md's **Content.** paragraph; this guide is about writing a post.

### Writing a post

Add a file to `apps/blog/content/posts/`. Its file name, minus `.mdx`, becomes the slug and the
post's address: `my-first-post.mdx` is published at `/my-first-post`. The name must be lowercase
kebab-case (letters, digits and hyphens only), and the post must sit directly in that directory —
no subfolders. A few names are reserved because the blog already serves a route there: `page`,
`tags`, `authors`, `opengraph-image`, `twitter-image`, `rss`, `atom`, `feed`, `sitemap`, `robots`,
`manifest`, `api` and `files` — a post with one of them fails the build with
`slug "<x>" is reserved`.

Frontmatter is YAML between `---` lines at the top of the file:

```mdx
---
title: My first post
description: One sentence for listings, search results and feeds.
date: 2026-10-08
author: team
tags: [guides]
---

The body starts here, as regular MDX.
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Non-empty string. |
| `description` | yes | Non-empty string — the listing card, the feed summary, the OG/Twitter image. |
| `date` | yes | A date (`2026-10-08`) or a full timestamp. Never `null`, never an empty string. |
| `updated` | no | Same format as `date`. Drives "Updated" on the post header and `lastModified` in feeds and the sitemap. |
| `author` | yes | A key of `apps/blog/content/authors.ts` (see **Authors** below). |
| `tags` | no (default `[]`) | Lowercase kebab-case strings. |
| `cover` | no | `{ src: "/cover.png", alt: "…" }` — `alt` is required once `cover` is set. Make it 1200×630: `PostHeader` renders it at that size (and aspect ratio), and it doubles as the `BlogPosting` JSON-LD image. |
| `draft` | no | `true` keeps the post out of production builds (see **Drafts and scheduling**). |
| `type` | no (default `"Blog Post"`) | Reserved for a later Open Knowledge Format export; leave it unless you know you need it. |

An unknown frontmatter key fails the build — there is no silent typo.

### Authors

Every post's `author` must be a key of `apps/blog/content/authors.ts`:

```ts
export const authors: Record<string, Author> = {
  team: {
    name: `${BRAND_NAME} team`,
    bio: "The people building this product.",
    avatar: "/authors/team.svg",
  },
}
```

Add a new author there — `name`, `bio`, `avatar` (a path under `public/`), and optionally `links`
(`{ label, href }[]`) — before writing a post under their name. A post naming a key that isn't
there fails the build with `unknown author "<name>"`.

### Tags

`tags` is a plain array of lowercase kebab-case strings (`["guides", "release-notes"]`). A tag
with an uppercase letter, a space or an underscore fails the build. Tags drive `/tags/<tag>` and
the "most shared tags, then newest" related-posts list — there's nothing else to register.

### Drafts and scheduling

Set `draft: true` to keep a post out of production entirely while you write it — it previews
under `next dev` only; it never ships, and never appears in a feed or the sitemap. A draft's own
links are not checked either (see **What fails the build**), so it may link to another post that
isn't out yet.

A post dated in the future is excluded from a production build the same way, with no `draft` flag
needed: `date` is compared as a UTC calendar day, so a post dated today is already published (no
timezone surprise waits for midnight somewhere). "Today" is read from the clock of the process
building each page, so a build that runs across UTC midnight can, in principle, treat a post dated
the new day differently in two build workers — a known, accepted limitation; redeploy after
midnight if a post is scheduled for that exact day. Publishing a scheduled post later is exactly
**merge the PR and redeploy** — there's no separate "publish" step, cron job or flag to flip.

### Components

A post's body is MDX: Markdown, plus the components in `@repo/ui/components/mdx`, available
directly, no import needed.

**Headings.** `##` and below — never a body `# H1`, since the post's title is already the page's
one `<h1>` (`PostHeader` renders it). A body h1, ATX (`# Like this`) or setext (underlined with
`=`), fails the build. Every `##`/`###`/`####` gets a hover "#" anchor and feeds the table of
contents.

**Code blocks** — triple-backtick fences, highlighted with Shiki (github-light / github-dark) and
a copy button:

````mdx
```ts
export const greeting = "hello"
```
````

**Callouts** — `note` (default), `tip` or `warning`:

```mdx
<Callout type="tip" title="Optional title">
  The body can be any MDX, including `code` and [links](/tags/guides).
</Callout>
```

**Tabs** — a few equivalent snippets under one choice. Every panel shows without JavaScript too
(stacked, each under its own label), so nothing is hidden from a reader without scripts. Each
`<Tab value="…">` gets a trigger labelled with its `value`, and the first panel is selected at
first. `items` is optional: when given, it only orders the triggers (a name matching no `<Tab>` is
ignored, and a `<Tab>` it leaves out still gets a trigger, after the named ones):

```mdx
<Tabs items={["bun", "npm"]}>
<Tab value="bun">

```bash
bun add left-pad
```

</Tab>
<Tab value="npm">

```bash
npm install left-pad
```

</Tab>
</Tabs>
```

Leave a blank line on each side of a `<Tab>`'s fenced code (as above) — MDX parses block content
inside a JSX tag the same way it parses the rest of the document, and a missing blank line reads
the fence as part of the surrounding paragraph instead of its own block.

**Steps** — a numbered walkthrough:

```mdx
<Steps>
<Step>Install the package.</Step>
<Step>Import it.</Step>
<Step>Ship it.</Step>
</Steps>
```

**Links.** A link to anything on the blog itself must be root-relative: `[text](/tags/guides)`,
never `[text](tags/guides)` or `[text](../tags/guides)` — those can't be resolved without knowing
the current page's own path, so they fail the build (see **What fails the build** below). An
external link (`[text](https://example.com)`) is left alone; it is never checked.

### Images

Reference an image the same way as a link, root-relative:

```mdx
![A screenshot of the dashboard](/screenshots/dashboard.png)
```

The file must exist under `apps/blog/public/` at that exact path (`public/screenshots/dashboard.png`
for the example above) — a missing file fails the build rather than 404ing for a reader. Width and
height are measured from the file at build time and set explicitly, so there's no layout shift and
no `width`/`height` to write by hand. A **remote** image (`https://example.com/photo.jpg`) is
allowed too, but its dimensions are fetched over the network at build time to measure them — a slow
or unreachable host slows down (or fails) the whole build, so prefer a local file under `public/`
when you can.

A post's `cover.src` is checked the same way — root-relative, and present under `public/` — and
fails the build if it's missing.

### Feeds

Every published post appears, full content, in all three feeds — `/rss.xml` (RSS 2.0), `/atom.xml`
(Atom) and `/feed.json` (JSON Feed 1.1) — with nothing extra to do. A draft or a future-dated post
is excluded from feeds exactly like it's excluded from the site itself.

### What fails the build, and how to read the error

There are two separate failures, at two different points in the build.

**Frontmatter shape, from fumadocs-mdx.** `source.config.ts` hands fumadocs-mdx the same strict
schema `@repo/content/schema` exports (`postFrontmatterSchema`), and fumadocs validates every
post's frontmatter against it while **compiling** the MDX — before `next build` even gets to
"Collecting page data", and before any of the rest of this list runs. A missing or empty required
field, a bad `date`, a `cover` with no `alt`, or an unknown key fails here, one post at a time,
with fumadocs' own wording (Zod 4's), for example:

```
Error: [MDX] invalid frontmatter in …/apps/blog/content/posts/my-first-post.mdx:
- title: Invalid input: expected string, received undefined
```

A missing **local Markdown image** (`![alt](/missing.png)`) fails here too, for the same reason —
fumadocs' own `remarkImage` plugin measures it at compile time, before our own checks run:

```
Error: [Remark Image] Failed obtain image size for /missing.png (public directory configured as …/apps/blog/public)
```

**Everything else, from `@repo/content`.** Once every post compiles, `apps/blog/src/lib/blog.ts`
loads and validates all of them together, collecting *every* problem it finds — across every
post, every stage — into one thrown `ContentError`, rather than stopping at the first:

```
Content errors:
- apps/blog/content/posts/my-first-post.mdx: tag "Guides" must be lowercase kebab-case
- apps/blog/content/posts/second-post.mdx: unknown author "jamie"
```

Each line is `<file>: <problem>` — fix every line named, there's no need to re-run the build
between fixes to find the next one. The checks:

| Problem | What it looks like |
|---|---|
| Unknown author | `unknown author "<name>"` — add them to `content/authors.ts` first |
| Malformed tag | `tag "<tag>" must be lowercase kebab-case` |
| Non-kebab-case slug | `slug "<slug>" must be lowercase kebab-case` — rename the file |
| Reserved slug | `slug "<slug>" is reserved` — the blog serves a route there (see **Writing a post**); rename the file |
| Duplicate slug | `duplicate slug "<slug>" (also <other file>)` — two files would publish to the same address |
| Nested post | `posts must sit directly in content/posts/` — no subfolders |
| A body `# h1` | `use "##" for headings — the post title is the page's h1` |
| A non-root-relative relative link | `link "<href>" must be root-relative (start with "/")` — `./other-post` or `../tags/x` cannot be resolved without knowing the current page's path; write `/other-post` |
| A broken root-relative link | `broken link "<href>"` — the path doesn't match any route the blog serves (a post, tag, author, list page or feed) |
| A link naming an app this site doesn't know | `unknown app "<host>" in link "<href>"` — an absolute link onto `*.brand.<domain>` whose subdomain isn't one of the apps in `@repo/sites` |
| An unparseable link | `invalid link "<href>"` — the href isn't a valid URL at all |
| A link to localhost outside development | `link "<href>" points at a local development host` — a `localhost`, `*.localhost`, loopback (`127.x.x.x`, `[::1]`) or `0.0.0.0` link survived into a non-`.localhost` build |
| A missing JSX image or cover | `image "<src>" not found in public/` — an `<img src="…">` / `<MdxImage src="…">` (not a Markdown `![]()`, caught earlier by fumadocs above) or a frontmatter `cover.src` |

Every check above except the link rows (root-relative, broken, unknown app, invalid, local host)
and the image row runs on *every* post, drafts included — a draft with a malformed tag still fails
the build, so it never ships broken once you flip the flag. Links and those images are the
exception: only the posts that would actually publish (not a draft, not dated in the future) have
them checked — a draft may freely link to, or reference a JSX image or cover meant to ship
alongside, a post that isn't out yet. A missing **Markdown** image (`![]()`) still fails a draft:
fumadocs measures it while compiling every post, before the publish rule is ever applied. Because every stage runs
independently and merges into the one error, a bad tag on one post never hides a broken link on
another — fix every line the error names, in one pass.

### Replacing the starter post

The repo ships with one post, `apps/blog/content/posts/welcome.mdx` (author `team`), as a working
example of frontmatter, headings, a callout, a code block and tabs. Delete it (and its line in
`content/authors.ts` if you don't keep the `team` author) once you have real posts.

One thing *does* reference it by name: `apps/e2e/tests/blog.spec.ts` opens `/welcome`, clicks its
tags and tabs, and checks its text. Deleting or renaming `welcome.mdx` means updating that spec
too — either point it at a real post of yours, or keep one fixture post around for the journey to
exercise.

## Writing docs

`apps/docs` is a fully static shell for product documentation (`docs.brand.localhost:3004` in
development, `docs.<SITE_DOMAIN>` in production): every page, `/all` and the search index are
prerendered or exported at build time, and the only runtime calls it makes are the shared
telemetry and analytics routes every app has. It runs on the same `@repo/content` engine as the
blog, plus fumadocs-mdx and fumadocs-core (headless — no `fumadocs-ui`). The how and why are in
CLAUDE.md's **Content.** paragraph; this part is about writing a page.

### Frontmatter

```mdx
---
title: Getting started
description: One sentence for search results, /all and the page's meta description.
icon: rocket
updated: 2026-10-08
tags: [setup, bun]
---

The body starts here, as regular MDX.
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Non-empty string. |
| `description` | yes | Non-empty string — search results, the `/all` listing, the line under the page title, and the meta / Open Graph / Twitter description text. Not the sidebar, and not the OG image (that renders the title and "Docs"). |
| `icon` | no | An icon name; not yet rendered anywhere, reserved for a future sidebar icon. |
| `updated` | no | A date (`2026-10-08`) or a full timestamp. Drives "Last updated" on the page and `lastModified` in the sitemap. There is no `date` field — a docs page has no publish schedule. |
| `tags` | no (default `[]`) | Lowercase kebab-case strings. Not yet surfaced anywhere in the UI; reserved. |
| `type` | no (default `"Documentation"`) | Reserved for a later Open Knowledge Format export; leave it unless you know you need it. |

The schema is strict (`docFrontmatterSchema` in `@repo/content/schema`) — an unknown key fails the
build, same as the blog. There is no `author` either.

### Folders and `index.mdx`

Every page is a file under `apps/docs/content/docs/`. A folder groups pages under one sidebar
entry: `content/docs/guides/deploying.mdx` is published at `/guides/deploying`, and
`content/docs/guides/index.mdx` (optional) becomes the folder's own landing page at `/guides`,
linked from its sidebar entry. `content/docs/index.mdx` is the site's own landing page, at `/`.

### `meta.json`

A `meta.json` next to a set of pages orders them in the sidebar (and, by extension, in `/all` and
the previous/next links) — without one, fumadocs falls back to alphabetical order. Its `pages`
array takes a mix of tokens, parsed by fumadocs itself:

```json
{
  "pages": [
    "index",
    "---Start here---",
    "getting-started",
    "architecture",
    "---Guides---",
    "authentication",
    "deploying",
    "..."
  ]
}
```

- A plain name (`"getting-started"`) is a page (`getting-started.mdx`) or a subfolder in the same
  directory.
- `"---Name---"` (optionally `"---[icon]Name---"`) is a separator: a section heading in the
  sidebar, not a page.
- `"..."` is "every remaining page not already listed, in their own order"; `"z...a"` is the same,
  reversed. Leave one of these at the end of a `meta.json` unless you genuinely want to name every
  page by hand — a new page with no `meta.json` entry still appears, after everything you did list.
- `"[Text](url)"` is a plain sidebar link, not a page — a URL, not a file; `"external:[Text](url)"`
  marks it external, and a leading `"[icon]"` (`"[icon][Text](url)"`) gives it an icon, same as a
  separator's.
- `"!name"` hides that entry from the rest token (`...` / `z...a`) without removing the file —
  useful for a page you want reachable by direct link but not listed.
- `"...name"` inlines a subfolder's own children directly into this list, instead of nesting them
  under the subfolder's entry. It must name a folder: fumadocs ignores `"...page"`, so the build
  reports `<file>: "...<name>" must name a folder`.

A name that matches neither a page nor a folder in that `meta.json`'s own directory fails the
build: `<file>: "<name>" in pages matches no page or folder` — a typo here is caught, not
silently dropped from the sidebar. The separator is matched with fumadocs' own pattern, so
`"---a---b"` is a separator named `a` and `"------"` is not a separator at all (it is looked up as
a page and reported). Only `meta.json` is checked: a `meta.yaml` or `meta.yml` anywhere under
`content/docs` fails the build with `<file>: use meta.json (meta.yaml is not checked)`.

### Cards

The index pages (and any page that wants a grid of links) can use `Cards` / `Card`, from the same
MDX component map as the blog's `Callout` / `Tabs` / `Steps`:

```mdx
<Cards>
  <Card title="Getting started" href="/getting-started">
    Install, run every app, and the commands you will use daily.
  </Card>
  <Card title="Architecture" href="/architecture">
    The apps and packages, and the one-way layers frontend code follows.
  </Card>
</Cards>
```

Headings, code blocks, callouts, tabs and steps all work exactly as they do in a blog post — see
**Components** above; a docs page is MDX over the same component map, just without `cover` or
`author`.

### Search and the `/all` fallback

`/api/search` is the search index, exported once at build (`force-static`) from fumadocs-core's
bundled zbsearch engine — no `@orama/*` package is installed. The ⌘K / Ctrl K dialog downloads it
on the first query and searches entirely in the browser from then on, same-origin, so it needs no
CSP change. There is nothing to configure: every page's title, headings and body
text are indexed automatically.

Without JavaScript the search control is a plain link to `/all`, a page listing every doc in
sidebar order with its description — the fallback a reader without scripts, a crawler or a screen
reader in a hurry actually gets. Keep descriptions short and real: they are the only thing `/all`
shows next to a title.

### What fails the build

Two separate failures, at two different points, same shape as the blog's:

**Frontmatter shape, from fumadocs.** `source.config.ts` hands fumadocs-mdx the strict
`docFrontmatterSchema`, checked while **compiling** each page, before any of the checks below run:
a missing or empty required field, a bad `updated`, or an unknown key fails here, one page at a
time, in fumadocs' own wording.

**Everything else, from `assembleDocs`.** Collected into one thrown `ContentError`, every problem
at once:

| Problem | What it looks like |
|---|---|
| A `meta.yaml` / `meta.yml` | `<file>: use meta.json (meta.yaml is not checked)` |
| A `meta.json` entry matching nothing | `<file>: "<name>" in pages matches no page or folder` |
| A `...name` that is not a folder | `<file>: "...<name>" must name a folder` |
| A page under a reserved name | `<file>: "<name>" is reserved (it would be shadowed by a built-in route)` — a top-level `all.mdx`, or any page under a top-level `api/` folder; `og`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml` and `robots.txt` are reserved the same way |
| A body `# h1` | `use "##" for headings — the page title is the page's h1` |
| A non-root-relative link | `link "<href>" must be root-relative (start with "/")` |
| A broken root-relative link | `broken link "<href>"` — matches no page, `/all` or `/api/search` |
| A link to a local development host | `link "<href>" points at a local development host` |
| A missing image | `image "<src>" not found in public/` |

Every line is `<file>: <problem>`; fix every line named in one pass, same as the blog.

### `CONTENT_REPO_URL`

Set at build time (it is read while the static pages are generated, so a new value needs a
rebuild, not just a new runtime variable) to show "Edit on GitHub" at the foot of every page:

```
CONTENT_REPO_URL=https://github.com/<owner>/<repo>/blob/main/apps/docs/content/docs
```

Unset (the default), no link appears. The page's file path relative to `content/docs` is appended
to the base you give, so the link always lands on that exact file.

### Replacing the starter pages

The repo ships with six starter pages under `apps/docs/content/docs/` (`index`, `getting-started`,
`architecture`, `authentication`, `deploying`, `adding-an-app`) as a working example of frontmatter,
`meta.json` sections, cards, headings and internal links. Replace them with your own documentation
whenever you're ready — delete the ones you don't need, add new files and keep `meta.json` in
sync.

`apps/e2e/tests/docs.spec.ts` references the starter content by name — the "Getting started" and
"Architecture" pages, the "Workspaces" heading on "Authentication", and the sidebar order from
`meta.json`. Deleting or renaming the starter pages means updating that spec too, the same
trade-off as the blog's `welcome.mdx`.

## Writing help content

`apps/help` is the third `@repo/content` app: a fully static shell for help-center articles
(`help.brand.localhost:3005` in development, `help.<SITE_DOMAIN>` in production) — every page,
`/all` and the search index are prerendered or exported at build time; `/contact` is static too,
and its server action (the contact form; see CLAUDE.md's **Support.** paragraph for it and the api
side) is the only runtime call. It runs on the same engine as the blog and docs, plus
fumadocs-mdx. The how and why are in CLAUDE.md's **Support.** paragraph; this part is about
writing an article.

### Frontmatter

```mdx
---
title: Turn on two-step verification
description: Add an authenticator app to your sign-in, and keep your recovery codes safe.
tags: [security, account]
popular: true
---

The body starts here, as regular MDX.
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Non-empty string. |
| `description` | yes | Non-empty string — the article card's byline, the category page's card, search results and the meta description. |
| `updated` | no | A date (`2026-10-08`) or a full timestamp. Drives "Last updated" on the article. There is no `date` field — like a docs page, an article has no publish schedule. |
| `tags` | no (default `[]`) | Lowercase kebab-case strings. Drive "Related articles" (shared tags, the same category first, then others, ties broken by title) — nothing else to register. |
| `popular` | no | `true` lists the article on the home page's "Popular articles". |
| `type` | no (default `"Help Article"`) | Reserved for a later Open Knowledge Format export; leave it unless you know you need it. |

The schema is strict (`helpFrontmatterSchema` in `@repo/content/schema`) — an unknown key fails
the build. There is no `author` either.

### Folders

An article sits exactly two levels deep: `apps/help/content/articles/<category>/<article>.mdx`. A
category is just a folder — a top-level article (one level) or a sub-folder under a category (three
levels or more) fails the build: `<file>: help articles must sit in content/articles/<category>/<article>`.

### `meta.json`

Narrower than the docs dialect ("`meta.json`" under **Writing docs** above): help has no sidebar
tree, so `pages` takes
only plain slugs — no separators, no `...`/`z...a`, no `[Text](url)` link entries, no `!name` or
`...name`. The root `meta.json` orders categories; a category's own `meta.json` orders its
articles and also carries its `title` (optional — a missing one is the slug title-cased, "two-step-verification"
→ "Two step verification") and `description` (**required** — the one line under the category
heading and on its card from the home page; a category without one fails the build naming the
real file, even a category with no `meta.json` of its own at all:
`<file>: missing "description"`, `<file>` being the conventional `content/articles/<category>/meta.json`
path). A name in `pages` matching neither a category (the root) nor an article (a category's own)
fails the build: `<file>: "<name>" in pages matches no category or article`. A name `pages` leaves
out still appears, after everything listed, in alphabetical order. Only `meta.json` is checked —
`meta.yaml` / `meta.yml` anywhere under `content/articles` fails the build
(`<file>: use meta.json (meta.yaml is not checked)`), same as the other two apps.

```json
{
  "title": "Account & security",
  "description": "Passwords, two-step verification and your data.",
  "pages": ["turn-on-two-step-verification", "export-or-delete-your-data"]
}
```

### What fails the build

Two separate failures, at two different points, same shape as the blog's and the docs':

**Frontmatter shape, from fumadocs.** `source.config.ts` hands fumadocs-mdx the strict
`helpFrontmatterSchema`, checked while **compiling** each article, before any of the checks below
run.

**Everything else, from `assembleHelp`.** Collected into one thrown `ContentError`, every problem
at once:

| Problem | What it looks like |
|---|---|
| A `meta.yaml` / `meta.yml` | `<file>: use meta.json (meta.yaml is not checked)` |
| A `meta.json` entry matching nothing | `<file>: "<name>" in pages matches no category or article` |
| An article not two levels deep | `<file>: help articles must sit in content/articles/<category>/<article>` |
| A category under a reserved name | `<file>: "<name>" is reserved (it would be shadowed by a built-in route)` — `all`, `contact`, `og`, `api`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml` and `robots.txt` |
| A category with no `description` | `<file>: missing "description"` |
| A body `# h1` | `use "##" for headings — the article title is the page's h1` |
| A non-root-relative link | `link "<href>" must be root-relative (start with "/")` |
| A broken root-relative link | `broken link "<href>"` — matches no category, article, `/all`, `/api/search` or `/contact` |
| A link to a local development host | `link "<href>" points at a local development host` |
| A missing image | `image "<src>" not found in public/` |

Every line is `<file>: <problem>`; fix every line named in one pass, same as the other two apps.

### Search

`/api/search` is the same fumadocs-core static index `apps/docs` exports, searched entirely in the
browser once downloaded. `apps/help/src/components/search.tsx` passes `@repo/ui/blocks/docs-search`
its own `labels` prop ("Search help", not "Search docs", and every other string it shows) rather
than forking the block — a help-specific caller renames the copy, the block itself stays
unchanged. Without JavaScript the search control is a link to `/all`, exactly as in `apps/docs`.

### Contact

Every article's footer links to `/contact?from=<the article's own path>`; the hidden `page` field
reads it once hydrated. See CLAUDE.md's **Support.** paragraph for the form, the rate limits and
what the api does with a submission.

### Replacing the starter articles

The repo ships with four categories under `apps/help/content/articles/` (`getting-started`,
`account-security`, `workspaces-billing`, `troubleshooting`), each with one or two articles, as a
working example of frontmatter, a category's `meta.json` with its `description`, popular articles
and tags driving related articles. Replace them with your own content whenever you're ready —
delete the ones you don't need, add new files and keep every `meta.json` in sync, description
included.

## Writing jobs content

`apps/jobs` is the fourth `@repo/content` app: a fully static shell for job postings
(`jobs.brand.localhost:3006` in development, `jobs.<SITE_DOMAIN>` in production) — every page is
prerendered at build time; the apply form's server action (see CLAUDE.md's **Hiring.** paragraph
for it and the api side) is the only runtime call, and only for an open posting — `/<slug>/apply`
is never built for a closed one. It runs on the same engine as the blog, docs and help, plus
fumadocs-mdx.

### Frontmatter

```mdx
---
title: Senior Full-stack Engineer
description: Build and ship features end to end, from the database to the UI a customer touches.
team: Engineering
location: Remote (US)
employment: full-time
posted: "2026-09-15"
salary: "$140,000–$170,000 USD"
---

The body starts here, as regular MDX.
```

| Field | Required | Notes |
|---|---|---|
| `title` | yes | Non-empty string. |
| `description` | yes | Non-empty string — the posting's card byline, the posting page and the `JobPosting` JSON-LD. |
| `team` | yes | Free text. Drives the home page's team grouping (alphabetical by team name) and its anchor links. |
| `location` | yes | Free text, shown on the posting and its card. |
| `employment` | yes | One of `full-time`, `part-time`, `contract` (`EMPLOYMENT_LABEL` gives each its display label). |
| `posted` | yes | A date (`2026-09-15`) or a full timestamp, normalised to a UTC `YYYY-MM-DD` string — compared with plain string `>=` against `closes`, so both must take this one canonical form. |
| `closes` | no | Same date form as `posted`. Before `posted` fails the build. Once this date has passed the posting is treated as closed, the same as `status: closed`. |
| `status` | no (default `"open"`) | `open` or `closed`. A posting is open only when `status` is `open` *and* (`closes` unset, or not yet passed). |
| `salary` | no | Free text, shown on the posting when set. |
| `kind` | no (default `"Job Posting"`) | Reserved for a later Open Knowledge Format export — note the field is named `kind` here, not `type` as the blog, docs and help use. |

The schema is strict (`jobFrontmatterSchema` in `@repo/content/schema`) — an unknown key fails the
build. There is no `author`, `tags` or `updated` field.

### Folders

A posting sits exactly one level deep: `apps/jobs/content/jobs/<slug>.mdx`. A posting in a
subfolder fails the build: `<file>: job postings must sit directly in content/jobs/`. There is no
`meta.json` — postings are grouped by their own `team` field, not by folder order, and the home
page sorts teams alphabetically.

### What fails the build

Two separate failures, at two different points, same shape as the other three apps:

**Frontmatter shape, from fumadocs.** `source.config.ts` hands fumadocs-mdx the strict
`jobFrontmatterSchema`, checked while **compiling** each posting, before any of the checks below
run.

**Everything else, from `assembleJobs`.** Collected into one thrown `ContentError`, every problem
at once:

| Problem | What it looks like |
|---|---|
| A posting not one level deep | `<file>: job postings must sit directly in content/jobs/` |
| A posting under a reserved name | `<file>: "<slug>" is reserved (it would be shadowed by a built-in route)` — `apply`, `og`, `api`, `opengraph-image`, `twitter-image`, `manifest.webmanifest`, `sitemap.xml` and `robots.txt` |
| `closes` before `posted` | `<file>: "closes" (<date>) is before "posted" (<date>)` |
| A body `# h1` | `use "##" for headings — the posting title is the page's h1` |
| A non-root-relative link | `link "<href>" must be root-relative (start with "/")` |
| A broken root-relative link | `broken link "<href>"` — matches no posting or the home page, and matches a posting's own `/apply` only while that posting is open |
| A link to a local development host | `link "<href>" points at a local development host` |
| A missing image | `image "<src>" not found in public/` |

Every line is `<file>: <problem>`; fix every line named in one pass, same as the other three apps.

### Replacing the starter postings

The repo ships with three postings under `apps/jobs/content/jobs/` (`senior-fullstack-engineer`,
`product-designer`, `customer-support-specialist`) across two teams, as a working example of
frontmatter and the home page's team grouping. Replace them with your own roles whenever you're
ready — delete the ones you don't need and add new files; there is no `meta.json` to keep in sync.

`apps/e2e/tests/help.spec.ts` references the starter content by name — the "Getting started"
category, its "Create an account" article, and the "Turn on two-step verification" article found
by search. Deleting or renaming them means updating that spec too, the same trade-off as the
blog's `welcome.mdx` and the docs' starter pages.
