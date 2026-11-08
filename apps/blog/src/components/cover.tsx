import { cn } from "@repo/ui/lib/utils"
import { coverOf } from "../../content/media"

/**
 * A post's cover photo in a rounded frame, cropped to a wide 16:10 so portraits and landscapes sit
 * alike. A `/media/<name>-800.jpg` cover is served as WebP first, from the `.webp` beside it; any
 * other cover is a plain `<img>`. Above the fold, so it loads eagerly.
 */
export function Cover({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const photo = coverOf(src)
  const width = photo?.width ?? 1200
  const height = photo?.height ?? 630
  const img = (
    <img
      src={src}
      alt={alt}
      width={width}
      height={height}
      loading="eager"
      decoding="async"
      className="size-full object-cover object-[center_30%]"
    />
  )
  return (
    <div
      data-slot="post-cover"
      className={cn("aspect-[16/10] overflow-hidden rounded-4xl bg-muted", className)}
    >
      {photo ? (
        <picture className="contents">
          <source srcSet={photo.webp} type="image/webp" />
          {img}
        </picture>
      ) : (
        img
      )}
    </div>
  )
}
