import { cn } from "@repo/ui/lib/utils"
import { coverOf } from "../../content/media"

type CoverImageProps = {
  src: string
  alt: string
  /** `eager` + `high` for the post page's cover (its LCP); `lazy` for the list cards. */
  priority?: boolean
  className?: string
}

/**
 * A cover photo filling its frame (`object-cover`). A `/media/<name>-800.jpg` cover is served as
 * WebP first, from the `.webp` beside it, at its own 800 px size; any other cover is a plain
 * `<img>`. Explicit width and height reserve its space before it loads.
 */
export function CoverImage({ src, alt, priority = false, className }: CoverImageProps) {
  const photo = coverOf(src)
  const img = (
    <img
      src={src}
      alt={alt}
      width={photo?.width ?? 1200}
      height={photo?.height ?? 630}
      {...(priority
        ? { loading: "eager" as const, fetchPriority: "high" as const }
        : { loading: "lazy" as const, decoding: "async" as const })}
      className={cn("size-full object-cover object-[center_30%]", className)}
    />
  )
  return photo ? (
    <picture className="contents">
      <source srcSet={photo.webp} type="image/webp" />
      {img}
    </picture>
  ) : (
    img
  )
}

/**
 * A post's cover photo in a rounded frame, cropped to a wide 16:10 so portraits and landscapes sit
 * alike. Above the fold and the page's LCP, so it loads eagerly and first.
 */
export function Cover({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div
      data-slot="post-cover"
      className={cn("aspect-[16/10] overflow-hidden rounded-4xl bg-muted", className)}
    >
      <CoverImage src={src} alt={alt} priority />
    </div>
  )
}
