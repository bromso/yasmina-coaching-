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
  headingAs: Title = "h2",
}: PostCardProps) {
  const avatar = useImageFallback(author.avatar)
  const showAvatar = Boolean(author.avatar) && !avatar.failed

  return (
    <Card
      data-slot="post-card"
      data-featured={featured ? "" : undefined}
      className={cn(
        "relative transition-colors hover:border-foreground/20",
        featured && "border-primary/40 bg-primary/5"
      )}
    >
      <CardHeader>
        {featured && <Badge className="mb-2 w-fit">Featured</Badge>}
        <Title data-slot="card-title" className="font-semibold text-xl leading-none">
          {/* The stretched link: `after:inset-0` positions relative to the `relative` Card
              above (the anchor itself stays static), so the whole card is clickable while
              staying valid HTML — no nested <a>. Tags below carry their own links and escape
              above this overlay with `relative z-10`. */}
          <a href={href} className="after:absolute after:inset-0 hover:underline">
            {title}
          </a>
        </Title>
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
        <time dateTime={toISODate(date)}>{formatPostDate(date)}</time>
        <span aria-hidden="true">·</span>
        <span>{readingMinutes} min read</span>
      </CardFooter>
    </Card>
  )
}
