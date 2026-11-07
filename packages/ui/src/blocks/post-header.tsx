"use client"

import { Avatar, AvatarFallback } from "@repo/ui/components/avatar"
import { Badge } from "@repo/ui/components/badge"
import { useImageFallback } from "@repo/ui/components/image-fallback"
import { initialsOf } from "@repo/ui/lib/initials"
import { formatPostDate, toISODate } from "@repo/ui/lib/post-date"

export type PostHeaderProps = {
  title: string
  description: string
  date: Date
  updated?: Date
  readingMinutes: number
  author: { name: string; avatar: string; href: string }
  tags: { tag: string; href: string }[]
  cover?: { src: string; alt: string }
}

/** The post page's header: tags, title, description, author, dates, reading time, cover image. */
export function PostHeader({
  title,
  description,
  date,
  updated,
  readingMinutes,
  author,
  tags,
  cover,
}: PostHeaderProps) {
  const avatar = useImageFallback(author.avatar)
  const showAvatar = Boolean(author.avatar) && !avatar.failed

  return (
    <header data-slot="post-header" className="flex flex-col gap-6">
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Badge key={t.href} variant="secondary" asChild>
              <a href={t.href}>{t.tag}</a>
            </Badge>
          ))}
        </div>
      )}
      <h1 className="text-balance text-3xl font-bold tracking-tight md:text-4xl">{title}</h1>
      <p className="text-balance text-lg text-muted-foreground">{description}</p>
      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <a href={author.href} className="flex items-center gap-2 hover:text-foreground">
          <Avatar className="size-8">
            {showAvatar ? (
              <img
                ref={avatar.ref}
                src={author.avatar}
                alt=""
                width={32}
                height={32}
                onError={avatar.onError}
                className="aspect-square size-full object-cover"
              />
            ) : (
              <AvatarFallback className="text-xs">
                {initialsOf({ name: author.name, email: "" })}
              </AvatarFallback>
            )}
          </Avatar>
          <span className="font-medium text-foreground">{author.name}</span>
        </a>
        <span aria-hidden="true">·</span>
        <time dateTime={toISODate(date)}>{formatPostDate(date)}</time>
        {updated && (
          <span className="text-xs">
            (Updated <time dateTime={toISODate(updated)}>{formatPostDate(updated)}</time>)
          </span>
        )}
        <span aria-hidden="true">·</span>
        <span>{readingMinutes} min read</span>
      </div>
      {cover && (
        <img
          src={cover.src}
          alt={cover.alt}
          width={1200}
          height={630}
          loading="eager"
          decoding="async"
          className="w-full rounded-xl border"
        />
      )}
    </header>
  )
}
