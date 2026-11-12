"use client"

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { Badge } from "@repo/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
} from "@repo/ui/components/card"
import { useImageFallback } from "@repo/ui/components/image-fallback"
import { initialsOf } from "@repo/ui/lib/initials"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"
import { cn } from "@repo/ui/lib/utils"
import type { ReactNode } from "react"

export type PostCardTag = { tag: string; href: string }

export type PostCardProps = {
  href: string
  title: string
  description: string
  date: Date
  readingMinutes: number
  /** Without an `avatar`, the author's initials. */
  author: { name: string; avatar?: string }
  tags: PostCardTag[]
  featured?: boolean
  /** The title's heading level: `h2` in a list (the default), `h3` under a section's own `h2`. */
  headingAs?: "h2" | "h3"
  /** The featured badge's text. Defaults to "Featured". */
  featuredLabel?: string
  /** The reading-time text, already worded. Defaults to "<n> min read". */
  readingTime?: string
  /** The date's `Intl` locale. Defaults to en-US. */
  dateLocale?: string
  /** Merged onto the card. */
  className?: string
  /** Merged onto the title. */
  titleClassName?: string
  /** An image (or any media) across the top of the card, edge to edge, its top corners following
   * the card's. Without it the card is text only. */
  media?: ReactNode
  /** Merged onto the media's frame (its aspect ratio, say). */
  mediaClassName?: string
}

/** Every card's look, `PostCard`'s and `PageCard`'s: the hover border, and `relative` so the
 * title's stretched link covers the whole card. */
const cardClassName = "relative transition-colors hover:border-foreground/20"

/** The title: a heading holding the stretched link. The anchor's `after:inset-0` positions
 * relative to the `relative` Card (the anchor itself stays static), so the whole card is
 * clickable while staying valid HTML — no nested <a>. Anything else linked in a card escapes
 * above this overlay with `relative z-10`. */
function CardTitleLink({
  as: Title,
  href,
  className,
  children,
}: {
  as: "h2" | "h3"
  href: string
  className?: string
  children: ReactNode
}) {
  return (
    <Title data-slot="card-title" className={cn("font-semibold text-xl leading-none", className)}>
      <a href={href} className="after:absolute after:inset-0 hover:underline">
        {children}
      </a>
    </Title>
  )
}

/** A list-page teaser: title (linked), description, tags, author and reading time. */
export function PostCard({
  href,
  title,
  description,
  date,
  readingMinutes,
  author,
  tags,
  featured,
  headingAs = "h2",
  featuredLabel = "Featured",
  readingTime,
  dateLocale,
  className,
  titleClassName,
  media,
  mediaClassName,
}: PostCardProps) {
  const avatar = useImageFallback(author.avatar)
  const showAvatar = Boolean(author.avatar) && !avatar.failed

  return (
    <Card
      data-slot="post-card"
      data-featured={featured ? "" : undefined}
      className={cn(cardClassName, featured && "border-primary/40 bg-primary/5", className)}
    >
      {media && (
        <div
          data-slot="post-card-media"
          className={cn("-mt-6 overflow-hidden rounded-t-[inherit] bg-muted", mediaClassName)}
        >
          {media}
        </div>
      )}
      <CardHeader>
        {featured && <Badge className="mb-2 w-fit">{featuredLabel}</Badge>}
        <CardTitleLink as={headingAs} href={href} className={titleClassName}>
          {title}
        </CardTitleLink>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {tags.length > 0 && (
        <CardContent className="relative z-10 flex flex-wrap gap-2">
          {tags.map((t) => (
            <Badge key={t.href} variant="secondary" asChild>
              <a href={t.href}>{t.tag}</a>
            </Badge>
          ))}
        </CardContent>
      )}
      <CardFooter className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <Avatar className="size-6">
          {showAvatar ? (
            <img
              ref={avatar.ref}
              src={author.avatar}
              alt=""
              width={24}
              height={24}
              onError={avatar.onError}
              className="aspect-square size-full object-cover"
            />
          ) : (
            <AvatarFallback className="text-[10px]">
              {initialsOf({ name: author.name, email: "" })}
            </AvatarFallback>
          )}
        </Avatar>
        <span>{author.name}</span>
        <span aria-hidden="true">·</span>
        <time dateTime={toISODate(date)}>{formatPostDate(date, dateLocale)}</time>
        <span aria-hidden="true">·</span>
        <span>{readingTime ?? `${readingMinutes} min read`}</span>
      </CardFooter>
    </Card>
  )
}

export type PageCardProps = {
  href: string
  title: string
  description: string
  /** The page's last update. */
  date: Date
  /** The words before the date, already worded ("Last updated"). */
  dateLabel: string
  /** The title's heading level: `h2` in a list (the default), `h3` under a section's own `h2`. */
  headingAs?: "h2" | "h3"
  /** The date's `Intl` locale. Defaults to en-US. */
  dateLocale?: string
  /** Merged onto the card. */
  className?: string
  /** Merged onto the title. */
  titleClassName?: string
}

/**
 * `PostCard`'s look for a page that is not a post — a title (linked, the whole card clickable),
 * its description and a labelled date ("Last updated <date>"), with no author, tags or reading
 * time. A sibling rather than a `PostCard` with optional fields, so the blog's cards keep their
 * required props and their markup (pinned in `post-card.test.tsx`).
 */
export function PageCard({
  href,
  title,
  description,
  date,
  dateLabel,
  headingAs = "h2",
  dateLocale,
  className,
  titleClassName,
}: PageCardProps) {
  return (
    <Card data-slot="page-card" className={cn(cardClassName, className)}>
      <CardHeader>
        <CardTitleLink as={headingAs} href={href} className={titleClassName}>
          {title}
        </CardTitleLink>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardFooter className="text-sm text-muted-foreground">
        <p>
          {dateLabel} <time dateTime={toISODate(date)}>{formatPostDate(date, dateLocale)}</time>
        </p>
      </CardFooter>
    </Card>
  )
}
